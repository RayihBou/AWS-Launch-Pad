#!/bin/bash
set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

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

# Build CDK context args
CDK_ARGS="-c adminEmail=$ADMIN_EMAIL -c language=$LANGUAGE"
if [[ "$CROSS_ACCOUNT" =~ ^[yY]$ ]]; then
  CDK_ARGS="$CDK_ARGS -c enableCrossAccount=true"
fi

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

echo ""
echo -e "${GREEN}[1/5] Installing dependencies...${NC}"
npm install --silent

echo -e "${GREEN}[2/5] Building frontend...${NC}"
cd frontend && npm install --silent && npm run build && cd ..

echo -e "${GREEN}[3/5] Bootstrapping CDK...${NC}"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGION=${AWS_DEFAULT_REGION:-${AWS_REGION:-us-east-1}}
echo "  Account: $ACCOUNT_ID | Region: $REGION"
npx cdk bootstrap aws://$ACCOUNT_ID/$REGION --app ""

echo -e "${GREEN}[4/5] Deploying AWS LaunchPad...${NC}"
npx cdk deploy $CDK_ARGS --require-approval never --outputs-file outputs.json

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Deployment complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
if [ -f outputs.json ]; then
  echo "Stack outputs:"
  cat outputs.json | head -50
fi
