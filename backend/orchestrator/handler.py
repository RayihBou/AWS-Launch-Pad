import json
import os
import boto3

bedrock = boto3.client("bedrock-agent-runtime")

AGENT_ID = os.environ["AGENT_ID"]
AGENT_ALIAS_ID = os.environ["AGENT_ALIAS_ID"]
WEBSOCKET_ENDPOINT = os.environ["WEBSOCKET_ENDPOINT"]


def handler(event, context):
    route_key = event["requestContext"]["routeKey"]
    connection_id = event["requestContext"]["connectionId"]

    if route_key == "$connect":
        return {"statusCode": 200}
    elif route_key == "$disconnect":
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

        response = bedrock.invoke_agent(
            agentId=AGENT_ID,
            agentAliasId=AGENT_ALIAS_ID,
            sessionId=connection_id,
            inputText=user_message,
            enableTrace=False,
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
