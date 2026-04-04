# AWS LaunchPad Architecture - Diagram Prompt

## Canvas
| Property | Value |
|----------|-------|
| Width | 1920 |
| Height | 1200 |
| Direction | Left-to-Right |
| Background | #232F3E (AWS Dark) |
| Title | AWS LaunchPad — Architecture |
| Subtitle | GenAI Virtual Assistant for AWS Operations |

## Groups (5)
| Group ID | Label | Stroke Color | Parent |
|----------|-------|-------------|--------|
| aws-cloud | AWS Customer Account | #FF9900 | root |
| grp-frontend | Frontend & API Layer | #00A4A6 | aws-cloud |
| grp-genai | GenAI Engine | #56A1F7 | aws-cloud |
| grp-ops | AWS Operations Targets | #E7157B | aws-cloud |
| grp-security | Security & Authentication | #DD344C | aws-cloud |
| grp-iac | Infrastructure as Code | #FF9900 | aws-cloud |

## Nodes (18)
| Node ID | Label | AWS Icon | Group | Position |
|---------|-------|----------|-------|----------|
| end-user | End User (Browser) | aws4.users | root (outside) | x=60, y=290 |
| cloudfront | Amazon CloudFront | aws4.cloudfront | grp-frontend | x=40, y=60 |
| amplify | AWS Amplify Hosting | aws4.amplify | grp-frontend | x=40, y=200 |
| apigw-ws | Amazon API Gateway (WebSocket) | aws4.api_gateway | grp-frontend | x=250, y=60 |
| lambda-orch | AWS Lambda Session Orchestrator | aws4.lambda | grp-frontend | x=250, y=200 |
| bedrock-agent | Amazon Bedrock Agent Core | aws4.bedrock | grp-genai | x=50, y=130 |
| bedrock-kb | Bedrock Knowledge Base (RAG) | aws4.bedrock | grp-genai | x=250, y=50 |
| opensearch | Amazon OpenSearch Serverless | aws4.opensearch_service | grp-genai | x=410, y=50 |
| lambda-actions | AWS Lambda Action Groups | aws4.lambda | grp-genai | x=250, y=220 |
| cloudwatch | Amazon CloudWatch | aws4.cloudwatch | grp-ops | x=40, y=50 |
| security-hub | AWS Security Hub | aws4.security_hub | grp-ops | x=160, y=50 |
| guardduty | Amazon GuardDuty | aws4.guardduty | grp-ops | x=280, y=50 |
| cost-explorer | AWS Cost Explorer | aws4.cost_explorer | grp-ops | x=400, y=50 |
| aws-resources | AWS Resources (EC2, RDS, S3, Lambda) | aws4.management_console | grp-ops | x=220, y=210 |
| cognito | Amazon Cognito (User Pools) | aws4.cognito | grp-security | x=40, y=50 |
| iam | AWS IAM (Least Privilege) | aws4.identity_and_access_management | grp-security | x=200, y=50 |
| kms | AWS KMS (Encryption) | aws4.key_management_service | grp-security | x=360, y=50 |
| cloudtrail | AWS CloudTrail (Audit) | aws4.cloudtrail | grp-security | x=520, y=50 |
| cdk | AWS CDK (Single Deploy) | aws4.cloudformation | grp-iac | x=100, y=50 |

## Connections (13)
| Source | Target | Label | Style | Color |
|--------|--------|-------|-------|-------|
| end-user | cloudfront | HTTPS | solid, 2px | #FF9900 |
| cloudfront | amplify | Static Assets | dashed, 1px | #AAAAAA |
| cloudfront | apigw-ws | WebSocket | solid, 2px | #FF9900 |
| apigw-ws | lambda-orch | Invoke | solid, 2px | #FF9900 |
| lambda-orch | bedrock-agent | Chat Session | solid, 2px | #FF9900 |
| bedrock-agent | bedrock-kb | RAG Query | solid, 2px | #56A1F7 |
| bedrock-kb | opensearch | Vector Search | solid, 2px | #56A1F7 |
| bedrock-agent | lambda-actions | Tool Use | solid, 2px | #56A1F7 |
| lambda-actions | cloudwatch | Metrics | dashed, 1px | #E7157B |
| lambda-actions | security-hub | Findings | dashed, 1px | #DD344C |
| lambda-actions | guardduty | Threats | dashed, 1px | #DD344C |
| lambda-actions | cost-explorer | Cost Data | dashed, 1px | #277116 |
| lambda-actions | aws-resources | Inventory | dashed, 1px | #FF9900 |
| cognito | apigw-ws | Auth Token | dashed, 1px | #DD344C |

## Legend
4 connection styles: Sync (main flow), AI/RAG flow, API calls (async), Security flow
