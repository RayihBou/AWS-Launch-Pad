import json, os, base64, time, logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)

COGNITO_CLIENT_ID = os.environ.get('COGNITO_CLIENT_ID', '4n7t60v90bf7s7r0us11qklolo')

def decode_jwt(token):
    try:
        p = token.split('.')[1]
        p += '=' * (4 - len(p) % 4)
        return json.loads(base64.b64decode(p))
    except:
        return None

def handler(event, context):
    qs = event.get('queryStringParameters') or {}
    token = qs.get('token', '')
    method_arn = event.get('methodArn', '')
    claims = decode_jwt(token)

    if not claims or claims.get('exp', 0) < time.time():
        logger.info("Auth DENIED")
        return {'principalId': 'user', 'policyDocument': {'Version': '2012-10-17', 'Statement': [{'Action': 'execute-api:Invoke', 'Effect': 'Deny', 'Resource': method_arn}]}}

    if claims.get('aud') != COGNITO_CLIENT_ID:
        logger.info(f"Audience mismatch: {claims.get('aud')}")
        return {'principalId': 'user', 'policyDocument': {'Version': '2012-10-17', 'Statement': [{'Action': 'execute-api:Invoke', 'Effect': 'Deny', 'Resource': method_arn}]}}

    email = claims.get('email', claims.get('sub', 'anonymous'))
    groups = claims.get('cognito:groups', [])
    role = 'Operator' if 'Operator' in groups else 'Viewer'
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
        'context': {'email': email, 'role': role, 'token': token}
    }
