# AWS LaunchPad

AI-powered virtual assistant deployable in customer AWS accounts. Built on Amazon Bedrock AgentCore with Strands Agents SDK, MCP servers, and long-term memory to provide comprehensive AWS operations support through a conversational interface.

## Overview

AWS LaunchPad is a read-only cloud operations assistant that helps users monitor, analyze, and troubleshoot their AWS infrastructure. It provides security assessments, cost analysis, network diagnostics, and actionable remediation guidance with CLI commands ready to execute in AWS CloudShell.

**Live demo:** https://launchpad.rayihbou.people.aws.dev

## Key Features

- **Security Assessment:** Well-Architected security posture analysis, GuardDuty/Security Hub/Inspector findings, WAF configuration, S3 bucket security, RDS encryption audit
- **Cost Management:** Cost Explorer analysis, budget monitoring, Compute Optimizer recommendations, Savings Plans guidance, Free Tier tracking
- **Network Diagnostics:** VPC analysis, security groups, NACLs, Transit Gateway, Network Firewall, flow logs, path tracing
- **IAM Analysis:** Users, roles, policies, groups listing, permission simulation (read-only)
- **Container Operations:** ECS clusters/services/tasks/troubleshooting, EKS clusters/nodegroups
- **Remediation Guidance:** CLI commands with copy buttons, CloudShell instructions, estimated costs for enabling services
- **HTML Reports:** Downloadable reports with AWS Dark Theme, console hyperlinks, copy-to-clipboard commands
- **Long-term Memory:** Remembers user preferences and context across sessions
- **File Attachments:** Upload images, PDFs, documents for analysis (S3 presigned URL)
- **Multi-language:** Spanish, English, Portuguese (configurable)

## Architecture

```
User -> CloudFront (custom domain)
  |-- /* -> S3 (React frontend)
  |-- Login -> Cognito (MFA TOTP mandatory)
        |-- Chat -> WebSocket API Gateway (Lambda Authorizer, 900s timeout)
        |     |-- Lambda WS Handler (heartbeat progress messages)
        |           |-- DynamoDB v2 (conversation history)
        |           |-- S3 presigned URL (file attachments + HTML reports)
        |           |-- AgentCore Runtime (BedrockAgentCoreApp, Docker arm64)
        |                 |-- 15 boto3 @tools (S3, EC2, CW, CT, Lambda, CE, EKS, WAF, RDS, HTML)
        |                 |-- 6 MCP Local servers (security, network, billing, IAM, support, ECS)
        |                 |-- MCP Gateway -> 4 targets (knowledge, pricing, cloudwatch, cloudtrail)
        |                 |-- AgentCore Memory (long-term facts)
        |                 |-- Bedrock Claude Sonnet 4.6 (Converse API + multimodal)
        |
        |-- REST -> HTTP API Gateway (Cognito JWT auth)
              |-- GET /upload-url, GET /conversations, GET/DELETE/PATCH /history

Warmup: EventBridge (5 min) -> Lambda -> AgentCore Runtime (ping)
```

## Tech Stack

| Component | Service |
|-----------|--------|
| Frontend | React + Vite + S3 + CloudFront |
| Agent Runtime | Amazon Bedrock AgentCore Runtime (Docker arm64) |
| Agent Framework | Strands Agents SDK + BedrockAgentCoreApp |
| Model | Claude Sonnet 4.6 (configurable) |
| MCP Local | 6 servers: security, network, billing, IAM (readonly), support, ECS |
| MCP Gateway | 4 targets: aws-knowledge, pricing, cloudwatch, cloudtrail |
| boto3 Tools | 15 tools: S3, EC2, CloudWatch, CloudTrail, Lambda, Cost Explorer, EKS, WAF, S3-security, RDS, HTML report, pricing fetch |
| Chat API | WebSocket API Gateway (Lambda Authorizer) |
| REST API | HTTP API Gateway (Cognito JWT auth) |
| Auth | Amazon Cognito (MFA TOTP mandatory) |
| Memory | AgentCore Memory (long-term) + DynamoDB v2 (conversation history) |
| Warmup | EventBridge (5 min) + Lambda ping |

## Security Design

- **Read-only agent:** No write or destructive actions. Provides CLI commands for user to execute via CloudShell
- **No static credentials:** All components use IAM Roles with temporary credentials
- **Cognito MFA:** TOTP mandatory for all users
- **Least privilege IAM:** Separate policies per MCP server and tool category
- **MCP server protections:** IAM readonly flag, ALLOW_WRITE=false for ECS
- **Content filtering:** Bedrock Guardrails for prompt injection, PII redaction
- **Presigned URLs:** File attachments auto-delete after processing, reports expire in 24h

## Project Structure

```
agent/              # AgentCore Runtime (Docker container)
  app.py            # Main agent: tools, MCP servers, system prompt, HTML template
  Dockerfile        # Python 3.12-slim + all MCP server packages
  requirements.txt  # Dependencies (strands, bedrock-agentcore, awslabs MCP servers)
frontend/           # React frontend
  src/components/   # Chat, Header, Login, MessageInput, MessageList, Sidebar
  src/hooks/        # useAuth, useWebSocket
  src/i18n/         # en, es, pt translations
scripts/            # Lambda handlers
  websocket/        # ws_handler.py (heartbeat), authorizer.py
  proxy/            # proxy_handler.py (REST API + S3 presigned URLs)
  warmup/           # warmup_handler.py
mcp-lambdas/        # Gateway MCP Lambda handlers
  cloudwatch/       # CloudWatch metrics, alarms, logs
  cloudtrail/       # Audit events
  pricing/          # AWS Pricing API
infra/              # CDK constructs (to be updated in Phase E)
docs/               # Architecture diagram, cost estimation
```

## Deploy Procedure (Current - Manual)

```bash
# 1. Build and push Docker image
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin ACCOUNT.dkr.ecr.us-east-1.amazonaws.com
docker buildx build --platform linux/arm64 -t ACCOUNT.dkr.ecr.us-east-1.amazonaws.com/launchpad-agent:latest --push agent/

# 2. Update runtime (ALWAYS include ALL env vars)
aws bedrock-agentcore-control update-agent-runtime --agent-runtime-id RUNTIME_ID \
  --agent-runtime-artifact '{"containerConfiguration":{"containerUri":"ACCOUNT.dkr.ecr.us-east-1.amazonaws.com/launchpad-agent:latest"}}' \
  --environment-variables '{"LANGUAGE":"es","GATEWAY_ENDPOINT":"...","MEMORY_ID":"...","MODEL_ID":"us.anthropic.claude-sonnet-4-6","UPLOADS_BUCKET":"..."}' \
  --region us-east-1

# 3. Update endpoint to new version
aws bedrock-agentcore-control update-agent-runtime-endpoint --agent-runtime-id RUNTIME_ID \
  --endpoint-name default_endpoint --agent-runtime-version VERSION --region us-east-1
```

## Development Status

| Phase | Scope | Status |
|-------|-------|--------|
| Phase A | Agent optimization (BedrockAgentCoreApp, Memory) | Completed |
| Phase B | MCP Servers (security, network, billing, IAM, support, ECS, EKS) | Completed |
| Phase C | Write actions | Retired (read-only by design) |
| Phase D | HTML reports, auto-logout, landing page, user management | In Progress |
| Phase E | CDK migration, architecture diagram, README, executive document | Planned |

## Author

Rayih Bou — Solutions Architect, AWS LATAM CSC

## License

Amazon Confidential — Internal Use
