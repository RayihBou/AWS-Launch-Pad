#!/bin/bash
set -e
set -o pipefail

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Public ECR image (pre-built arm64)
PUBLIC_IMAGE="public.ecr.aws/t8k4q6p6/launchpad-agent:latest"
LOCAL_REPO="launchpad-agent"

echo ""
echo "========================================"
echo "  AWS LaunchPad - Setup"
echo "========================================"
echo ""

# Prompt for admin email
while true; do
  read -p "$(echo -e ${YELLOW}Enter admin email: ${NC})" ADMIN_EMAIL
  if [[ "$ADMIN_EMAIL" =~ ^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$ ]]; then
    break
  fi
  echo -e "${RED}Invalid email format. Please try again.${NC}"
done

# Prompt for language
read -p "$(echo -e ${YELLOW}Select language \(en/es/pt\) [en]: ${NC})" LANGUAGE
LANGUAGE=${LANGUAGE:-en}
if [[ ! "$LANGUAGE" =~ ^(en|es|pt)$ ]]; then
  echo -e "${RED}Invalid language. Using 'en'.${NC}"
  LANGUAGE="en"
fi

# Bedrock model ID (not prompted; override with the MODEL_ID environment variable)
MODEL_ID="${MODEL_ID:-us.anthropic.claude-sonnet-5}"
if [[ ! "$MODEL_ID" =~ ^[A-Za-z0-9._:/-]+$ ]]; then
  echo -e "${RED}Invalid MODEL_ID '$MODEL_ID'. Allowed characters: letters, digits, and . _ : / -${NC}"
  exit 1
fi

# Prompt for cross-account
read -p "$(echo -e ${YELLOW}Enable cross-account visibility? \(y/n\) [n]: ${NC})" CROSS_ACCOUNT
CROSS_ACCOUNT=${CROSS_ACCOUNT:-n}

echo ""
echo -e "${GREEN}Configuration:${NC}"
echo "  Admin Email: $ADMIN_EMAIL"
echo "  Language: $LANGUAGE"
echo "  Model ID: $MODEL_ID"
echo "  Cross-Account: $CROSS_ACCOUNT"
echo ""
read -p "$(echo -e ${YELLOW}Proceed with deployment? \(y/n\) [y]: ${NC})" CONFIRM
CONFIRM=${CONFIRM:-y}
if [[ ! "$CONFIRM" =~ ^[yY]$ ]]; then
  echo "Deployment cancelled."
  exit 0
fi

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

# Region resolution order: AWS_DEFAULT_REGION -> AWS_REGION -> configured profile region -> us-east-1
REGION="${AWS_DEFAULT_REGION:-${AWS_REGION:-}}"
if [[ -z "$REGION" ]]; then
  REGION="$(aws configure get region 2>/dev/null || true)"
fi
REGION="${REGION:-us-east-1}"

LOCAL_IMAGE="$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/$LOCAL_REPO:latest"

# ----------------------------------------------------------------------------
# Bedrock model access preflight
# Runs before any build or deploy so a missing model agreement fails in
# seconds instead of after a ~15 minute CDK deployment.
# ----------------------------------------------------------------------------

# Base model ID for the model access APIs (regional/global prefix removed)
BASE_MODEL_ID="$MODEL_ID"
for prefix in "us." "eu." "au." "global."; do
  if [[ "$BASE_MODEL_ID" == "$prefix"* ]]; then
    BASE_MODEL_ID="${BASE_MODEL_ID#"$prefix"}"
    break
  fi
done

json_escape() {
  local s="$1"
  s="${s//\\/\\\\}"
  s="${s//\"/\\\"}"
  printf '%s' "$s"
}

# 0 = model access ready, 1 = access missing, 2 = API call failed
model_access_state() {
  local raw auth ent agr reg
  raw=$(aws bedrock get-foundation-model-availability \
    --model-id "$BASE_MODEL_ID" \
    --region "$REGION" \
    --query '[authorizationStatus,entitlementAvailability,agreementAvailability.status,regionAvailability]' \
    --output text 2>/dev/null) || return 2
  read -r auth ent agr reg <<< "$raw"
  MODEL_ACCESS_DETAIL="authorization=$auth entitlement=$ent agreement=$agr region=$reg"
  if [[ "$auth" == "AUTHORIZED" && "$ent" == "AVAILABLE" && "$agr" == "AVAILABLE" && "$reg" == "AVAILABLE" ]]; then
    return 0
  fi
  return 1
}

echo ""
echo -e "${GREEN}[1/9] Verifying Bedrock model access...${NC}"
echo "  Account: $ACCOUNT_ID | Region: $REGION"
echo "  Model: $MODEL_ID (base: $BASE_MODEL_ID)"

# AWS CLI version check: the model access APIs require aws-cli 2.27.42 or newer
REQUIRED_CLI_VERSION="2.27.42"
AWS_CLI_VERSION=$(aws --version 2>&1 | awk '{print $1}' | cut -d/ -f2)
if [[ "$(printf '%s\n%s\n' "$REQUIRED_CLI_VERSION" "$AWS_CLI_VERSION" | sort -V | head -n1)" != "$REQUIRED_CLI_VERSION" ]]; then
  echo -e "${YELLOW}  Warning: AWS CLI $AWS_CLI_VERSION detected. Version $REQUIRED_CLI_VERSION or newer is required${NC}"
  echo -e "${YELLOW}  for the Bedrock model access APIs. Update with: pip install --upgrade awscli${NC}"
fi

MODEL_ACCESS_DETAIL=""
ACCESS_STATE=0
model_access_state || ACCESS_STATE=$?

if [[ "$ACCESS_STATE" -eq 2 ]]; then
  echo -e "${RED}  Could not query model availability for '$BASE_MODEL_ID' in $REGION.${NC}"
  echo -e "${RED}  Check that the model ID is valid in this region and that your credentials${NC}"
  echo -e "${RED}  allow bedrock:GetFoundationModelAvailability, then run ./setup.sh again.${NC}"
  exit 1
fi

if [[ "$ACCESS_STATE" -eq 0 ]]; then
  echo -e "${GREEN}  Model access confirmed ($MODEL_ACCESS_DETAIL)${NC}"
else
  echo ""
  echo -e "${YELLOW}  Model access is not enabled yet. Anthropic models require accepting the${NC}"
  echo -e "${YELLOW}  use case terms form once per account before they can be invoked.${NC}"
  echo "  Current status: $MODEL_ACCESS_DETAIL"
  echo ""

  read -p "$(echo -e ${YELLOW}Company name: ${NC})" COMPANY_NAME
  while [[ -z "$COMPANY_NAME" ]]; do
    read -p "$(echo -e ${RED}Company name is required: ${NC})" COMPANY_NAME
  done

  read -p "$(echo -e ${YELLOW}Company website \(https://...\): ${NC})" COMPANY_WEBSITE
  while [[ -z "$COMPANY_WEBSITE" ]]; do
    read -p "$(echo -e ${RED}Company website is required: ${NC})" COMPANY_WEBSITE
  done

  echo -e "${YELLOW}  Intended users: 0) Internal  1) External  2) Internal and External${NC}"
  read -p "$(echo -e ${YELLOW}Select intended users \(0/1/2\) [0]: ${NC})" INTENDED_USERS
  INTENDED_USERS=${INTENDED_USERS:-0}
  if [[ ! "$INTENDED_USERS" =~ ^[012]$ ]]; then
    echo -e "${RED}  Invalid selection. Using 0 (Internal).${NC}"
    INTENDED_USERS="0"
  fi

  read -p "$(echo -e ${YELLOW}Industry \(e.g. Technology, Financial Services, Healthcare, Public Sector, Other\) [Technology]: ${NC})" INDUSTRY_OPTION
  INDUSTRY_OPTION=${INDUSTRY_OPTION:-Technology}
  OTHER_INDUSTRY_OPTION=""
  if [[ "$INDUSTRY_OPTION" == "Other" ]]; then
    read -p "$(echo -e ${YELLOW}Describe your industry: ${NC})" OTHER_INDUSTRY_OPTION
  fi

  read -p "$(echo -e ${YELLOW}Use cases [Internal cloud operations assistant for monitoring and troubleshooting AWS infrastructure]: ${NC})" USE_CASES
  USE_CASES=${USE_CASES:-"Internal cloud operations assistant for monitoring and troubleshooting AWS infrastructure"}

  FORM_DATA_JSON=$(printf '{"companyName":"%s","companyWebsite":"%s","intendedUsers":"%s","industryOption":"%s","otherIndustryOption":"%s","useCases":"%s"}' \
    "$(json_escape "$COMPANY_NAME")" \
    "$(json_escape "$COMPANY_WEBSITE")" \
    "$(json_escape "$INTENDED_USERS")" \
    "$(json_escape "$INDUSTRY_OPTION")" \
    "$(json_escape "$OTHER_INDUSTRY_OPTION")" \
    "$(json_escape "$USE_CASES")")
  FORM_DATA_B64=$(printf '%s' "$FORM_DATA_JSON" | base64 | tr -d '\n')

  echo ""
  echo "  Submitting use case form..."
  if ! aws bedrock put-use-case-for-model-access \
    --form-data "$FORM_DATA_B64" \
    --region "$REGION" > /dev/null; then
    echo -e "${RED}  Failed to submit the use case form. Ensure your credentials allow${NC}"
    echo -e "${RED}  bedrock:PutUseCaseForModelAccess and try again.${NC}"
    exit 1
  fi

  echo "  Requesting model agreement..."
  OFFER_TOKEN=$(aws bedrock list-foundation-model-agreement-offers \
    --model-id "$BASE_MODEL_ID" \
    --offer-type PUBLIC \
    --region "$REGION" \
    --query 'offers[0].offerToken' \
    --output text 2>/dev/null || true)
  if [[ -z "$OFFER_TOKEN" || "$OFFER_TOKEN" == "None" ]]; then
    echo -e "${RED}  No public offer found for '$BASE_MODEL_ID' in $REGION.${NC}"
    echo -e "${RED}  Enable the model manually at:${NC}"
    echo -e "${RED}  https://$REGION.console.aws.amazon.com/bedrock/home?region=$REGION#/modelaccess${NC}"
    exit 1
  fi

  if ! aws bedrock create-foundation-model-agreement \
    --model-id "$BASE_MODEL_ID" \
    --offer-token "$OFFER_TOKEN" \
    --region "$REGION" > /dev/null; then
    echo -e "${RED}  Failed to create the model agreement. Ensure your credentials allow${NC}"
    echo -e "${RED}  bedrock:CreateFoundationModelAgreement and try again.${NC}"
    exit 1
  fi

  echo "  Agreement submitted. Waiting for propagation (up to 3 minutes)..."
  ACCESS_DEADLINE=$((SECONDS + 180))
  BACKOFF=5
  ACCESS_STATE=1
  while (( SECONDS < ACCESS_DEADLINE )); do
    sleep "$BACKOFF"
    ACCESS_STATE=0
    model_access_state || ACCESS_STATE=$?
    if [[ "$ACCESS_STATE" -eq 0 ]]; then
      break
    fi
    echo "    Still pending ($MODEL_ACCESS_DETAIL) - retrying in ${BACKOFF}s..."
    BACKOFF=$(( BACKOFF < 30 ? BACKOFF + 5 : 30 ))
  done

  if [[ "$ACCESS_STATE" -ne 0 ]]; then
    echo -e "${RED}  Model access is still not active after 3 minutes.${NC}"
    echo "  Last status: $MODEL_ACCESS_DETAIL"
    echo -e "${RED}  Verify the request at:${NC}"
    echo -e "${RED}  https://$REGION.console.aws.amazon.com/bedrock/home?region=$REGION#/modelaccess${NC}"
    echo -e "${RED}  then run ./setup.sh again.${NC}"
    exit 1
  fi

  echo -e "${GREEN}  Model access granted ($MODEL_ACCESS_DETAIL)${NC}"
fi

# Minimal invocation check: confirms the model can actually be called
echo "  Testing model invocation..."
PING_ERROR=$(aws bedrock-runtime converse \
  --model-id "$MODEL_ID" \
  --messages '[{"role":"user","content":[{"text":"ping"}]}]' \
  --inference-config '{"maxTokens":10}' \
  --region "$REGION" 2>&1 >/dev/null) && PING_OK=1 || PING_OK=0

if [[ "$PING_OK" -ne 1 ]]; then
  echo -e "${RED}  Model invocation failed for '$MODEL_ID' in $REGION.${NC}"
  echo "  $PING_ERROR"
  echo -e "${RED}  Confirm the inference profile is available in $REGION and that model${NC}"
  echo -e "${RED}  access is enabled at:${NC}"
  echo -e "${RED}  https://$REGION.console.aws.amazon.com/bedrock/home?region=$REGION#/modelaccess${NC}"
  echo -e "${RED}  Aborting before deployment. Run ./setup.sh again once resolved.${NC}"
  exit 1
fi
echo -e "${GREEN}  Model invocation confirmed${NC}"

echo ""
echo -e "${GREEN}[2/9] Installing dependencies...${NC}"
npm install --silent

echo -e "${GREEN}[3/9] Installing frontend dependencies...${NC}"
cd frontend && npm install --silent && cd ..

echo -e "${GREEN}[4/9] Building frontend (initial)...${NC}"
cd frontend && npm run build && cd ..

echo -e "${GREEN}[5/9] Bootstrapping CDK...${NC}"
echo "  Account: $ACCOUNT_ID | Region: $REGION"
npx cdk bootstrap aws://$ACCOUNT_ID/$REGION --app ""

echo -e "${GREEN}[6/9] Pulling agent image to local ECR...${NC}"
# Create ECR repo if it doesn't exist
aws ecr describe-repositories --repository-names $LOCAL_REPO --region $REGION > /dev/null 2>&1 || \
  aws ecr create-repository --repository-name $LOCAL_REPO --region $REGION > /dev/null

# Login to both registries
aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com > /dev/null 2>&1

# Pull from public, tag, and push to private ECR
docker pull --platform linux/arm64 $PUBLIC_IMAGE
docker tag $PUBLIC_IMAGE $LOCAL_IMAGE
docker push $LOCAL_IMAGE

# Build CDK context args
CDK_ARGS=(
  -c "adminEmail=$ADMIN_EMAIL"
  -c "language=$LANGUAGE"
  -c "modelId=$MODEL_ID"
  -c "containerUri=$LOCAL_IMAGE"
)
if [[ "$CROSS_ACCOUNT" =~ ^[yY]$ ]]; then
  CDK_ARGS+=(-c "enableCrossAccount=true")
fi

echo -e "${GREEN}[7/9] Deploying AWS LaunchPad...${NC}"
npx cdk deploy "${CDK_ARGS[@]}" --require-approval never --outputs-file outputs.json

echo -e "${GREEN}[8/9] Configuring frontend with stack outputs...${NC}"
USER_POOL_ID=$(node -e "console.log(require('./outputs.json').LaunchPadStack.UserPoolId)")
USER_POOL_CLIENT_ID=$(node -e "console.log(require('./outputs.json').LaunchPadStack.UserPoolClientId)")
API_ENDPOINT=$(node -e "console.log(require('./outputs.json').LaunchPadStack.ApiEndpoint)")
WS_ENDPOINT=$(node -e "console.log(require('./outputs.json').LaunchPadStack.WsEndpoint)")
CLOUDFRONT_URL=$(node -e "console.log(require('./outputs.json').LaunchPadStack.CloudFrontUrl)")
BUCKET_NAME=$(node -e "console.log(require('./outputs.json').LaunchPadStack.FrontendBucketName)")
DISTRIBUTION_ID=$(node -e "console.log(require('./outputs.json').LaunchPadStack.DistributionId)")

echo "  UserPoolId: $USER_POOL_ID"
echo "  ApiEndpoint: $API_ENDPOINT"
echo "  WsEndpoint: $WS_ENDPOINT"

export VITE_USER_POOL_ID=$USER_POOL_ID
export VITE_USER_POOL_CLIENT_ID=$USER_POOL_CLIENT_ID
export VITE_AGENT_ENDPOINT=$API_ENDPOINT
export VITE_WS_ENDPOINT=$WS_ENDPOINT
export VITE_AWS_REGION=$REGION
export VITE_LANGUAGE=$LANGUAGE
cd frontend && npm run build && cd ..

echo -e "${GREEN}[9/9] Uploading frontend to S3...${NC}"
aws s3 sync frontend/dist/ s3://$BUCKET_NAME/ --delete --region $REGION
aws cloudfront create-invalidation --distribution-id $DISTRIBUTION_ID --paths "/*" --region us-east-1 > /dev/null 2>&1

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Deployment complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "  URL: ${GREEN}$CLOUDFRONT_URL${NC}"
echo "  Check your email ($ADMIN_EMAIL) for the temporary password."
echo "  Log in and configure MFA (TOTP)."

# Generate cross-account template if enabled
if [[ "$CROSS_ACCOUNT" =~ ^[yY]$ ]]; then
  RUNTIME_ROLE_ARN=$(node -e "console.log(require('./outputs.json').LaunchPadStack.RuntimeRoleArn)")
  # docs/launchpad-role.yaml is parameterized (RuntimeRoleArn, ManagementAccountId),
  # so it is used as-is and the values are passed via --parameter-overrides.
  if [[ -f docs/launchpad-role.yaml ]]; then
    cp docs/launchpad-role.yaml launchpad-role.yaml
  else
    cat > launchpad-role.yaml <<'YAML'
AWSTemplateFormatVersion: '2010-09-09'
Description: LaunchPad read-only cross-account role for linked accounts

Parameters:
  ManagementAccountId:
    Type: String
    Description: AWS Account ID where LaunchPad is deployed
  RuntimeRoleArn:
    Type: String
    Description: ARN of the LaunchPad AgentCore Runtime execution role

Resources:
  LaunchPadReadOnlyRole:
    Type: AWS::IAM::Role
    Properties:
      RoleName: LaunchPadReadOnlyRole
      AssumeRolePolicyDocument:
        Version: '2012-10-17'
        Statement:
          - Effect: Allow
            Principal:
              AWS: !Ref RuntimeRoleArn
            Action: sts:AssumeRole
      ManagedPolicyArns:
        - arn:aws:iam::aws:policy/ReadOnlyAccess
YAML
  fi
  echo ""
  echo -e "${GREEN}  Cross-account template generated: launchpad-role.yaml${NC}"
  echo "  Runtime Role: $RUNTIME_ROLE_ARN"
  echo ""
  echo "  Deploy to a single linked account:"
  echo "    aws cloudformation deploy --template-file launchpad-role.yaml --stack-name LaunchPadAccess --capabilities CAPABILITY_NAMED_IAM --parameter-overrides RuntimeRoleArn=$RUNTIME_ROLE_ARN ManagementAccountId=$ACCOUNT_ID"
  echo ""
  echo "  Deploy to all accounts via StackSet (from management account):"
  echo "    aws cloudformation create-stack-set --stack-set-name LaunchPadAccess --template-body file://launchpad-role.yaml --capabilities CAPABILITY_NAMED_IAM --permission-model SERVICE_MANAGED --auto-deployment Enabled=true,RetainStacksOnAccountRemoval=false --parameters ParameterKey=RuntimeRoleArn,ParameterValue=$RUNTIME_ROLE_ARN ParameterKey=ManagementAccountId,ParameterValue=$ACCOUNT_ID"
  echo "    aws cloudformation create-stack-instances --stack-set-name LaunchPadAccess --deployment-targets OrganizationalUnitIds=YOUR_OU_ID --regions us-east-1"
fi
echo ""
