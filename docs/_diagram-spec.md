# AWS LaunchPad Architecture — Diagram Spec

## Overview
AWS LaunchPad is a GenAI assistant deployed in customer AWS accounts using Bedrock AgentCore. It provides a chat interface with AI-powered AWS infrastructure analysis capabilities through MCP (Model Context Protocol) tools.

## Flows

### Chat Flow (sync, main path)
1. User → CloudFront (CDN + S3 static frontend)
2. User authenticates with Cognito (MFA TOTP)
3. Chat messages via WebSocket API Gateway (Lambda Authorizer validates Cognito JWT)
4. WebSocket API GW → Lambda WS Handler (900s timeout)
5. WS Handler ↔ DynamoDB (conversation history)
6. WS Handler → S3 (download attachments via presigned URLs)
7. WS Handler → Bedrock AgentCore Runtime (Strands SDK agent in Docker)
8. AgentCore Runtime → Bedrock Claude Sonnet 4.6 (LLM inference)
9. AgentCore Runtime → AgentCore Gateway (MCP tools)
10. AgentCore Gateway → 4 Lambda MCP functions (CloudWatch, Pricing, Security, CloudTrail)
11. AgentCore Gateway → AWS Knowledge MCP (remote documentation)
12. AgentCore Runtime → AgentCore Memory (long-term facts)
13. AgentCore Runtime → 6 Local MCP Servers (Security, Network, Billing, IAM, Support, ECS) via stdio
14. AgentCore Runtime → S3 (store HTML reports)
15. Bedrock Guardrails filters content

### REST Flow (sync, secondary)
1. API Gateway HTTP API (Cognito JWT authorizer)
2. API GW → Lambda Proxy (conversation management: GET/DELETE/PATCH history, GET conversations, GET upload-url)
3. Lambda Proxy ↔ DynamoDB + S3 presigned URLs

### Warmup Flow (async)
1. EventBridge (rate 5 min) → Lambda Warmup → AgentCore Runtime (prevent cold starts)

## Supporting Services
- Amazon ECR: Container images for AgentCore Runtime
- Bedrock Guardrails: Content filtering before responses

## Deployment
- CDK-based deployment
- All services are managed/serverless (no VPC)
