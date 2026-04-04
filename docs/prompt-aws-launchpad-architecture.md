# AWS LaunchPad Architecture - Diagram Prompt

**File:** `aws-launchpad-architecture.drawio`
**Updated:** 2026-04-03
**Architecture:** Bedrock AgentCore + MCP Servers

## Canvas
| Property | Value |
|----------|-------|
| Width | 1920 |
| Height | 1200 |
| Background | #232F3E (AWS dark) |
| Direction | Left-to-Right |

## Groups (6)
| ID | Label | Border Color | Position |
|----|-------|-------------|----------|
| grp-user | User | #AAAAAA (dashed) | x=40, y=200 |
| grp-frontend | Frontend | #00BCD4 (teal) | x=230, y=170 |
| grp-agentcore | Amazon Bedrock AgentCore | #FF9900 (orange) | x=480, y=110 |
| grp-fm | Foundation Model | #5294CF (blue) | x=740, y=150 |
| grp-mcp | AgentCore Gateway + MCP Servers | #4CAF50 (green) | x=1100, y=110 |
| grp-security | Security | #F44336 (red) | x=1430, y=170 |

## Nodes (17)
| ID | Label | Icon | Group |
|----|-------|------|-------|
| node-user | End User | client | grp-user |
| node-cloudfront | Amazon CloudFront | cloudfront | grp-frontend |
| node-s3-static | Amazon S3 / Static Hosting | s3 | grp-frontend |
| node-runtime | AgentCore Runtime / Strands Agents SDK | bedrock | grp-agentcore |
| node-identity | AgentCore Identity | iam_permissions | grp-agentcore |
| node-policy | AgentCore Policy / Cedar Rules | policy | grp-agentcore |
| node-memory | AgentCore Memory / Short + Long Term | bedrock | grp-agentcore |
| node-observability | AgentCore Observability | cloudwatch | grp-agentcore |
| node-claude | Claude Sonnet 4 / Amazon Bedrock | bedrock_runtime | grp-fm |
| node-gateway | AgentCore Gateway | api_gateway | grp-mcp |
| node-mcp-knowledge | AWS Knowledge MCP Server | bedrock_knowledge_base | grp-mcp |
| node-mcp-pricing | AWS Pricing MCP Server | cost_explorer | grp-mcp |
| node-mcp-security | Well-Architected Security MCP | well_architected_tool | grp-mcp |
| node-mcp-cw | CloudWatch MCP Server | cloudwatch | grp-mcp |
| node-cognito | Amazon Cognito | cognito | grp-security |
| node-guardrails | Bedrock Guardrails | bedrock | grp-security |
| node-cloudtrail | AWS CloudTrail | cloudtrail | grp-security |

## Connections (14)
| Source | Target | Style | Label |
|--------|--------|-------|-------|
| node-user | node-cloudfront | solid white | — |
| node-cloudfront | node-s3-static | solid teal | static assets |
| node-cloudfront | node-runtime | solid orange | API requests |
| node-runtime | node-claude | solid blue | model invoke |
| node-runtime | node-gateway | solid green | tool calls |
| node-gateway | node-mcp-knowledge | dashed green | — |
| node-gateway | node-mcp-pricing | dashed green | — |
| node-mcp-knowledge | node-mcp-security | dashed green | — |
| node-mcp-pricing | node-mcp-cw | dashed green | — |
| node-identity | node-cognito | solid red | auth flow |
| node-runtime | node-memory | solid gray | — |
| node-runtime | node-observability | dashed pink | — |
| node-policy | node-gateway | dashed orange | enforcement |
| node-runtime | node-identity | dashed red | — |
