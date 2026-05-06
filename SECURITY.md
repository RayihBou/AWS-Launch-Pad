# Security Policy

## Reporting a Vulnerability

If you discover a potential security issue in this project, we ask that you notify AWS Security via our
[vulnerability reporting page](https://aws.amazon.com/security/vulnerability-reporting/).

Please do **not** create a public GitHub issue for security vulnerabilities.

## Security Best Practices

This project deploys resources in your AWS account. Please review the following:

- The agent operates in **read-only mode** by default
- All API endpoints require **Cognito JWT authentication**
- **MFA is mandatory** for all users
- IAM roles use **least-privilege policies** scoped to specific resources
- No static credentials are stored or used
- Bedrock Guardrails filter harmful content and PII
