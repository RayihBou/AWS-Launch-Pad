# AWS LaunchPad Architecture

## Canvas

| Property | Value |
|----------|-------|
| Title | AWS LaunchPad Architecture |
| Direction | LR |
| Width | 1900 |
| Height | 1400 |

## Groups

| ID | Label | Type | Parent | X | Y | Width | Height |
|----|-------|------|--------|---|---|-------|--------|
| aws-cloud | AWS Cloud | aws-cloud | null | 200 | 20 | 1620 | 1190 |

## Nodes

| ID | Parent | Icon | Label | Sublabel | X | Y |
|----|--------|------|-------|----------|---|---|
| user | (root) | user | User | | 40 | 230 |
| cloudfront | aws-cloud | cloudfront | Amazon CloudFront | CDN | 50 | 180 |
| s3-frontend | aws-cloud | s3 | Amazon S3 | Static Frontend | 50 | 380 |
| apigw-ws | aws-cloud | api-gateway | Amazon API Gateway | WebSocket API | 250 | 180 |
| cognito | aws-cloud | cognito | Amazon Cognito | MFA TOTP | 250 | 380 |
| lambda-auth | aws-cloud | lambda | AWS Lambda | Authorizer | 250 | 580 |
| apigw-rest | aws-cloud | api-gateway | Amazon API Gateway | HTTP API | 250 | 780 |
| lambda-ws | aws-cloud | lambda | AWS Lambda | WS Handler | 480 | 180 |
| lambda-proxy | aws-cloud | lambda | AWS Lambda | Proxy | 480 | 780 |
| dynamodb | aws-cloud | dynamodb | Amazon DynamoDB | Conversations | 680 | 380 |
| s3-uploads | aws-cloud | s3 | Amazon S3 | Uploads Bucket | 680 | 580 |
| bedrock-runtime | aws-cloud | bedrock | Amazon Bedrock | AgentCore Runtime | 900 | 180 |
| bedrock-model | aws-cloud | bedrock | Amazon Bedrock | Claude Sonnet 4.6 | 900 | 380 |
| bedrock-memory | aws-cloud | bedrock | Amazon Bedrock | AgentCore Memory | 900 | 580 |
| bedrock-gateway | aws-cloud | bedrock | Amazon Bedrock | AgentCore Gateway | 1120 | 180 |
| lambda-mcp-local | aws-cloud | bedrock | Local MCP Servers | Security, Network, Billing, IAM, Support, ECS | 1120 | 380 |
| bedrock-guardrails | aws-cloud | bedrock | Amazon Bedrock | Guardrails | 1120 | 580 |
| lambda-mcp-cw | aws-cloud | lambda | AWS Lambda | MCP CloudWatch | 1360 | 40 |
| lambda-mcp-pricing | aws-cloud | lambda | AWS Lambda | MCP Pricing | 1360 | 200 |
| lambda-mcp-security | aws-cloud | lambda | AWS Lambda | MCP Security | 1360 | 370 |
| lambda-mcp-ct | aws-cloud | lambda | AWS Lambda | MCP CloudTrail | 1360 | 540 |
| bedrock-knowledge | aws-cloud | bedrock | Amazon Bedrock | AWS Knowledge MCP | 1360 | 710 |
| eventbridge | aws-cloud | eventbridge | Amazon EventBridge | Rate 5 min | 480 | 980 |
| lambda-warmup | aws-cloud | lambda | AWS Lambda | Warmup | 700 | 980 |
| ecr | aws-cloud | ecr | Amazon ECR | Container Images | 920 | 980 |

## Connections

| ID | Source | Target | Exit-Port | Entry-Port | Label | Style | Step |
|----|--------|--------|-----------|------------|-------|-------|------|
| c01 | user | cloudfront | right | left | 1. HTTPS | sync | 1 |
| c02 | cloudfront | s3-frontend | bottom | top | 2. Origin | sync | 2 |
| c03 | user | apigw-ws | right | left | 3. WebSocket | sync | 3 |
| c04 | apigw-ws | lambda-auth | bottom | top | 4. Validate JWT | sync | 4 |
| c05 | lambda-auth | cognito | top | bottom | 5. Verify | sync | 5 |
| c06 | apigw-ws | lambda-ws | right | left | 6. Invoke | sync | 6 |
| c07 | lambda-ws | dynamodb | bottom | left | 7. Load/Save | sync | 7 |
| c08 | lambda-ws | s3-uploads | bottom | left | 8. Attachments | sync | 8 |
| c09 | lambda-ws | bedrock-runtime | right | left | 9. Invoke Agent | sync | 9 |
| c10 | bedrock-runtime | bedrock-model | bottom | top | 10. Inference | sync | 10 |
| c11 | bedrock-runtime | bedrock-gateway | right | left | 11. MCP Tools | async | 11 |
| c12 | bedrock-runtime | bedrock-memory | bottom | top | 12. Memory | sync | 12 |
| c13 | bedrock-runtime | lambda-mcp-local | bottom | left | 13. stdio | async | 13 |
| c14 | bedrock-runtime | s3-uploads | bottom | top | 14. Store Reports | sync | 14 |
| c15 | bedrock-gateway | lambda-mcp-cw | right | left | 15. MCP | async | 15 |
| c16 | bedrock-gateway | lambda-mcp-pricing | right | left | 16. MCP | async | 16 |
| c17 | bedrock-gateway | lambda-mcp-security | right | left | 17. MCP | async | 17 |
| c18 | bedrock-gateway | lambda-mcp-ct | right | left | 18. MCP | async | 18 |
| c19 | bedrock-gateway | bedrock-knowledge | bottom | left | 19. AWS Docs | async | 19 |
| c20 | user | apigw-rest | right | left | 20. REST | sync | 20 |
| c21 | apigw-rest | cognito | top | bottom | 21. JWT Auth | sync | 21 |
| c22 | apigw-rest | lambda-proxy | right | left | 22. Invoke | sync | 22 |
| c23 | lambda-proxy | dynamodb | right | bottom | 23. Read/Write | sync | 23 |
| c24 | lambda-proxy | s3-uploads | right | left | 24. Presigned URL | sync | 24 |
| c25 | eventbridge | lambda-warmup | right | left | 25. Trigger | async | 25 |
| c26 | lambda-warmup | bedrock-runtime | top | bottom | 26. Ping | async | 26 |

## Style Notes

- Sync (solid arrows): Used for the main chat flow (User → CloudFront → API GW → Lambda → Bedrock) and REST flow (API GW → Lambda → DynamoDB/S3)
- Async (dashed arrows): Used for EventBridge warmup trigger, MCP Gateway connections to Lambda MCP functions, Local MCP stdio connections, and AWS Knowledge MCP
- AgentCore services (Runtime, Gateway, Memory) use Amazon Bedrock icon with descriptive sublabels
- Local MCP Servers consolidated into single node with all 6 server names in sublabel
- Supporting services (ECR, Guardrails) shown without connections per 8+ node rule
- Lambda Authorizer placed below WebSocket API Gateway in auth chain pattern
- Both API Gateways share Cognito for JWT validation (vertical connections)
