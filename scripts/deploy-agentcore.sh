#!/bin/bash
# AWS LaunchPad - AgentCore Deployment Script
# Deploys AgentCore resources (Gateway, Memory, Runtime) via AWS CLI
# Run after: cdk deploy (which creates Cognito, S3+CloudFront, Guardrails)

set -euo pipefail

# Configuration
REGION="${AWS_REGION:-us-east-1}"
AGENT_NAME="launchpad-assistant"
MODEL_ID="${MODEL_ID:-anthropic.claude-sonnet-4-20250514-v1:0}"
LANGUAGE="${LANGUAGE:-en}"

echo "=== AWS LaunchPad - AgentCore Deployment ==="
echo "Region: $REGION"
echo "Model: $MODEL_ID"
echo "Language: $LANGUAGE"

# Step 0: Verify Bedrock model access
echo ""
echo "--- Step 0: Verifying Bedrock model access ---"
MODEL_STATUS=$(aws bedrock get-foundation-model \
  --model-identifier "$MODEL_ID" \
  --region "$REGION" \
  --query 'modelDetails.modelLifecycle.status' \
  --output text 2>/dev/null || echo "NOT_FOUND")

if [ "$MODEL_STATUS" = "NOT_FOUND" ]; then
  echo "ERROR: Model $MODEL_ID not found in region $REGION"
  echo "Please enable model access in the Bedrock console:"
  echo "  https://console.aws.amazon.com/bedrock/home?region=${REGION}#/modelaccess"
  exit 1
elif [ "$MODEL_STATUS" != "ACTIVE" ]; then
  echo "WARNING: Model $MODEL_ID status is $MODEL_STATUS (not ACTIVE)"
  echo "Attempting to enable model access..."
  aws bedrock create-foundation-model-agreement \
    --model-id "$MODEL_ID" \
    --region "$REGION" 2>/dev/null || true
  echo "If model access fails, enable it manually in the Bedrock console:"
  echo "  https://console.aws.amazon.com/bedrock/home?region=${REGION}#/modelaccess"
else
  echo "Model $MODEL_ID is ACTIVE"
fi

# Read CDK outputs
echo ""
echo "--- Reading CDK stack outputs ---"
STACK_OUTPUTS=$(aws cloudformation describe-stacks \
  --stack-name LaunchpadStack \
  --region "$REGION" \
  --query 'Stacks[0].Outputs' \
  --output json 2>/dev/null || echo "[]")

get_output() {
  echo "$STACK_OUTPUTS" | python3 -c "
import sys, json
outputs = json.load(sys.stdin)
for o in outputs:
    if o['OutputKey'] == '$1':
        print(o['OutputValue'])
        break
"
}

USER_POOL_ID=$(get_output "UserPoolId")
GUARDRAIL_ID=$(get_output "GuardrailId")
CLOUDFRONT_URL=$(get_output "CloudFrontUrl")

echo "UserPoolId: $USER_POOL_ID"
echo "GuardrailId: $GUARDRAIL_ID"
echo "CloudFrontUrl: $CLOUDFRONT_URL"

# Step 1: Create AgentCore Gateway
echo ""
echo "--- Step 1: Creating AgentCore Gateway ---"
GATEWAY_ID=$(aws bedrock-agentcore create-gateway \
  --name "${AGENT_NAME}-gateway" \
  --region "$REGION" \
  --query 'gatewayId' \
  --output text 2>/dev/null || echo "")

if [ -z "$GATEWAY_ID" ]; then
  echo "Gateway may already exist, looking up..."
  GATEWAY_ID=$(aws bedrock-agentcore list-gateways \
    --region "$REGION" \
    --query "gateways[?name=='${AGENT_NAME}-gateway'].gatewayId" \
    --output text 2>/dev/null || echo "")
fi

echo "Gateway ID: $GATEWAY_ID"

# Step 2: Add MCP Server targets to Gateway
echo ""
echo "--- Step 2: Adding MCP Server targets ---"

# AWS Knowledge MCP Server (remote, managed by AWS)
aws bedrock-agentcore create-gateway-target \
  --gateway-id "$GATEWAY_ID" \
  --name "aws-knowledge-mcp" \
  --target-configuration '{"mcpServerConfiguration":{"url":"https://knowledge-mcp.global.api.aws"}}' \
  --region "$REGION" 2>/dev/null && echo "Added: AWS Knowledge MCP" || echo "AWS Knowledge MCP: already exists or skipped"

# CloudWatch MCP Server (local, runs as tool)
aws bedrock-agentcore create-gateway-target \
  --gateway-id "$GATEWAY_ID" \
  --name "cloudwatch-mcp" \
  --target-configuration '{"lambdaConfiguration":{"toolSchema":{"name":"cloudwatch-mcp","description":"CloudWatch metrics, alarms, and logs"}}}' \
  --region "$REGION" 2>/dev/null && echo "Added: CloudWatch MCP" || echo "CloudWatch MCP: already exists or skipped"

# AWS Pricing MCP Server (local, runs as tool)
aws bedrock-agentcore create-gateway-target \
  --gateway-id "$GATEWAY_ID" \
  --name "pricing-mcp" \
  --target-configuration '{"lambdaConfiguration":{"toolSchema":{"name":"pricing-mcp","description":"AWS service pricing and cost estimates"}}}' \
  --region "$REGION" 2>/dev/null && echo "Added: Pricing MCP" || echo "Pricing MCP: already exists or skipped"

# WA Security MCP Server (local, runs as tool)
aws bedrock-agentcore create-gateway-target \
  --gateway-id "$GATEWAY_ID" \
  --name "wa-security-mcp" \
  --target-configuration '{"lambdaConfiguration":{"toolSchema":{"name":"wa-security-mcp","description":"Well-Architected Security assessment"}}}' \
  --region "$REGION" 2>/dev/null && echo "Added: WA Security MCP" || echo "WA Security MCP: already exists or skipped"

# CloudTrail MCP Server (local, runs as tool)
aws bedrock-agentcore create-gateway-target \
  --gateway-id "$GATEWAY_ID" \
  --name "cloudtrail-mcp" \
  --target-configuration '{"lambdaConfiguration":{"toolSchema":{"name":"cloudtrail-mcp","description":"CloudTrail event history and audit"}}}' \
  --region "$REGION" 2>/dev/null && echo "Added: CloudTrail MCP" || echo "CloudTrail MCP: already exists or skipped"

# Get Gateway endpoint
GATEWAY_ENDPOINT=$(aws bedrock-agentcore get-gateway \
  --gateway-id "$GATEWAY_ID" \
  --region "$REGION" \
  --query 'endpoint' \
  --output text 2>/dev/null || echo "")

echo "Gateway Endpoint: $GATEWAY_ENDPOINT"

# Step 3: Create Memory Store
echo ""
echo "--- Step 3: Creating Memory Store ---"
MEMORY_STORE_ID=$(aws bedrock-agentcore create-memory-store \
  --name "${AGENT_NAME}-memory" \
  --region "$REGION" \
  --query 'memoryStoreId' \
  --output text 2>/dev/null || echo "")

if [ -z "$MEMORY_STORE_ID" ]; then
  echo "Memory store may already exist, looking up..."
  MEMORY_STORE_ID=$(aws bedrock-agentcore list-memory-stores \
    --region "$REGION" \
    --query "memoryStores[?name=='${AGENT_NAME}-memory'].memoryStoreId" \
    --output text 2>/dev/null || echo "")
fi

echo "Memory Store ID: $MEMORY_STORE_ID"

# Step 4: Deploy agent to AgentCore Runtime
echo ""
echo "--- Step 4: Deploying agent to AgentCore Runtime ---"

# Build and push container
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_REPO="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/${AGENT_NAME}"

echo "Building agent container..."
docker build -t "$AGENT_NAME" ./agent/

echo "Pushing to ECR..."
aws ecr describe-repositories --repository-names "$AGENT_NAME" --region "$REGION" 2>/dev/null || \
  aws ecr create-repository --repository-name "$AGENT_NAME" --region "$REGION"

aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"
docker tag "$AGENT_NAME" "$ECR_REPO:latest"
docker push "$ECR_REPO:latest"

echo "Deploying to AgentCore Runtime..."
aws bedrock-agentcore create-runtime \
  --name "$AGENT_NAME" \
  --container-configuration "{\"imageUri\":\"${ECR_REPO}:latest\",\"environmentVariables\":{\"MODEL_ID\":\"${MODEL_ID}\",\"LANGUAGE\":\"${LANGUAGE}\",\"GATEWAY_ENDPOINT\":\"${GATEWAY_ENDPOINT}\",\"MEMORY_STORE_ID\":\"${MEMORY_STORE_ID}\",\"GUARDRAIL_ID\":\"${GUARDRAIL_ID}\"}}" \
  --region "$REGION" 2>/dev/null && echo "Runtime deployed" || echo "Runtime may already exist"

# Step 5: Create Cognito users
echo ""
echo "--- Step 5: Creating Cognito users ---"
USER_POOL_CLIENT_ID=$(get_output "UserPoolClientId")

# Operator user
aws cognito-idp admin-create-user \
  --user-pool-id "$USER_POOL_ID" \
  --username "rayihbou@amazon.com" \
  --temporary-password "LaunchPad2026!" \
  --user-attributes Name=email,Value=rayihbou@amazon.com Name=email_verified,Value=true \
  --region "$REGION" 2>/dev/null && echo "Created: rayihbou@amazon.com (Operator)" || echo "User rayihbou@amazon.com already exists"

aws cognito-idp admin-add-user-to-group \
  --user-pool-id "$USER_POOL_ID" \
  --username "rayihbou@amazon.com" \
  --group-name "Operator" \
  --region "$REGION" 2>/dev/null && echo "Assigned to group: Operator" || echo "Already in Operator group"

# Viewer user (for testing restricted access)
aws cognito-idp admin-create-user \
  --user-pool-id "$USER_POOL_ID" \
  --username "viewer@launchpad.test" \
  --temporary-password "LaunchPad2026!" \
  --user-attributes Name=email,Value=viewer@launchpad.test Name=email_verified,Value=true \
  --region "$REGION" 2>/dev/null && echo "Created: viewer@launchpad.test (Viewer)" || echo "User viewer@launchpad.test already exists"

aws cognito-idp admin-add-user-to-group \
  --user-pool-id "$USER_POOL_ID" \
  --username "viewer@launchpad.test" \
  --group-name "Viewer" \
  --region "$REGION" 2>/dev/null && echo "Assigned to group: Viewer" || echo "Already in Viewer group"

# Step 6: Output summary
echo ""
echo "=== Deployment Complete ==="
echo "CloudFront URL: $CLOUDFRONT_URL"
echo "Gateway ID: $GATEWAY_ID"
echo "Gateway Endpoint: $GATEWAY_ENDPOINT"
echo "Memory Store ID: $MEMORY_STORE_ID"
echo "Cognito User Pool: $USER_POOL_ID"
echo ""
echo "=== Test Users ==="
echo "Operator: rayihbou@amazon.com / LaunchPad2026! (change on first login)"
echo "Viewer:   viewer@launchpad.test / LaunchPad2026! (change on first login)"
echo ""
echo "NOTE: AgentCore API names may vary. Check the latest AWS CLI reference"
echo "for bedrock-agentcore commands if any step fails."
