import json, boto3, os

RUNTIME_ARN = os.environ['RUNTIME_ARN']
QUALIFIER = os.environ.get('QUALIFIER', 'default_endpoint')
client = boto3.client('bedrock-agentcore', region_name=os.environ.get('AWS_REGION', 'us-east-1'))

def handler(event, context):
    try:
        r = client.invoke_agent_runtime(
            agentRuntimeArn=RUNTIME_ARN, qualifier=QUALIFIER,
            payload=json.dumps({'input': {'text': 'ping'}, 'history': [], 'token': '', 'actor_id': 'warmup'}).encode(),
        )
        result = r.get('response', b'').read().decode() if hasattr(r.get('response', b''), 'read') else '{}'
        print(f"Warmup OK: {len(result)} bytes")
        return {'statusCode': 200}
    except Exception as e:
        print(f"Warmup error: {e}")
        return {'statusCode': 500}
