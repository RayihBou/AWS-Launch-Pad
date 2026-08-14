# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
import json
import os
import boto3
import base64
import logging
import time
import uuid

logger = logging.getLogger()
logger.setLevel(logging.INFO)

agentcore = boto3.client('bedrock-agentcore', region_name=os.environ.get('AWS_REGION', 'us-east-1'))
s3 = boto3.client('s3', region_name=os.environ.get('AWS_REGION', 'us-east-1'))
ddb = boto3.resource('dynamodb', region_name=os.environ.get('AWS_REGION', 'us-east-1')).Table(os.environ['CONVERSATIONS_TABLE'])
RUNTIME_ARN = os.environ['RUNTIME_ARN']
QUALIFIER = os.environ.get('QUALIFIER', 'default_endpoint')
UPLOADS_BUCKET = os.environ['UPLOADS_BUCKET']
MAX_HISTORY = 50

def get_user(event):
    """Return (uid, token) for the caller.

    The uid comes from the JWT claims already validated by the HTTP API Cognito authorizer.
    The raw bearer is also returned because the Runtime needs it to open the MCP Gateway:
    the AgentCore Gateway is configured with CUSTOM_JWT and allowedAudience =
    userPoolClientId, so the bearer MUST be the Cognito ID token and not the access token,
    since only the ID token carries the 'aud' claim validated against allowedAudience.
    """
    claims = event.get('requestContext', {}).get('authorizer', {}).get('jwt', {}).get('claims', {})
    uid = claims.get('email', claims.get('sub', 'anonymous'))
    # HTTP API v2 lowercases header names
    headers = event.get('headers') or {}
    auth_header = headers.get('authorization') or headers.get('Authorization') or ''
    token = auth_header[7:] if auth_header[:7].lower() == 'bearer ' else auth_header
    return uid, token

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
    method = event.get('requestContext', {}).get('http', {}).get('method', 'POST')
    path = event.get('requestContext', {}).get('http', {}).get('path', '')
    uid, token = get_user(event)
    qs = event.get('queryStringParameters') or {}
    conv_id = qs.get('conversationId', '')

    # GET /upload-url?filename=X&contentType=Y - generate presigned PUT URL
    if method == 'GET' and '/upload-url' in path:
        filename = qs.get('filename', 'file')
        content_type = qs.get('contentType', 'application/octet-stream')
        s3_key = f"uploads/{uid}/{uuid.uuid4()}/{filename}"
        url = s3.generate_presigned_url('put_object', Params={
            'Bucket': UPLOADS_BUCKET, 'Key': s3_key, 'ContentType': content_type,
        }, ExpiresIn=300)
        return {'statusCode': 200, 'body': json.dumps({'uploadUrl': url, 's3Key': s3_key})}

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
            'history': history[-20:],
            'actor_id': uid,
            # Forwarded so the Runtime can authenticate against the MCP Gateway. On this HTTP
            # fallback route the bearer is validated per request by the Cognito JWT authorizer,
            # so it is always fresh (unlike the WebSocket authorizer, which only runs on
            # $connect and therefore freezes the token at connect time).
            'token': token,
        }
        if attachment:
            agent_payload['attachment'] = attachment

        response = agentcore.invoke_agent_runtime(
            agentRuntimeArn=RUNTIME_ARN, qualifier=QUALIFIER,
            payload=json.dumps(agent_payload).encode(),
        )
        result = response.get('response', b'').read().decode() if hasattr(response.get('response', b''), 'read') else '{}'
        result_data = json.loads(result)
        assistant_text = result_data.get('output', {}).get('text', '')

        # Same rule as the WebSocket route: a turn the guardrail blocked is not persisted, so the
        # offending text cannot come back as history and re-trigger the guardrail on later turns.
        if result_data.get('blocked'):
            logger.warning(f"Guardrail blocked turn for {uid}/{conv_id}: not saving to history")
        else:
            history.append({'role': 'assistant', 'text': assistant_text})
            save_history(uid, conv_id, history, title)

        # Include conversationId in response
        result_data['conversationId'] = conv_id
        return {'statusCode': 200, 'body': json.dumps(result_data)}
    except Exception as e:
        logger.error(f"Chat error: {e}")
        return {'statusCode': 200, 'body': json.dumps({'output': {'text': 'Error interno. Intenta de nuevo.'}})}
