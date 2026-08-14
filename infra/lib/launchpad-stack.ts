// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { LaunchpadAuth } from './constructs/auth';
import { LaunchpadFrontend } from './constructs/frontend';
import { LaunchpadGuardrail } from './constructs/guardrail';
import { McpLambdas } from './constructs/mcp-lambdas';
import { ApiProxy } from './constructs/api-proxy';
import { LaunchpadPreflight } from './constructs/preflight';
import { LaunchpadAgentCore } from './constructs/agentcore';
import { LaunchpadWebSocket } from './constructs/websocket';

export interface LaunchpadStackProps extends cdk.StackProps {
  adminEmail: string;
  language?: string;
  modelId?: string;
  /**
   * Reuse an existing AgentCore Memory by name.
   * Must match [a-zA-Z][a-zA-Z0-9_]{0,47} (letters, digits and underscore, max 48 chars).
   * @default - deterministic name derived from the stack name
   */
  memoryName?: string;
  domainName?: string;
  hostedZoneId?: string;
  zoneName?: string;
  enableCrossAccount?: boolean;
  /**
   * Accept the Anthropic end-user terms during the Bedrock model access
   * preflight. Requires the company detail properties below.
   * @default false
   */
  acceptAnthropicTerms?: boolean;
  companyName?: string;
  companyWebsite?: string;
  intendedUsers?: string;
  industryOption?: string;
  useCases?: string;
}

export class LaunchpadStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: LaunchpadStackProps) {
    super(scope, id, props);

    const language = props.language ?? 'en';
    const modelId = props.modelId ?? 'us.anthropic.claude-sonnet-5';

    // Auth (Cognito + admin user)
    const auth = new LaunchpadAuth(this, 'Auth', {
      adminEmail: props.adminEmail,
    });

    // Guardrail
    const guardrail = new LaunchpadGuardrail(this, 'Guardrail');

    // MCP Lambda functions (Gateway targets)
    const mcpLambdas = new McpLambdas(this, 'McpLambdas');

    // S3 uploads bucket (shared between ApiProxy and AgentCore)
    const uploadsBucket = new s3.Bucket(this, 'UploadsBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      lifecycleRules: [{ expiration: cdk.Duration.days(1) }],
      cors: [{
        allowedMethods: [s3.HttpMethods.PUT],
        allowedOrigins: ['*'],
        allowedHeaders: ['*'],
        maxAge: 300,
      }],
    });

    // Bedrock model access preflight - must succeed before anything that
    // depends on the model is created, so the stack fails fast with an
    // actionable message instead of deploying and failing at runtime.
    const preflight = new LaunchpadPreflight(this, 'Preflight', {
      modelId,
      acceptAnthropicTerms: props.acceptAnthropicTerms,
      companyName: props.companyName,
      companyWebsite: props.companyWebsite,
      intendedUsers: props.intendedUsers,
      industryOption: props.industryOption,
      useCases: props.useCases,
    });

    // AgentCore (Runtime, Gateway, Memory) - created before ApiProxy to provide runtimeArn
    const agentCore = new LaunchpadAgentCore(this, 'AgentCore', {
      userPool: auth.userPool,
      userPoolClient: auth.userPoolClient,
      mcpLambdas: [
        mcpLambdas.cloudwatchFn,
        mcpLambdas.pricingFn,
        mcpLambdas.cloudtrailFn,
      ],
      language,
      modelId,
      uploadsBucket: uploadsBucket.bucketName,
      memoryName: props.memoryName,
      enableCrossAccount: props.enableCrossAccount,
      guardrailId: guardrail.guardrailId,
      guardrailVersion: guardrail.guardrailVersion,
    });

    // Nothing in AgentCore is created until the model access check succeeds.
    agentCore.node.addDependency(preflight);

    // API Proxy (HTTP API, DynamoDB) - receives real runtimeArn from AgentCore
    const apiProxy = new ApiProxy(this, 'ApiProxy', {
      userPool: auth.userPool,
      userPoolClient: auth.userPoolClient,
      runtimeArn: agentCore.runtime.agentRuntimeArn,
      uploadsBucket,
    });

    // WebSocket (WS API, Authorizer, Handler, Warmup)
    const websocket = new LaunchpadWebSocket(this, 'WebSocket', {
      cognitoUserPoolId: auth.userPool.userPoolId,
      cognitoClientId: auth.userPoolClient.userPoolClientId,
      runtimeArn: agentCore.runtime.agentRuntimeArn,
      conversationsTableName: apiProxy.conversationsTable.tableName,
      uploadsBucketName: uploadsBucket.bucketName,
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
    new cdk.CfnOutput(this, 'GuardrailVersion', {
      value: guardrail.guardrailVersion,
      description: 'Published guardrail version enforced by the Runtime (GUARDRAIL_VERSION)',
    });
    new cdk.CfnOutput(this, 'ApiEndpoint', { value: apiProxy.apiUrl });
    new cdk.CfnOutput(this, 'WsEndpoint', { value: websocket.wsEndpoint });
    new cdk.CfnOutput(this, 'RuntimeId', { value: agentCore.runtime.agentRuntimeId });
    new cdk.CfnOutput(this, 'RuntimeArn', { value: agentCore.runtime.agentRuntimeArn });
    new cdk.CfnOutput(this, 'GatewayId', { value: agentCore.gateway.gatewayId });
    new cdk.CfnOutput(this, 'GatewayUrl', { value: agentCore.gateway.gatewayUrl! });
    new cdk.CfnOutput(this, 'MemoryId', { value: agentCore.memory.memoryId });
    new cdk.CfnOutput(this, 'MemoryName', {
      value: agentCore.memory.memoryName,
      description: 'Pass this value as -c memoryName=<name> to reuse this memory',
    });
    new cdk.CfnOutput(this, 'Language', { value: language });
    new cdk.CfnOutput(this, 'ModelId', { value: modelId });
    new cdk.CfnOutput(this, 'RuntimeRoleArn', { value: agentCore.runtime.role.roleArn });
  }
}
