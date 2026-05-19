# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
import os, logging
import jwt

logger = logging.getLogger()
logger.setLevel(logging.INFO)

COGNITO_CLIENT_ID = os.environ['COGNITO_CLIENT_ID']
COGNITO_USER_POOL_ID = os.environ['COGNITO_USER_POOL_ID']
AWS_REGION = os.environ.get('AWS_REGION', 'us-east-1')

JWKS_URL = f"https://cognito-idp.{AWS_REGION}.amazonaws.com/{COGNITO_USER_POOL_ID}/.well-known/jwks.json"
jwks_client = jwt.PyJWKClient(JWKS_URL, cache_keys=True)


def _deny(method_arn):
    return {'principalId': 'user', 'policyDocument': {'Version': '2012-10-17', 'Statement': [{'Action': 'execute-api:Invoke', 'Effect': 'Deny', 'Resource': method_arn}]}}


def handler(event, context):
    qs = event.get('queryStringParameters') or {}
    token = qs.get('token', '')
    method_arn = event.get('methodArn', '')

    try:
        signing_key = jwks_client.get_signing_key_from_jwt(token)
        claims = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            audience=COGNITO_CLIENT_ID,
            options={"require": ["exp", "aud"]},
        )
    except Exception as e:
        logger.info(f"Auth DENIED: {e}")
        return _deny(method_arn)

    email = claims.get('email', claims.get('sub', 'anonymous'))

    # Allow all routes on this API
    arn_parts = method_arn.split(':')
    region = arn_parts[3]
    account = arn_parts[4]
    api_gw = arn_parts[5].split('/')
    api_id = api_gw[0]
    stage = api_gw[1]
    resource_arn = f"arn:aws:execute-api:{region}:{account}:{api_id}/{stage}/*"

    logger.info(f"Auth ALLOWED: {email}")
    return {
        'principalId': email,
        'policyDocument': {'Version': '2012-10-17', 'Statement': [{'Action': 'execute-api:Invoke', 'Effect': 'Allow', 'Resource': resource_arn}]},
        'context': {'email': email}
    }
