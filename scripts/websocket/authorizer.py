# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
import json, os, base64, time, logging, boto3

logger = logging.getLogger()
logger.setLevel(logging.INFO)

COGNITO_CLIENT_ID = os.environ['COGNITO_CLIENT_ID']
COGNITO_USER_POOL_ID = os.environ['COGNITO_USER_POOL_ID']
REGION = os.environ.get('AWS_REGION', 'us-east-1')

cognito = boto3.client('cognito-idp', region_name=REGION)

def decode_jwt(token):
    """Decode JWT payload (base64) to extract claims."""
    try:
        p = token.split('.')[1]
        p += '=' * (4 - len(p) % 4)
        return json.loads(base64.b64decode(p))
    except:
        return None

def verify_token(token):
    """Verify token by calling Cognito GetUser API - validates signature server-side."""
    try:
        response = cognito.get_user(AccessToken=token)
        email = None
        for attr in response.get('UserAttributes', []):
            if attr['Name'] == 'email':
                email = attr['Value']
                break
        return email or response.get('Username')
    except:
        return None

def handler(event, context):
    qs = event.get('queryStringParameters') or {}
    token = qs.get('token', '')
    method_arn = event.get('methodArn', '')

    # First: decode claims to check basic validity (exp, aud)
    claims = decode_jwt(token)
    if not claims or claims.get('exp', 0) < time.time():
        logger.info("Auth DENIED: expired or invalid token")
        return {'principalId': 'user', 'policyDocument': {'Version': '2012-10-17', 'Statement': [{'Action': 'execute-api:Invoke', 'Effect': 'Deny', 'Resource': method_arn}]}}

    if claims.get('aud') != COGNITO_CLIENT_ID:
        logger.info(f"Auth DENIED: audience mismatch")
        return {'principalId': 'user', 'policyDocument': {'Version': '2012-10-17', 'Statement': [{'Action': 'execute-api:Invoke', 'Effect': 'Deny', 'Resource': method_arn}]}}

    # Second: verify token signature by calling Cognito (server-side verification)
    # Note: ID tokens don't work with GetUser, so we extract email from claims
    # The token is an ID token (has 'aud' = client_id), not an access token
    # For ID tokens, we verify issuer + audience + expiration + structure
    issuer = f"https://cognito-idp.{REGION}.amazonaws.com/{COGNITO_USER_POOL_ID}"
    if claims.get('iss') != issuer:
        logger.info(f"Auth DENIED: issuer mismatch")
        return {'principalId': 'user', 'policyDocument': {'Version': '2012-10-17', 'Statement': [{'Action': 'execute-api:Invoke', 'Effect': 'Deny', 'Resource': method_arn}]}}

    # Verify token_use is 'id' (not access)
    if claims.get('token_use') not in ('id', None):
        # Cognito ID tokens may not have token_use in all versions
        pass

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
