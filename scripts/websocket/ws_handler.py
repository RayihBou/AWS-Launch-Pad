import json, os, boto3, re, time, uuid, logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)

agentcore = boto3.client('bedrock-agentcore', region_name='us-east-1')
ddb = boto3.resource('dynamodb', region_name='us-east-1').Table('launchpad-conversations-v2')
RUNTIME_ARN = os.environ.get('RUNTIME_ARN', '')
QUALIFIER = os.environ.get('QUALIFIER', 'default_endpoint')
MAX_HISTORY = 50

def strip_emojis(text):
    return re.sub(r'[\U0001F000-\U0001FFFF\u2600-\u27BF\u2B50\u2705\u274C\u26A0\u2714\u2716\u25AA-\u25FE\u2B06-\u2B07\u2934-\u2935\u23E9-\u23FA\u200D\uFE0F]+', '', text)

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
        ddb.update_item(Key={'userId': uid, 'conversationId': conv_id}, UpdateExpression=expr, ExpressionAttributeValues=vals)
    except Exception as e:
        logger.error(f"Save error: {e}")

def send_to_client(api_client, connection_id, data):
    try:
        api_client.post_to_connection(ConnectionId=connection_id, Data=json.dumps(data).encode())
    except Exception as e:
        logger.error(f"Send error: {e}")

def handler(event, context):
    route = event.get('requestContext', {}).get('routeKey', '')
    connection_id = event.get('requestContext', {}).get('connectionId', '')

    if route == '$connect':
        return {'statusCode': 200}

    if route == '$disconnect':
        return {'statusCode': 200}

    if route == 'sendMessage':
        # Get auth context from authorizer
        auth = event.get('requestContext', {}).get('authorizer', {})
        uid = auth.get('email', 'anonymous')
        role = auth.get('role', 'Viewer')
        token = auth.get('token', '')

        # Parse message
        body = json.loads(event.get('body', '{}'))
        text = body.get('input', {}).get('text', '')
        attachment = body.get('attachment')
        conv_id = body.get('conversationId', str(uuid.uuid4()))

        # API Gateway Management API client
        domain = event['requestContext']['domainName']
        stage = event['requestContext']['stage']
        api_client = boto3.client('apigatewaymanagementapi', endpoint_url=f'https://{domain}/{stage}')

        # Send thinking indicator
        send_to_client(api_client, connection_id, {'type': 'thinking'})

        try:
            history = load_history(uid, conv_id)
            history.append({'role': 'user', 'text': text})
            title = text[:60] if len(history) <= 1 else None

            agent_payload = {
                'input': {'text': text}, 'role': role,
                'history': history[-20:], 'token': token, 'actor_id': uid,
            }
            if attachment:
                agent_payload['attachment'] = attachment

            response = agentcore.invoke_agent_runtime(
                agentRuntimeArn=RUNTIME_ARN, qualifier=QUALIFIER,
                payload=json.dumps(agent_payload).encode(),
            )
            result = response.get('response', b'').read().decode() if hasattr(response.get('response', b''), 'read') else '{}'
            assistant_text = strip_emojis(json.loads(result).get('output', {}).get('text', ''))

            history.append({'role': 'assistant', 'text': assistant_text})
            save_history(uid, conv_id, history, title)

            send_to_client(api_client, connection_id, {
                'type': 'response',
                'output': {'text': assistant_text},
                'conversationId': conv_id,
            })
        except Exception as e:
            logger.error(f"Error: {e}")
            send_to_client(api_client, connection_id, {
                'type': 'error',
                'output': {'text': f'Error procesando la solicitud. Intenta de nuevo.'},
            })

        return {'statusCode': 200}

    return {'statusCode': 400}
