#!/bin/bash
# deploy-agentcore.sh - Deploy AgentCore resources (Gateway, Runtime, Endpoint)
# Run AFTER cdk deploy. Requires: AWS CLI 2.34+, Docker, jq
set -e

REGION="${AWS_REGION:-us-east-1}"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
LANGUAGE="${LANGUAGE:-es}"
MODEL_ID="${MODEL_ID:-us.anthropic.claude-sonnet-4-20250514-v1:0}"

# Get CDK outputs
STACK_OUTPUTS=$(aws cloudformation describe-stacks --stack-name LaunchpadStack --region $REGION --query 'Stacks[0].Outputs' --output json)
get_output() { echo "$STACK_OUTPUTS" | python3 -c "import sys,json; [print(o['OutputValue']) for o in json.load(sys.stdin) if o['OutputKey']=='$1']"; }

USER_POOL_ID=$(get_output UserPoolId)
CLIENT_ID=$(get_output UserPoolClientId)
ECR_URI=$(get_output ApiProxyEcrRepositoryUri)
GATEWAY_ROLE_ARN=$(get_output ApiProxyGatewayRoleArn)
RUNTIME_ROLE_ARN=$(get_output ApiProxyRuntimeRoleArn)
PROXY_FN=$(get_output ApiProxyProxyFunctionName)
CW_ARN=$(get_output CloudWatchMcpArn)
PRICING_ARN=$(get_output PricingMcpArn)
WA_ARN=$(get_output WaSecurityMcpArn)
CT_ARN=$(get_output CloudTrailMcpArn)

echo "Account: $ACCOUNT_ID | Region: $REGION"
echo "ECR: $ECR_URI | Gateway Role: $GATEWAY_ROLE_ARN"

# Step 1: Build and push Docker container
echo "Building agent container..."
cd agent
docker build --platform linux/arm64 -t launchpad-agent .
aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin ${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com
docker tag launchpad-agent:latest ${ECR_URI}:latest
docker push ${ECR_URI}:latest
cd ..

# Step 2: Create or update AgentCore Gateway
echo "Creating AgentCore Gateway..."
GATEWAY_ID=$(aws bedrock-agentcore-control list-gateways --region $REGION --query 'items[?name==`launchpad-gateway`].gatewayId' --output text 2>/dev/null || echo "")

if [ -z "$GATEWAY_ID" ] || [ "$GATEWAY_ID" = "None" ]; then
  GATEWAY_RESULT=$(aws bedrock-agentcore-control create-gateway \
    --name "launchpad-gateway" \
    --role-arn "$GATEWAY_ROLE_ARN" \
    --protocol-type MCP \
    --authorizer-type CUSTOM_JWT \
    --authorizer-configuration "{\"customJWTAuthorizer\":{\"discoveryUrl\":\"https://cognito-idp.${REGION}.amazonaws.com/${USER_POOL_ID}/.well-known/openid-configuration\",\"allowedAudience\":[\"${CLIENT_ID}\"]}}" \
    --region $REGION --output json)
  GATEWAY_ID=$(echo "$GATEWAY_RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin)['gatewayId'])")
  echo "Gateway created: $GATEWAY_ID"
  echo "Waiting for Gateway..."
  sleep 30
else
  echo "Gateway exists: $GATEWAY_ID"
fi

GATEWAY_URL=$(aws bedrock-agentcore-control get-gateway --gateway-identifier $GATEWAY_ID --region $REGION --query 'gatewayUrl' --output text)
echo "Gateway URL: $GATEWAY_URL"

# Step 3: Create MCP targets
create_lambda_target() {
  local NAME=$1 DESC=$2 LAMBDA_ARN=$3 SCHEMA=$4
  EXISTING=$(aws bedrock-agentcore-control list-gateway-targets --gateway-identifier $GATEWAY_ID --region $REGION --query "items[?name==\`$NAME\`].targetId" --output text 2>/dev/null || echo "")
  if [ -z "$EXISTING" ] || [ "$EXISTING" = "None" ]; then
    aws bedrock-agentcore-control create-gateway-target \
      --gateway-identifier $GATEWAY_ID --name "$NAME" --description "$DESC" \
      --target-configuration "{\"mcp\":{\"lambda\":{\"lambdaArn\":\"${LAMBDA_ARN}\",\"toolSchema\":{\"inlinePayload\":$SCHEMA}}}}" \
      --credential-provider-configurations '[{"credentialProviderType":"GATEWAY_IAM_ROLE"}]' \
      --region $REGION --query 'targetId' --output text
    echo "  Created target: $NAME"
  else
    echo "  Target exists: $NAME ($EXISTING)"
  fi
}

# AWS Knowledge MCP (remote, no Lambda)
EXISTING_KN=$(aws bedrock-agentcore-control list-gateway-targets --gateway-identifier $GATEWAY_ID --region $REGION --query "items[?name==\`aws-knowledge-mcp\`].targetId" --output text 2>/dev/null || echo "")
if [ -z "$EXISTING_KN" ] || [ "$EXISTING_KN" = "None" ]; then
  aws bedrock-agentcore-control create-gateway-target \
    --gateway-identifier $GATEWAY_ID --name "aws-knowledge-mcp" --description "AWS documentation and best practices" \
    --target-configuration '{"mcp":{"mcpRemoteServer":{"url":"https://knowledge-mcp.global.api.aws"}}}' \
    --region $REGION --query 'targetId' --output text
  echo "  Created target: aws-knowledge-mcp"
fi

create_lambda_target "cloudwatch-mcp" "CloudWatch monitoring" "$CW_ARN" \
  '[{"name":"describe_alarms","description":"List CloudWatch alarms","inputSchema":{"type":"object","properties":{"state":{"type":"string"}},"required":[]}},{"name":"get_metric_statistics","description":"Get metric stats","inputSchema":{"type":"object","properties":{"namespace":{"type":"string"},"metric_name":{"type":"string"},"dimension_name":{"type":"string"},"dimension_value":{"type":"string"},"hours":{"type":"number"}},"required":["namespace","metric_name"]}},{"name":"list_log_groups","description":"List CloudWatch log groups","inputSchema":{"type":"object","properties":{"prefix":{"type":"string"},"limit":{"type":"number"}},"required":[]}}]'

create_lambda_target "pricing-mcp" "AWS Pricing" "$PRICING_ARN" \
  '[{"name":"get_products","description":"Get pricing for AWS services. For EC2, pass instance_type and region.","inputSchema":{"type":"object","properties":{"service_code":{"type":"string"},"instance_type":{"type":"string"},"region":{"type":"string"},"operating_system":{"type":"string"}},"required":["service_code"]}},{"name":"describe_services","description":"List AWS services in Pricing API","inputSchema":{"type":"object","properties":{"service_code":{"type":"string"}},"required":[]}},{"name":"get_attribute_values","description":"Get pricing attribute values","inputSchema":{"type":"object","properties":{"service_code":{"type":"string"},"attribute_name":{"type":"string"}},"required":["service_code","attribute_name"]}}]'

create_lambda_target "wa-security-mcp" "Security Hub assessment" "$WA_ARN" \
  '[{"name":"get_findings","description":"Get Security Hub findings","inputSchema":{"type":"object","properties":{"severity":{"type":"string"},"max_results":{"type":"number"}},"required":[]}},{"name":"list_standards","description":"List security standards","inputSchema":{"type":"object","properties":{},"required":[]}},{"name":"get_guardduty_findings","description":"Get GuardDuty findings","inputSchema":{"type":"object","properties":{"detector_id":{"type":"string"}},"required":[]}}]'

create_lambda_target "cloudtrail-mcp" "CloudTrail audit" "$CT_ARN" \
  '[{"name":"lookup_events","description":"Look up CloudTrail events","inputSchema":{"type":"object","properties":{"lookup_attributes":{"type":"object"},"max_results":{"type":"number"}},"required":[]}},{"name":"describe_trails","description":"Describe trails","inputSchema":{"type":"object","properties":{},"required":[]}},{"name":"get_trail_status","description":"Get trail status","inputSchema":{"type":"object","properties":{"trail_name":{"type":"string"}},"required":["trail_name"]}}]'

# Step 4: Create or update AgentCore Runtime
echo "Creating AgentCore Runtime..."
RUNTIME_ID=$(aws bedrock-agentcore-control list-agent-runtimes --region $REGION --query "agentRuntimeSummaries[?agentRuntimeName==\`launchpad_strands\`].agentRuntimeId" --output text 2>/dev/null || echo "")

if [ -z "$RUNTIME_ID" ] || [ "$RUNTIME_ID" = "None" ]; then
  RUNTIME_RESULT=$(aws bedrock-agentcore-control create-agent-runtime \
    --agent-runtime-name "launchpad_strands" \
    --role-arn "$RUNTIME_ROLE_ARN" \
    --agent-runtime-artifact "{\"containerConfiguration\":{\"containerUri\":\"${ECR_URI}:latest\"}}" \
    --network-configuration '{"networkMode":"PUBLIC"}' \
    --environment-variables "{\"MODEL_ID\":\"${MODEL_ID}\",\"LANGUAGE\":\"${LANGUAGE}\",\"GATEWAY_ENDPOINT\":\"${GATEWAY_URL}\"}" \
    --region $REGION --output json)
  RUNTIME_ID=$(echo "$RUNTIME_RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin)['agentRuntimeId'])")
  echo "Runtime created: $RUNTIME_ID"
  echo "Waiting for Runtime..."
  sleep 30
else
  echo "Runtime exists: $RUNTIME_ID"
  aws bedrock-agentcore-control update-agent-runtime \
    --agent-runtime-id "$RUNTIME_ID" \
    --agent-runtime-artifact "{\"containerConfiguration\":{\"containerUri\":\"${ECR_URI}:latest\"}}" \
    --role-arn "$RUNTIME_ROLE_ARN" \
    --network-configuration '{"networkMode":"PUBLIC"}' \
    --environment-variables "{\"MODEL_ID\":\"${MODEL_ID}\",\"LANGUAGE\":\"${LANGUAGE}\",\"GATEWAY_ENDPOINT\":\"${GATEWAY_URL}\"}" \
    --region $REGION --query 'agentRuntimeVersion' --output text
fi

# Step 5: Create or update endpoint
ENDPOINT_STATUS=$(aws bedrock-agentcore-control get-agent-runtime-endpoint --agent-runtime-id "$RUNTIME_ID" --endpoint-name "default_endpoint" --region $REGION --query 'status' --output text 2>/dev/null || echo "NONE")

if [ "$ENDPOINT_STATUS" = "NONE" ]; then
  aws bedrock-agentcore-control create-agent-runtime-endpoint \
    --agent-runtime-id "$RUNTIME_ID" --name "default_endpoint" --region $REGION
  echo "Endpoint created"
  sleep 15
fi

RUNTIME_ARN="arn:aws:bedrock-agentcore:${REGION}:${ACCOUNT_ID}:runtime/${RUNTIME_ID}"

# Step 6: Update Lambda Proxy with Runtime ARN
echo "Updating proxy Lambda..."
aws lambda update-function-configuration \
  --function-name "$PROXY_FN" \
  --environment "{\"Variables\":{\"RUNTIME_ARN\":\"${RUNTIME_ARN}\",\"QUALIFIER\":\"default_endpoint\"}}" \
  --region $REGION --query 'LastModified' --output text

echo ""
echo "=== Deployment Complete ==="
echo "Gateway: $GATEWAY_ID ($GATEWAY_URL)"
echo "Runtime: $RUNTIME_ID"
echo "Runtime ARN: $RUNTIME_ARN"
echo ""
echo "Next: Update frontend/.env with VITE_AGENT_ENDPOINT and rebuild"
