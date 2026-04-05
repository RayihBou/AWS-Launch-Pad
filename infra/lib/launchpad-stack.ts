import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { LaunchpadAuth } from './constructs/auth';
import { LaunchpadFrontend } from './constructs/frontend';
import { LaunchpadGuardrail } from './constructs/guardrail';
import { McpLambdas } from './constructs/mcp-lambdas';
import { ApiProxy } from './constructs/api-proxy';

export interface LaunchpadStackProps extends cdk.StackProps {
  domainName?: string;
  hostedZoneId?: string;
  zoneName?: string;
  language?: string;
}

export class LaunchpadStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: LaunchpadStackProps = {}) {
    super(scope, id, props);

    const auth = new LaunchpadAuth(this, 'Auth');
    const guardrail = new LaunchpadGuardrail(this, 'Guardrail');
    const mcpLambdas = new McpLambdas(this, 'McpLambdas');

    const apiProxy = new ApiProxy(this, 'ApiProxy', {
      userPool: auth.userPool,
      userPoolClient: auth.userPoolClient,
      mcpLambdaArns: [
        mcpLambdas.cloudwatchFn.functionArn,
        mcpLambdas.pricingFn.functionArn,
        mcpLambdas.waSecurityFn.functionArn,
        mcpLambdas.cloudtrailFn.functionArn,
      ],
    });

    const frontend = new LaunchpadFrontend(this, 'Frontend', {
      domainName: props.domainName,
      hostedZoneId: props.hostedZoneId,
      zoneName: props.zoneName,
    });

    // Outputs
    new cdk.CfnOutput(this, 'UserPoolId', { value: auth.userPool.userPoolId });
    new cdk.CfnOutput(this, 'UserPoolClientId', { value: auth.userPoolClient.userPoolClientId });
    new cdk.CfnOutput(this, 'CloudFrontUrl', { value: frontend.distributionUrl });
    new cdk.CfnOutput(this, 'GuardrailId', { value: guardrail.guardrailId });
    new cdk.CfnOutput(this, 'GuardrailVersion', { value: guardrail.guardrailVersion });
    new cdk.CfnOutput(this, 'Language', { value: props.language ?? 'en' });
    new cdk.CfnOutput(this, 'FrontendBucket', { value: frontend.bucket.bucketName });
    new cdk.CfnOutput(this, 'DistributionId', { value: frontend.distribution.distributionId });
    new cdk.CfnOutput(this, 'CloudWatchMcpArn', { value: mcpLambdas.cloudwatchFn.functionArn });
    new cdk.CfnOutput(this, 'PricingMcpArn', { value: mcpLambdas.pricingFn.functionArn });
    new cdk.CfnOutput(this, 'WaSecurityMcpArn', { value: mcpLambdas.waSecurityFn.functionArn });
    new cdk.CfnOutput(this, 'CloudTrailMcpArn', { value: mcpLambdas.cloudtrailFn.functionArn });
  }
}
