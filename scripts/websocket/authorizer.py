import json, os, base64, time

COGNITO_CLIENT_ID = os.environ.get('COGNITO_CLIENT_ID', '4n7t60v90bf7s7r0us11qklolo')

def decode_jwt(token):
    try:
        p = token.split('.')[1]
        p += '=' * (4 - len(p) % 4)
        claims = json.loads(base64.b64decode(p))
        if claims.get('exp', 0) < time.time():
            return None
        if claims.get('aud') != COGNITO_CLIENT_ID and claims.get('client_id') != COGNITO_CLIENT_ID:
            return None
        return claims
    except:
        return None

def handler(event, context):
    token = event.get('queryStringParameters', {}).get('token', '')
    claims = decode_jwt(token)
    if not claims:
        return {'isAuthorized': False}
    email = claims.get('email', claims.get('sub', 'anonymous'))
    groups = claims.get('cognito:groups', [])
    role = 'Operator' if 'Operator' in groups else 'Viewer'
    return {
        'isAuthorized': True,
        'context': {'email': email, 'role': role, 'token': token}
    }
