#!/bin/bash
set -e

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

# Prompt for cross-account
read -p "$(echo -e ${YELLOW}Enable cross-account visibility? \(y/n\) [n]: ${NC})" CROSS_ACCOUNT
CROSS_ACCOUNT=${CROSS_ACCOUNT:-n}

echo ""
echo -e "${GREEN}Configuration:${NC}"
echo "  Admin Email: $ADMIN_EMAIL"
echo "  Language: $LANGUAGE"
echo "  Cross-Account: $CROSS_ACCOUNT"
echo ""
read -p "$(echo -e ${YELLOW}Proceed with deployment? \(y/n\) [y]: ${NC})" CONFIRM
CONFIRM=${CONFIRM:-y}
if [[ ! "$CONFIRM" =~ ^[yY]$ ]]; then
  echo "Deployment cancelled."
  exit 0
fi

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGION=${AWS_DEFAULT_REGION:-${AWS_REGION:-us-east-1}}
LOCAL_IMAGE="$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/$LOCAL_REPO:latest"

echo ""
echo -e "${GREEN}[1/8] Installing dependencies...${NC}"
npm install --silent

echo -e "${GREEN}[2/8] Installing frontend dependencies...${NC}"
cd frontend && npm install --silent && cd ..

echo -e "${GREEN}[3/8] Building frontend (initial)...${NC}"
cd frontend && npm run build && cd ..

echo -e "${GREEN}[4/8] Bootstrapping CDK...${NC}"
echo "  Account: $ACCOUNT_ID | Region: $REGION"
npx cdk bootstrap aws://$ACCOUNT_ID/$REGION --app ""

echo -e "${GREEN}[5/8] Pulling agent image to local ECR...${NC}"
# Create ECR repo if it doesn't exist
aws ecr describe-repositories --repository-names $LOCAL_REPO --region $REGION > /dev/null 2>&1 || \
  aws ecr create-repository --repository-name $LOCAL_REPO --region $REGION > /dev/null

# Login to both registries
aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com > /dev/null 2>&1

# Pull from public, tag, and push to private ECR
docker pull $PUBLIC_IMAGE
docker tag $PUBLIC_IMAGE $LOCAL_IMAGE
docker push $LOCAL_IMAGE

# Build CDK context args
CDK_ARGS="-c adminEmail=$ADMIN_EMAIL -c language=$LANGUAGE -c containerUri=$LOCAL_IMAGE"
if [[ "$CROSS_ACCOUNT" =~ ^[yY]$ ]]; then
  CDK_ARGS="$CDK_ARGS -c enableCrossAccount=true"
fi

echo -e "${GREEN}[6/8] Deploying AWS LaunchPad...${NC}"
npx cdk deploy $CDK_ARGS --require-approval never --outputs-file outputs.json

echo -e "${GREEN}[7/8] Configuring frontend with stack outputs...${NC}"
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

echo -e "${GREEN}[8/8] Uploading frontend to S3...${NC}"
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
echo ""
