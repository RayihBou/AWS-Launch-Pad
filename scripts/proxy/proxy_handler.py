import json
import os
import boto3
import base64
import logging
import time

logger = logging.getLogger()
logger.setLevel(logging.INFO)

agentcore = boto3.client('bedrock-agentcore', region_name='us-east-1')
ddb = boto3.resource('dynamodb', region_name='us-east-1').Table('launchpad-conversations')
RUNTIME_ARN = os.environ.get('RUNTIME_ARN', '')
QUALIFIER = os.environ.get('QUALIFIER', 'default_endpoint')
MAX_HISTORY = 20

def decode_jwt(token):
    try:
        p = token.split('.')[1]
        p += '=' * (4 - len(p) % 4)
        return json.loads(base64.b64decode(p))
    except: return {}

def get_user(headers):
    auth = headers.get('authorization', '')
    token = auth.replace('Bearer ', '') if auth.startswith('Bearer ') else auth
    claims = decode_jwt(token)
    uid = claims.get('email', claims.get('sub', 'anonymous'))
    groups = claims.get('cognito:groups', [])
    role = 'Operator' if 'Operator' in groups else 'Viewer'
    return uid, role, token

def load_history(uid):
    try:
        r = ddb.get_item(Key={'userId': uid})
        return r.get('Item', {}).get('messages', [])
    except: return []

def save_history(uid, msgs):
    try:
        ddb.put_item(Item={'userId': uid, 'messages': msgs[-MAX_HISTORY:], 'updatedAt': int(time.time())})
    except Exception as e:
        logger.error(f"Save error: {e}")

def handler(event, context):
    headers = event.get('headers', {})
    method = event.get('requestContext', {}).get('http', {}).get('method', 'POST')
    uid, role, token = get_user(headers)

    # GET /history - return saved conversation
    if method == 'GET':
        history = load_history(uid)
        return {'statusCode': 200, 'body': json.dumps({'messages': history})}

    # POST /chat - process message
    try:
        body = event.get('body', '{}')
        if event.get('isBase64Encoded'):
            body = base64.b64decode(body).decode()
        payload = json.loads(body) if isinstance(body, str) else body
        text = payload.get('input', {}).get('text', '')

        history = load_history(uid)
        history.append({'role': 'user', 'text': text})

        response = agentcore.invoke_agent_runtime(
            agentRuntimeArn=RUNTIME_ARN, qualifier=QUALIFIER,
            payload=json.dumps({'input': {'text': text}, 'role': role, 'history': history[-MAX_HISTORY:], 'token': token}).encode(),
        )
        result = response.get('response', b'').read().decode() if hasattr(response.get('response', b''), 'read') else '{}'
        assistant_text = json.loads(result).get('output', {}).get('text', '')

        history.append({'role': 'assistant', 'text': assistant_text})
        save_history(uid, history)

        return {'statusCode': 200, 'body': result}
    except Exception as e:
        logger.error(f"Error: {e}")
        return {'statusCode': 200, 'body': json.dumps({'output': {'text': f'Error: {e}'}})}
