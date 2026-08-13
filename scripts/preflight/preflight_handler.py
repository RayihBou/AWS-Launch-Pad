# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
"""CloudFormation Custom Resource: Bedrock model access preflight check.

Runs before the AgentCore Runtime is created so the stack fails fast with an
actionable message instead of deploying a runtime that cannot invoke the model.

Flow:
  1. Read ModelId / Region from ResourceProperties.
  2. Derive the base model id (strip the us. / eu. / au. / global. inference profile prefix).
  3. Check access with bedrock:GetFoundationModelAvailability.
  4. Optionally auto-enable access (Anthropic FTU form + model agreement) when
     AcceptAnthropicTerms is true and the company details are present.
  5. Wait for propagation with exponential backoff (up to 3 minutes).
  6. Confirm real invocation with a minimal bedrock-runtime Converse ping.
  7. On failure, respond FAILED with the exact AWS CLI command to fix it.
  8. On Delete, respond SUCCESS without doing anything.
"""
import base64
import json
import logging
import os
import time
import urllib.request

import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Inference profile prefixes that must be stripped to get the base model id.
INFERENCE_PROFILE_PREFIXES = ('us.', 'eu.', 'au.', 'global.')

# Total time to wait for entitlement propagation. AWS documents up to ~2 minutes.
MAX_PROPAGATION_WAIT_SECONDS = 180
INITIAL_BACKOFF_SECONDS = 5
MAX_BACKOFF_SECONDS = 30

# Values considered "access granted" by GetFoundationModelAvailability.
AVAILABLE = 'AVAILABLE'
AUTHORIZED = 'AUTHORIZED'


# --------------------------------------------------------------------------- #
# CloudFormation response
# --------------------------------------------------------------------------- #
def send(event, context, status, reason='', data=None):
    """Send the response back to the CloudFormation pre-signed S3 URL."""
    body = json.dumps({
        'Status': status,
        'Reason': (reason or 'See CloudWatch logs: ' + context.log_stream_name)[:4000],
        'PhysicalResourceId': event.get('PhysicalResourceId', context.log_stream_name),
        'StackId': event['StackId'],
        'RequestId': event['RequestId'],
        'LogicalResourceId': event['LogicalResourceId'],
        'Data': data or {},
    }).encode()
    logger.info(f"Responding {status} to CloudFormation: {reason[:500]}")
    try:
        urllib.request.urlopen(urllib.request.Request(
            event['ResponseURL'], data=body, headers={'Content-Type': ''}, method='PUT'))
    except Exception as e:  # never raise from the responder itself
        logger.error(f"Failed to send CloudFormation response: {e}")


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
def base_model_id(model_id):
    """Strip the inference profile prefix (us. / eu. / au. / global.)."""
    for prefix in INFERENCE_PROFILE_PREFIXES:
        if model_id.startswith(prefix):
            return model_id[len(prefix):]
    return model_id


def is_truthy(value):
    """CloudFormation passes booleans as strings."""
    return str(value).strip().lower() in ('true', 'yes', '1')


def enable_command(base_id, region):
    """Concrete AWS CLI command the operator can run to grant access."""
    return (
        f"aws bedrock create-foundation-model-agreement --region {region} "
        f"--model-id {base_id} --offer-token \"$(aws bedrock list-foundation-model-agreement-offers "
        f"--region {region} --model-id {base_id} --query 'offers[0].offerToken' --output text)\""
    )


def availability_summary(availability):
    """Flatten the GetFoundationModelAvailability response for logs and messages."""
    agreement = availability.get('agreementAvailability') or {}
    return {
        'authorizationStatus': availability.get('authorizationStatus'),
        'entitlementAvailability': availability.get('entitlementAvailability'),
        'agreementAvailability': agreement.get('status'),
        'agreementError': agreement.get('errorMessage'),
        'regionAvailability': availability.get('regionAvailability'),
    }


def get_availability(bedrock, base_id):
    """Call GetFoundationModelAvailability, normalising the interesting errors."""
    try:
        return bedrock.get_foundation_model_availability(modelId=base_id)
    except ClientError as e:
        code = e.response['Error']['Code']
        if code == 'AccessDeniedException':
            raise PreflightError(
                f"The deployment role is not allowed to call bedrock:GetFoundationModelAvailability "
                f"for '{base_id}'. Attach that permission to the CloudFormation execution role, "
                f"or grant model access manually in the console "
                f"(Amazon Bedrock > Model access) and redeploy."
            ) from e
        if code == 'ValidationException':
            raise PreflightError(
                f"Bedrock rejected the model id '{base_id}' as invalid in this region. "
                f"Verify the -c modelId value. List valid ids with: "
                f"aws bedrock list-foundation-models --region {bedrock.meta.region_name} "
                f"--query 'modelSummaries[].modelId'"
            ) from e
        if code == 'ThrottlingException':
            raise ThrottledError(str(e)) from e
        raise


def access_granted(availability):
    """True when every availability dimension reports access."""
    s = availability_summary(availability)
    return (
        s['authorizationStatus'] == AUTHORIZED
        and s['entitlementAvailability'] == AVAILABLE
        and s['agreementAvailability'] == AVAILABLE
        and s['regionAvailability'] == AVAILABLE
    )


def missing_reasons(availability, base_id, region):
    """Explain, dimension by dimension, exactly what is missing."""
    s = availability_summary(availability)
    reasons = []
    if s['regionAvailability'] != AVAILABLE:
        reasons.append(
            f"the model is not offered in {region} (regionAvailability="
            f"{s['regionAvailability']}); deploy in a region where it is offered, e.g. us-east-1")
    if s['authorizationStatus'] != AUTHORIZED:
        reasons.append(
            f"the account is not authorized for this model (authorizationStatus="
            f"{s['authorizationStatus']}); contact AWS Support to authorize the account")
    if s['agreementAvailability'] != AVAILABLE:
        detail = f" ({s['agreementError']})" if s['agreementError'] else ''
        reasons.append(
            f"the model agreement / end-user terms have not been accepted "
            f"(agreementAvailability={s['agreementAvailability']}){detail}")
    if s['entitlementAvailability'] != AVAILABLE:
        reasons.append(
            f"the account has no entitlement yet (entitlementAvailability="
            f"{s['entitlementAvailability']}); access may still be propagating")
    return reasons


# --------------------------------------------------------------------------- #
# Errors
# --------------------------------------------------------------------------- #
class PreflightError(Exception):
    """Actionable failure that should be surfaced verbatim to CloudFormation."""


class ThrottledError(Exception):
    """Bedrock throttled the call; the caller decides whether to retry."""


# --------------------------------------------------------------------------- #
# Access enablement (Anthropic first-time-use form + model agreement)
# --------------------------------------------------------------------------- #
def submit_anthropic_use_case(bedrock, props):
    """Submit the Anthropic FTU form required before accepting the agreement."""
    form = {
        'companyName': props['CompanyName'],
        'companyWebsite': props['CompanyWebsite'],
        'intendedUsers': str(props['IntendedUsers']),
        'industryOption': props['IndustryOption'],
        'useCases': props['UseCases'],
    }
    encoded = base64.b64encode(json.dumps(form).encode())
    logger.info("Submitting Anthropic use case form (PutUseCaseForModelAccess)")
    try:
        bedrock.put_use_case_for_model_access(formData=encoded)
    except ClientError as e:
        code = e.response['Error']['Code']
        if code == 'AccessDeniedException':
            raise PreflightError(
                "The deployment role is not allowed to call bedrock:PutUseCaseForModelAccess. "
                "Grant that permission, or accept the Anthropic terms manually in the console "
                "(Amazon Bedrock > Model access > Available to request), then redeploy."
            ) from e
        if code == 'ValidationException':
            raise PreflightError(
                f"Bedrock rejected the Anthropic use case form: {e.response['Error']['Message']}. "
                f"Check CompanyName, CompanyWebsite (must be a full URL), IntendedUsers, "
                f"IndustryOption and UseCases."
            ) from e
        if code == 'ThrottlingException':
            raise ThrottledError(str(e)) from e
        raise


def accept_model_agreement(bedrock, base_id, region):
    """Fetch the offer token and create the foundation model agreement."""
    try:
        offers = bedrock.list_foundation_model_agreement_offers(modelId=base_id).get('offers', [])
    except ClientError as e:
        code = e.response['Error']['Code']
        if code == 'AccessDeniedException':
            raise PreflightError(
                f"The deployment role is not allowed to call "
                f"bedrock:ListFoundationModelAgreementOffers for '{base_id}'. "
                f"Grant it, or run manually: {enable_command(base_id, region)}"
            ) from e
        if code == 'ValidationException':
            raise PreflightError(
                f"No agreement offers can be listed for '{base_id}' in {region}: "
                f"{e.response['Error']['Message']}"
            ) from e
        if code == 'ThrottlingException':
            raise ThrottledError(str(e)) from e
        raise

    offer_token = next((o.get('offerToken') for o in offers if o.get('offerToken')), None)
    if not offer_token:
        raise PreflightError(
            f"Bedrock returned no agreement offer for '{base_id}' in {region}. "
            f"Request access manually in the console (Amazon Bedrock > Model access) "
            f"or run: {enable_command(base_id, region)}"
        )

    logger.info(f"Creating foundation model agreement for {base_id}")
    try:
        bedrock.create_foundation_model_agreement(modelId=base_id, offerToken=offer_token)
    except ClientError as e:
        code = e.response['Error']['Code']
        if code == 'AccessDeniedException':
            raise PreflightError(
                f"The deployment role is not allowed to call "
                f"bedrock:CreateFoundationModelAgreement for '{base_id}'. "
                f"Grant it, or run manually: {enable_command(base_id, region)}"
            ) from e
        if code == 'ValidationException':
            raise PreflightError(
                f"Bedrock rejected the agreement for '{base_id}': "
                f"{e.response['Error']['Message']}. Run manually: "
                f"{enable_command(base_id, region)}"
            ) from e
        if code == 'ThrottlingException':
            raise ThrottledError(str(e)) from e
        raise


def wait_for_access(bedrock, base_id, region):
    """Poll GetFoundationModelAvailability with exponential backoff.

    Entitlement propagation can take up to ~2 minutes after the agreement is
    created, so keep polling for up to MAX_PROPAGATION_WAIT_SECONDS.
    """
    deadline = time.time() + MAX_PROPAGATION_WAIT_SECONDS
    backoff = INITIAL_BACKOFF_SECONDS
    last = None
    attempt = 0
    while True:
        attempt += 1
        try:
            last = get_availability(bedrock, base_id)
            logger.info(f"Availability attempt {attempt}: {availability_summary(last)}")
            if access_granted(last):
                return last
        except ThrottledError as e:
            logger.warning(f"Throttled by Bedrock on attempt {attempt}: {e}")
        if time.time() + backoff >= deadline:
            return last
        time.sleep(backoff)
        backoff = min(backoff * 2, MAX_BACKOFF_SECONDS)


# --------------------------------------------------------------------------- #
# Invocation ping
# --------------------------------------------------------------------------- #
def ping_model(region, model_id):
    """Minimal Converse call to prove the model is actually invocable."""
    runtime = boto3.client('bedrock-runtime', region_name=region)
    logger.info(f"Pinging {model_id} with Converse")
    try:
        runtime.converse(
            modelId=model_id,
            messages=[{'role': 'user', 'content': [{'text': 'ping'}]}],
            inferenceConfig={'maxTokens': 10},
        )
    except ClientError as e:
        code = e.response['Error']['Code']
        message = e.response['Error']['Message']
        if code == 'AccessDeniedException':
            raise PreflightError(
                f"Model access for '{model_id}' is not effective in {region}: {message}. "
                f"Enable it with: {enable_command(base_model_id(model_id), region)} "
                f"(or Amazon Bedrock > Model access in the console), then redeploy."
            ) from e
        if code == 'ValidationException':
            raise PreflightError(
                f"Bedrock rejected the invocation of '{model_id}' in {region}: {message}. "
                f"If this is an inference profile id, confirm it exists in this region with: "
                f"aws bedrock list-inference-profiles --region {region} "
                f"--query \"inferenceProfileSummaries[?inferenceProfileId=='{model_id}']\""
            ) from e
        if code == 'ThrottlingException':
            # Throttling proves the invocation was authorized, so treat it as success.
            logger.warning(f"Converse ping throttled but authorized: {message}")
            return
        raise PreflightError(
            f"Converse ping to '{model_id}' in {region} failed with {code}: {message}"
        ) from e


# --------------------------------------------------------------------------- #
# Handler
# --------------------------------------------------------------------------- #
def handler(event, context):
    request_type = event.get('RequestType')
    logger.info(f"RequestType={request_type}")

    if request_type == 'Delete':
        send(event, context, 'SUCCESS', 'Delete: nothing to do')
        return

    props = event.get('ResourceProperties', {})
    model_id = (props.get('ModelId') or '').strip()
    region = (props.get('Region') or os.environ.get('AWS_REGION') or 'us-east-1').strip()

    if not model_id:
        send(event, context, 'FAILED',
             'ModelId is required. Redeploy with -c modelId=<bedrock model or inference profile id>.')
        return

    base_id = base_model_id(model_id)
    logger.info(f"Preflight for modelId={model_id} baseModelId={base_id} region={region}")

    try:
        bedrock = boto3.client('bedrock', region_name=region)

        availability = get_availability(bedrock, base_id)
        logger.info(f"Initial availability: {availability_summary(availability)}")

        if not access_granted(availability):
            reasons = missing_reasons(availability, base_id, region)
            accept = is_truthy(props.get('AcceptAnthropicTerms', 'false'))
            company_fields = ('CompanyName', 'CompanyWebsite', 'IntendedUsers',
                              'IndustryOption', 'UseCases')
            missing_fields = [f for f in company_fields if not str(props.get(f, '')).strip()]

            if not accept:
                raise PreflightError(
                    f"Model access missing for '{base_id}' in {region}: {'; '.join(reasons)}. "
                    f"Either accept the terms automatically by redeploying with "
                    f"-c acceptAnthropicTerms=true plus the company details "
                    f"(companyName, companyWebsite, intendedUsers, industryOption, useCases), "
                    f"or grant access manually with: {enable_command(base_id, region)}"
                )
            if missing_fields:
                raise PreflightError(
                    f"Model access missing for '{base_id}' in {region}: {'; '.join(reasons)}. "
                    f"AcceptAnthropicTerms is true but these properties are empty: "
                    f"{', '.join(missing_fields)}. Redeploy providing them, or grant access "
                    f"manually with: {enable_command(base_id, region)}"
                )

            # Auto-enable: Anthropic FTU form, then the model agreement.
            try:
                submit_anthropic_use_case(bedrock, props)
                accept_model_agreement(bedrock, base_id, region)
            except ThrottledError as e:
                raise PreflightError(
                    f"Bedrock throttled the access enablement calls for '{base_id}' in {region} "
                    f"({e}). Retry the deployment, or grant access manually with: "
                    f"{enable_command(base_id, region)}"
                ) from e

            availability = wait_for_access(bedrock, base_id, region)
            if not availability or not access_granted(availability):
                reasons = (missing_reasons(availability, base_id, region)
                           if availability else ['availability could not be read'])
                raise PreflightError(
                    f"Model access for '{base_id}' in {region} did not become active within "
                    f"{MAX_PROPAGATION_WAIT_SECONDS}s: {'; '.join(reasons)}. "
                    f"Check status with: aws bedrock get-foundation-model-availability "
                    f"--region {region} --model-id {base_id} — then redeploy."
                )

        # Real invocation check with the full model / inference profile id.
        ping_model(region, model_id)

        send(event, context, 'SUCCESS',
             f"Bedrock model '{model_id}' is accessible and invocable in {region}",
             {'ModelId': model_id, 'BaseModelId': base_id, 'Region': region})

    except PreflightError as e:
        logger.error(f"Preflight failed: {e}")
        send(event, context, 'FAILED', str(e))
    except ClientError as e:
        code = e.response['Error']['Code']
        message = e.response['Error']['Message']
        logger.error(f"Unexpected Bedrock error {code}: {message}")
        send(event, context, 'FAILED',
             f"Bedrock preflight failed for '{model_id}' in {region} with {code}: {message}. "
             f"Verify access with: aws bedrock get-foundation-model-availability "
             f"--region {region} --model-id {base_id}")
    except Exception as e:  # noqa: BLE001 - CloudFormation must always get a response
        logger.exception("Preflight crashed")
        send(event, context, 'FAILED',
             f"Bedrock preflight crashed for '{model_id}' in {region}: {e}. "
             f"See CloudWatch logs: {context.log_stream_name}")
