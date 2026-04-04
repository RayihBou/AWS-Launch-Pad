# AWS LaunchPad Architecture Diagram - Prompt File

Generated: 2026-04-03

## Canvas
| Property | Value |
|----------|-------|
| Width | 1600 |
| Height | 900 |
| Direction | Left-to-Right |
| Background | #232F3E |

## Groups
| ID | Label | Border Color | Position |
|----|-------|-------------|----------|
| group-user | USER | #AAAAAA (dashed) | x=20, y=320 |
| group-frontend | FRONTEND | #00BCD4 | x=190, y=280 |
| group-agentcore | BEDROCK AGENTCORE | #FF9900 | x=440, y=100 |
| group-mcp | MCP SERVERS | #4CAF50 | x=980, y=100 |
| group-security | SECURITY | #F44336 | x=1240, y=320 |

## Nodes
| ID | Label | Icon (resIcon) | Parent Group |
|----|-------|----------------|-------------|
| node-user | End User | aws4.user | group-user |
| node-cloudfront | Amazon CloudFront | aws4.cloudfront | group-frontend |
| node-s3 | Amazon S3 | aws4.s3 | group-frontend |
| node-runtime | AgentCore Runtime (Strands SDK) | aws4.bedrock | group-agentcore |
| node-claude | Claude Sonnet 4 (Amazon Bedrock) | aws4.bedrock | group-agentcore |
| node-memory | AgentCore Memory | aws4.bedrock | group-agentcore |
| node-identity | AgentCore Identity | aws4.iam | group-agentcore |
| node-policy | AgentCore Policy (Cedar) | aws4.iam | group-agentcore |
| node-observability | AgentCore Observability | aws4.cloudwatch | group-agentcore |
| node-gateway | AgentCore Gateway | aws4.bedrock | group-mcp |
| node-knowledge-mcp | AWS Knowledge MCP | aws4.general_AWS_cloud | group-mcp |
| node-pricing-mcp | AWS Pricing MCP | aws4.general_AWS_cloud | group-mcp |
| node-wa-mcp | WA Security MCP | aws4.general_AWS_cloud | group-mcp |
| node-cw-mcp | CloudWatch MCP | aws4.cloudwatch | group-mcp |
| node-cognito | Amazon Cognito | aws4.cognito | group-security |
| node-guardrails | Bedrock Guardrails | aws4.shield | group-security |
| node-cloudtrail | AWS CloudTrail | aws4.cloudtrail | group-security |

## Connections
| ID | Source | Target | Label | Style |
|----|--------|--------|-------|-------|
| conn-user-cf | node-user | node-cloudfront | HTTPS | solid white |
| conn-cf-s3 | node-cloudfront | node-s3 | static assets | solid white |
| conn-cf-runtime | node-cloudfront | node-runtime | API | solid white |
| conn-runtime-claude | node-runtime | node-claude | model invoke | solid white |
| conn-runtime-gw | node-runtime | node-gateway | tool calls | solid white |
| conn-gw-knowledge | node-gateway | node-knowledge-mcp | — | solid white |
| conn-gw-pricing | node-gateway | node-pricing-mcp | — | solid white |
| conn-gw-wa | node-gateway | node-wa-mcp | — | solid white |
| conn-gw-cw | node-gateway | node-cw-mcp | — | solid white |
| conn-identity-cognito | node-identity | node-cognito | — | solid white |
| conn-runtime-memory | node-runtime | node-memory | — | solid white |
| conn-runtime-obs | node-runtime | node-observability | — | solid white |

## Style Rules
- All labels: plain text (NO HTML), fontColor=#FFFFFF, fontSize=11
- Group labels: fontColor=#FFFFFF, fontSize=14, fontStyle=1 (bold)
- Connection labels: fontColor=#FF9900, fontSize=10
- Connection lines: strokeColor=#FFFFFF, strokeWidth=1
- Node size: 60x60
- Label position: verticalLabelPosition=bottom, verticalAlign=top
