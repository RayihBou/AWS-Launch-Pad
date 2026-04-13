import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { LaunchpadAuth } from './constructs/auth';
import { LaunchpadFrontend } from './constructs/frontend';
import { LaunchpadGuardrail } from './constructs/guardrail';
import { McpLambdas } from './constructs/mcp-lambdas';
import { ApiProxy } from './constructs/api-proxy';
import { LaunchpadAgentCore } from './constructs/agentcore';
import { LaunchpadWebSocket } from './constructs/websocket';

export interface LaunchpadStackProps extends cdk.StackProps {
  adminEmail: string;
  language?: string;
  modelId?: string;
  domainName?: string;
  hostedZoneId?: string;
  zoneName?: string;
}

export class LaunchpadStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: LaunchpadStackProps) {
    super(scope, id, props);

    const language = props.language ?? 'en';
    const modelId = props.modelId ?? 'us.anthropic.claude-sonnet-4-20250514-v1:0';

    // Auth (Cognito + admin user)
    const auth = new LaunchpadAuth(this, 'Auth', {
      adminEmail: props.adminEmail,
    });

    // Guardrail
    const guardrail = new LaunchpadGuardrail(this, 'Guardrail');

    // MCP Lambda functions (Gateway targets)
    const mcpLambdas = new McpLambdas(this, 'McpLambdas');

    // API Proxy (HTTP API, DynamoDB, S3 uploads) - created before AgentCore to get bucket name
    const apiProxy = new ApiProxy(this, 'ApiProxy', {
      userPool: auth.userPool,
      userPoolClient: auth.userPoolClient,
      runtimeArn: '', // Placeholder - updated after AgentCore creation
    });

    // AgentCore (Runtime, Gateway, Memory)
    const agentCore = new LaunchpadAgentCore(this, 'AgentCore', {
      userPool: auth.userPool,
      userPoolClient: auth.userPoolClient,
      mcpLambdas: [
        mcpLambdas.cloudwatchFn,
        mcpLambdas.pricingFn,
        mcpLambdas.waSecurityFn,
        mcpLambdas.cloudtrailFn,
      ],
      language,
      modelId,
      uploadsBucket: apiProxy.uploadsBucket.bucketName,
    });

    // WebSocket (WS API, Authorizer, Handler, Warmup)
    const websocket = new LaunchpadWebSocket(this, 'WebSocket', {
      cognitoClientId: auth.userPoolClient.userPoolClientId,
      runtimeArn: agentCore.runtime.agentRuntimeArn,
      conversationsTableName: apiProxy.conversationsTable.tableName,
      uploadsBucketName: apiProxy.uploadsBucket.bucketName,
    });

    // Frontend (S3 + CloudFront)
    const frontend = new LaunchpadFrontend(this, 'Frontend', {
      domainName: props.domainName,
      hostedZoneId: props.hostedZoneId,
      zoneName: props.zoneName,
    });

    // Outputs
    new cdk.CfnOutput(this, 'UserPoolId', { value: auth.userPool.userPoolId });
    new cdk.CfnOutput(this, 'UserPoolClientId', { value: auth.userPoolClient.userPoolClientId });
    new cdk.CfnOutput(this, 'CloudFrontUrl', { value: frontend.distributionUrl });
    new cdk.CfnOutput(this, 'DistributionId', { value: frontend.distribution.distributionId });
    new cdk.CfnOutput(this, 'FrontendBucketName', { value: frontend.bucket.bucketName });
    new cdk.CfnOutput(this, 'GuardrailId', { value: guardrail.guardrailId });
    new cdk.CfnOutput(this, 'ApiEndpoint', { value: apiProxy.apiUrl });
    new cdk.CfnOutput(this, 'WsEndpoint', { value: websocket.wsEndpoint });
    new cdk.CfnOutput(this, 'RuntimeId', { value: agentCore.runtime.agentRuntimeId });
    new cdk.CfnOutput(this, 'RuntimeArn', { value: agentCore.runtime.agentRuntimeArn });
    new cdk.CfnOutput(this, 'GatewayId', { value: agentCore.gateway.gatewayId });
    new cdk.CfnOutput(this, 'GatewayUrl', { value: agentCore.gateway.gatewayUrl! });
    new cdk.CfnOutput(this, 'MemoryId', { value: agentCore.memory.memoryId });
    new cdk.CfnOutput(this, 'Language', { value: language });
    new cdk.CfnOutput(this, 'ModelId', { value: modelId });
  }
}
