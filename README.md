# AWS LaunchPad

AI-powered cloud operations assistant deployable in any AWS account with a single `cdk deploy`. Built on Amazon Bedrock AgentCore with Strands Agents SDK, 120+ MCP tools, and long-term memory.

![Architecture](docs/aws-launchpad-architecture.png)

## What It Does

AWS LaunchPad is a read-only assistant that helps teams monitor, analyze, and troubleshoot their AWS infrastructure through a conversational interface. When it finds issues, it provides ready-to-execute CLI commands — the agent never performs write operations.

**Capabilities:**
- Security posture analysis (Security Hub, GuardDuty, Inspector, WAF, IAM, S3, RDS)
- Cost management (Cost Explorer, budgets, Compute Optimizer, Savings Plans, Free Tier)
- Network diagnostics (VPC, security groups, NACLs, Transit Gateway, flow logs)
- Container operations (ECS clusters/services/tasks, EKS clusters/nodegroups)
- Audit and compliance (CloudTrail events, Config rules, Well-Architected reviews)
- Downloadable HTML reports with AWS Dark Theme and copy-to-clipboard commands
- Long-term memory that remembers user context across sessions
- File attachments (images, PDFs, documents) for analysis
- Multi-language support (English, Spanish, Portuguese)

## Quick Start

### Prerequisites

- An AWS account
- [AWS CloudShell](https://console.aws.amazon.com/cloudshell/) (recommended) or a local environment with Node.js 18+ and Docker

### Deploy

```bash
git clone https://github.com/RayihBou/AWS-Launch-Pad.git
cd AWS-Launch-Pad
./setup.sh
```

The interactive setup will guide you through the configuration:

1. **Admin email** - Receives the initial Cognito password
2. **Language** - Interface language (en/es/pt)
3. **Cross-account visibility** - Enable multi-account support

### Advanced Deploy

If you prefer to run CDK directly:

```bash
npm install
cd frontend && npm install && npm run build && cd ..
cdk bootstrap
cdk deploy -c adminEmail=admin@example.com -c language=es
```

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `adminEmail` | Yes | - | Admin email for Cognito |
| `language` | No | `en` | UI language (en/es/pt) |
| `enableCrossAccount` | No | `false` | Multi-account visibility |
| `domainName` | No | - | Custom domain |
| `hostedZoneId` | No | - | Route 53 Hosted Zone ID |
| `zoneName` | No | - | Route 53 zone name |

### Post-deployment

1. Check your email for the temporary Cognito password
2. Open the CloudFront URL from the stack outputs
3. Log in and set a new password + MFA (TOTP)

## Architecture

The solution deploys entirely within the customer's AWS account. No data leaves the account except for Bedrock model inference.

| Component | Service |
|-----------|---------|
| Frontend | React + Vite → S3 + CloudFront |
| Agent | Bedrock AgentCore Runtime (Docker arm64, Strands SDK) |
| Model | Claude Sonnet 4.6 via Amazon Bedrock (configurable) |
| MCP Tools | 6 local servers (stdio) + 5 Gateway targets + 15 boto3 tools |
| Chat API | WebSocket API Gateway (Lambda Authorizer, 900s timeout) |
| REST API | HTTP API Gateway (Cognito JWT auth) |
| Auth | Amazon Cognito (MFA TOTP mandatory) |
| Memory | AgentCore Memory (long-term facts) + DynamoDB (conversation history) |
| Security | Bedrock Guardrails (content filtering, PII redaction) |
| Warmup | EventBridge (5 min) + Lambda ping |
| IaC | AWS CDK with @aws-cdk/aws-bedrock-agentcore-alpha |

### MCP Tools (120+)

| Source | Tools | Examples |
|--------|-------|---------|
| Local MCP (stdio) | ~120 | Well-Architected Security, Network, Billing, IAM (readonly), Support, ECS |
| Gateway MCP (Lambda) | ~12 | CloudWatch, Pricing, Security Hub, CloudTrail |
| Gateway MCP (remote) | ~10 | AWS Knowledge (documentation) |
| boto3 @tools | 15 | S3, EC2, CloudWatch, Cost Explorer, EKS, WAF, RDS, HTML reports |

## Security Design

- **Read-only agent:** Never executes write or destructive actions. Provides CLI commands for the user to run in CloudShell
- **No static credentials:** All components use IAM Roles with temporary credentials via STS
- **MFA mandatory:** Cognito TOTP required for all users
- **Least privilege IAM:** Separate policies per MCP server and tool category
- **MCP server protections:** IAM readonly flag, ALLOW_WRITE=false where supported
- **Content filtering:** Bedrock Guardrails blocks prompt injection, PII redaction, off-topic requests
- **Ephemeral file handling:** Attachments auto-delete after processing, reports expire in 24 hours

## Cost Estimation

Based on AWS Pricing API (us-east-1, on-demand). Bedrock tokens dominate ~85% of total cost.

| Usage Level | Users | Messages/month | Estimated Cost |
|-------------|-------|----------------|----------------|
| Low | 5 | 500 | ~$7/month |
| Medium | 20 | 2,500 | ~$35/month |
| High | 50 | 10,000 | ~$140/month |

Cognito is free up to 10,000 MAU. Lambda, API Gateway, DynamoDB, and S3 are effectively free at these volumes. See [docs/cost-estimation.html](docs/cost-estimation.html) for detailed breakdown.

## Project Structure

```
agent/                  # AgentCore Runtime container
  app.py                # Agent: tools, MCP servers, system prompt
  Dockerfile            # Python 3.12-slim + MCP server packages
  requirements.txt      # Dependencies
frontend/               # React frontend (Vite)
  src/components/       # Chat, Header, Login, Sidebar, MessageInput
  src/hooks/            # useAuth, useWebSocket, useIdleTimeout
  src/i18n/             # en.json, es.json, pt.json
scripts/                # Lambda handlers
  websocket/            # ws_handler.py, authorizer.py
  proxy/                # proxy_handler.py
  warmup/               # warmup_handler.py
mcp-lambdas/            # Gateway MCP Lambda handlers
  cloudwatch/           # Metrics, alarms, logs
  cloudtrail/           # Audit events
  pricing/              # AWS Pricing API
  wa-security/          # Security Hub, GuardDuty
infra/                  # CDK infrastructure
  bin/app.ts            # CDK app entry point
  lib/launchpad-stack.ts
  lib/constructs/       # auth, agentcore, websocket, api-proxy, frontend, guardrail, mcp-lambdas
docs/                   # Architecture diagram, cost estimation
```

## Cleanup

To remove all deployed resources:

```bash
cdk destroy
```

This removes all AWS resources created by the stack. Conversation history in DynamoDB and uploaded files in S3 are deleted automatically (removal policy is set to DESTROY).

## Author

Built by Rayih Bou — Solutions Architect, AWS

## License

This project is licensed under the MIT-0 License. See the [LICENSE](LICENSE) file.
