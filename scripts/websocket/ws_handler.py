import json, os, boto3, re, time, uuid, logging, base64
from threading import Thread, Event

logger = logging.getLogger()
logger.setLevel(logging.INFO)

agentcore = boto3.client('bedrock-agentcore', region_name='us-east-1')
s3 = boto3.client('s3', region_name='us-east-1')
ddb = boto3.resource('dynamodb', region_name='us-east-1').Table('launchpad-conversations-v2')
RUNTIME_ARN = os.environ.get('RUNTIME_ARN', '')
QUALIFIER = os.environ.get('QUALIFIER', 'default_endpoint')
UPLOADS_BUCKET = os.environ.get('UPLOADS_BUCKET', 'launchpad-uploads-302263078976')
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

PROGRESS_MESSAGES = [
    'Conectando con herramientas de AWS...',
    'Consultando servicios de tu cuenta...',
    'Recopilando informacion...',
    'Procesando resultados...',
    'Generando respuesta detallada...',
    'Aun trabajando, consulta compleja...',
    'Casi listo, finalizando analisis...',
]

def heartbeat(domain, stage, connection_id, stop_event):
    """Send progress messages every 5s until stop_event is set."""
    # Create own client (boto3 clients aren't thread-safe)
    client = boto3.client('apigatewaymanagementapi', endpoint_url=f'https://{domain}/{stage}')
    i = 0
    while not stop_event.wait(5):
        msg = PROGRESS_MESSAGES[min(i, len(PROGRESS_MESSAGES) - 1)]
        try:
            client.post_to_connection(
                ConnectionId=connection_id,
                Data=json.dumps({'type': 'status', 'message': msg}).encode()
            )
            logger.info(f"Heartbeat sent: {msg}")
        except Exception as e:
            logger.error(f"Heartbeat error: {e}")
            break
        i += 1

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
        send_to_client(api_client, connection_id, {'type': 'status', 'message': 'Cargando historial...'})

        try:
            history = load_history(uid, conv_id)
            history.append({'role': 'user', 'text': text})
            title = text[:60] if len(history) <= 1 else None

            agent_payload = {
                'input': {'text': text},
                'history': history[-20:], 'token': token, 'actor_id': uid,
            }
            logger.info(f"Invoking agent: actor_id={uid}, text={text[:50]}, history_len={len(history)}, has_attachment={attachment is not None}")
            if attachment:
                s3_key = attachment.get('s3Key')
                if s3_key:
                    try:
                        logger.info(f"Downloading from S3: {UPLOADS_BUCKET}/{s3_key}")
                        obj = s3.get_object(Bucket=UPLOADS_BUCKET, Key=s3_key)
                        file_bytes = obj['Body'].read()
                        att_type = attachment.get('type', 'application/octet-stream')
                        att_name = attachment.get('name', 'file')
                        attachment = {
                            'base64': base64.b64encode(file_bytes).decode(),
                            'type': att_type,
                            'name': att_name,
                        }
                        s3.delete_object(Bucket=UPLOADS_BUCKET, Key=s3_key)
                        logger.info(f"S3 download OK, {len(file_bytes)} bytes")
                    except Exception as e:
                        logger.error(f"S3 download error: {e}")
                        attachment = None
                if attachment:
                    agent_payload['attachment'] = attachment

            send_to_client(api_client, connection_id, {'type': 'status', 'message': 'Consultando agente y herramientas...'})

            # Start heartbeat thread
            stop = Event()
            hb = Thread(target=heartbeat, args=(domain, stage, connection_id, stop), daemon=True)
            hb.start()

            try:
                response = agentcore.invoke_agent_runtime(
                    agentRuntimeArn=RUNTIME_ARN, qualifier=QUALIFIER,
                    payload=json.dumps(agent_payload).encode(),
                )
                result = response.get('response', b'').read().decode() if hasattr(response.get('response', b''), 'read') else '{}'
                assistant_text = strip_emojis(json.loads(result).get('output', {}).get('text', ''))
            finally:
                stop.set()
                hb.join(timeout=2)

            send_to_client(api_client, connection_id, {'type': 'status', 'message': 'Guardando respuesta...'})
            history.append({'role': 'assistant', 'text': assistant_text})
            save_history(uid, conv_id, history, title)

            send_to_client(api_client, connection_id, {
                'type': 'response',
                'output': {'text': assistant_text},
                'conversationId': conv_id,
            })
        except Exception as e:
            logger.error(f"Error: {e}")
            err_msg = str(e)
            if 'timeout' in err_msg.lower() or 'timed out' in err_msg.lower():
                user_msg = 'La consulta fue demasiado compleja y excedio el tiempo limite. Intenta dividirla en preguntas mas especificas, por ejemplo: "Revisa los servicios de seguridad" y luego "Analiza la configuracion de red".'
            else:
                user_msg = 'Error procesando la solicitud. Intenta de nuevo con una consulta mas especifica.'
            send_to_client(api_client, connection_id, {
                'type': 'error',
                'output': {'text': user_msg},
            })

        return {'statusCode': 200}

    return {'statusCode': 400}
