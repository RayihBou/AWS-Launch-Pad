import json
import os
import boto3
import base64
import logging
import time
import uuid

logger = logging.getLogger()
logger.setLevel(logging.INFO)

agentcore = boto3.client('bedrock-agentcore', region_name='us-east-1')
ddb = boto3.resource('dynamodb', region_name='us-east-1').Table('launchpad-conversations-v2')
RUNTIME_ARN = os.environ.get('RUNTIME_ARN', '')
QUALIFIER = os.environ.get('QUALIFIER', 'default_endpoint')
MAX_HISTORY = 50

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

def load_history(uid, conv_id):
    try:
        r = ddb.get_item(Key={'userId': uid, 'conversationId': conv_id})
        return r.get('Item', {}).get('messages', [])
    except: return []

def save_history(uid, conv_id, msgs, title=None):
    try:
        expr = 'SET messages = :m, updatedAt = :u'
        vals = {':m': msgs[-MAX_HISTORY:], ':u': int(time.time())}
        if title:
            expr += ', title = :t'
            vals[':t'] = title
        ddb.update_item(
            Key={'userId': uid, 'conversationId': conv_id},
            UpdateExpression=expr,
            ExpressionAttributeValues=vals,
        )
    except Exception as e:
        logger.error(f"Save error: {e}")

def list_conversations(uid):
    try:
        r = ddb.query(
            KeyConditionExpression='userId = :uid',
            ExpressionAttributeValues={':uid': uid},
            ProjectionExpression='conversationId, title, updatedAt',
            ScanIndexForward=False,
        )
        items = r.get('Items', [])
        # Convert Decimal to int for JSON serialization
        for item in items:
            if 'updatedAt' in item:
                item['updatedAt'] = int(item['updatedAt'])
        return items
    except: return []

def handler(event, context):
    headers = event.get('headers', {})
    method = event.get('requestContext', {}).get('http', {}).get('method', 'POST')
    path = event.get('requestContext', {}).get('http', {}).get('path', '')
    uid, role, token = get_user(headers)
    qs = event.get('queryStringParameters') or {}
    conv_id = qs.get('conversationId', '')

    # GET /conversations - list all conversations for user
    if method == 'GET' and '/conversations' in path:
        convs = list_conversations(uid)
        return {'statusCode': 200, 'body': json.dumps({'conversations': convs})}

    # GET /history?conversationId=X - load specific conversation
    if method == 'GET':
        if not conv_id:
            return {'statusCode': 200, 'body': json.dumps({'messages': []})}
        return {'statusCode': 200, 'body': json.dumps({'messages': load_history(uid, conv_id)})}

    # DELETE /history?conversationId=X - delete specific conversation
    if method == 'DELETE':
        if conv_id:
            try:
                ddb.delete_item(Key={'userId': uid, 'conversationId': conv_id})
            except Exception as e:
                logger.error(f"Delete error: {e}")
        return {'statusCode': 200, 'body': json.dumps({'ok': True})}

    # PATCH /history?conversationId=X - rename conversation
    if method == 'PATCH':
        try:
            body = event.get('body', '{}')
            if event.get('isBase64Encoded'):
                body = base64.b64decode(body).decode()
            payload = json.loads(body) if isinstance(body, str) else body
            title = payload.get('title', '')
            if conv_id and title:
                ddb.update_item(
                    Key={'userId': uid, 'conversationId': conv_id},
                    UpdateExpression='SET title = :t',
                    ExpressionAttributeValues={':t': title},
                )
        except Exception as e:
            logger.error(f"Patch error: {e}")
        return {'statusCode': 200, 'body': json.dumps({'ok': True})}

    # POST /chat
    try:
        body = event.get('body', '{}')
        if event.get('isBase64Encoded'):
            body = base64.b64decode(body).decode()
        payload = json.loads(body) if isinstance(body, str) else body
        text = payload.get('input', {}).get('text', '')
        attachment = payload.get('attachment')
        conv_id = payload.get('conversationId', str(uuid.uuid4()))

        history = load_history(uid, conv_id)
        history.append({'role': 'user', 'text': text})

        # Generate title from first message
        title = text[:60] if len(history) <= 1 else None

        agent_payload = {
            'input': {'text': text},
            'role': role,
            'history': history[-20:],
            'token': token,
            'actor_id': uid,
        }
        if attachment:
            agent_payload['attachment'] = attachment

        response = agentcore.invoke_agent_runtime(
            agentRuntimeArn=RUNTIME_ARN, qualifier=QUALIFIER,
            payload=json.dumps(agent_payload).encode(),
        )
        result = response.get('response', b'').read().decode() if hasattr(response.get('response', b''), 'read') else '{}'
        assistant_text = json.loads(result).get('output', {}).get('text', '')

        history.append({'role': 'assistant', 'text': assistant_text})
        save_history(uid, conv_id, history, title)

        # Include conversationId in response
        result_data = json.loads(result)
        result_data['conversationId'] = conv_id
        return {'statusCode': 200, 'body': json.dumps(result_data)}
    except Exception as e:
        logger.error(f"Error: {e}")
        return {'statusCode': 200, 'body': json.dumps({'output': {'text': f'Error: {e}'}})}
