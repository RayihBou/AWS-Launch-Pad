import json
import os
import base64
import boto3

bedrock = boto3.client("bedrock-agent-runtime")

AGENT_ID = os.environ["AGENT_ID"]
AGENT_ALIAS_ID = os.environ["AGENT_ALIAS_ID"]
WEBSOCKET_ENDPOINT = os.environ["WEBSOCKET_ENDPOINT"]

# Store user roles across invocations within the same Lambda container
user_roles = {}


def decode_jwt_payload(token):
    """Decode JWT payload without verification (API GW already validated)."""
    payload = token.split(".")[1]
    padding = 4 - len(payload) % 4
    if padding != 4:
        payload += "=" * padding
    return json.loads(base64.b64decode(payload))


def extract_role(event):
    """Extract Cognito group from JWT token passed as query parameter."""
    token = (event.get("queryStringParameters") or {}).get("token")
    if not token:
        return "Viewer"
    try:
        claims = decode_jwt_payload(token)
        groups = claims.get("cognito:groups", [])
        return groups[0] if groups else "Viewer"
    except Exception:
        return "Viewer"


def handler(event, context):
    route_key = event["requestContext"]["routeKey"]
    connection_id = event["requestContext"]["connectionId"]

    if route_key == "$connect":
        user_roles[connection_id] = extract_role(event)
        return {"statusCode": 200}
    elif route_key == "$disconnect":
        user_roles.pop(connection_id, None)
        return {"statusCode": 200}
    elif route_key == "sendMessage":
        return send_message(event, connection_id)

    return {"statusCode": 400, "body": "Unknown route"}


def send_message(event, connection_id):
    apigw = boto3.client(
        "apigatewaymanagementapi", endpoint_url=WEBSOCKET_ENDPOINT
    )

    try:
        body = json.loads(event.get("body", "{}"))
        user_message = body.get("message", "")
        user_role = user_roles.get(connection_id, "Viewer")

        response = bedrock.invoke_agent(
            agentId=AGENT_ID,
            agentAliasId=AGENT_ALIAS_ID,
            sessionId=connection_id,
            inputText=user_message,
            enableTrace=False,
            sessionState={
                "sessionAttributes": {
                    "userRole": user_role
                }
            },
        )

        # Stream agent response chunks back to the WebSocket client
        for chunk in response.get("completion", []):
            if "chunk" in chunk:
                text = chunk["chunk"].get("bytes", b"").decode("utf-8")
                if text:
                    apigw.post_to_connection(
                        ConnectionId=connection_id,
                        Data=json.dumps({"type": "chunk", "content": text}),
                    )

        # Signal stream completion
        apigw.post_to_connection(
            ConnectionId=connection_id,
            Data=json.dumps({"type": "end"}),
        )

        return {"statusCode": 200}

    except Exception as e:
        print(f"Error processing message: {e}")
        try:
            apigw.post_to_connection(
                ConnectionId=connection_id,
                Data=json.dumps({"type": "error", "content": str(e)}),
            )
        except Exception:
            pass
        return {"statusCode": 500, "body": "Internal server error"}
