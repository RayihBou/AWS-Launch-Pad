import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { LaunchpadAuth } from './constructs/auth';
import { LaunchpadApi } from './constructs/api';
import { LaunchpadAgent } from './constructs/agent';
import { LaunchpadFrontend } from './constructs/frontend';

export interface LaunchpadStackProps extends cdk.StackProps {
  domainName?: string;
  hostedZoneId?: string;
}

export class LaunchpadStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: LaunchpadStackProps) {
    super(scope, id, props);

    // Auth
    const auth = new LaunchpadAuth(this, 'Auth');

    // Orchestrator Lambda
    const orchestrator = new lambda.Function(this, 'Orchestrator', {
      runtime: lambda.Runtime.PYTHON_3_12,
      code: lambda.Code.fromAsset('backend/orchestrator'),
      handler: 'handler.handler',
      timeout: cdk.Duration.seconds(60),
      memorySize: 256,
    });

    // Monitoring Lambda
    const monitoring = new lambda.Function(this, 'Monitoring', {
      runtime: lambda.Runtime.PYTHON_3_12,
      code: lambda.Code.fromAsset('backend/action-groups/monitoring'),
      handler: 'handler.handler',
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
    });

    // Agent
    const agent = new LaunchpadAgent(this, 'Agent', { monitoringHandler: monitoring });

    // Set orchestrator env vars (after agent is created)
    orchestrator.addEnvironment('AGENT_ID', agent.agent.attrAgentId);
    orchestrator.addEnvironment('AGENT_ALIAS_ID', 'TSTALIASID');
    orchestrator.addEnvironment('KB_ID', agent.knowledgeBase.attrKnowledgeBaseId);

    // API
    const api = new LaunchpadApi(this, 'Api', {
      orchestratorHandler: orchestrator,
      userPool: auth.userPool,
    });

    // Frontend
    const frontend = new LaunchpadFrontend(this, 'Frontend', {
      domainName: props.domainName,
      hostedZoneId: props.hostedZoneId,
    });

    // Grant orchestrator bedrock:InvokeAgent
    orchestrator.addToRolePolicy(new iam.PolicyStatement({
      actions: ['bedrock:InvokeAgent'],
      resources: ['*'],
    }));

    // Grant monitoring Lambda CloudWatch + Logs permissions
    monitoring.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'cloudwatch:GetMetricData', 'cloudwatch:DescribeAlarms', 'cloudwatch:ListMetrics',
        'logs:GetLogEvents', 'logs:DescribeLogGroups', 'logs:FilterLogEvents',
      ],
      resources: ['*'],
    }));

    // Outputs
    new cdk.CfnOutput(this, 'WebSocketUrl', { value: `wss://${api.webSocketApi.ref}.execute-api.${this.region}.amazonaws.com/prod` });
    new cdk.CfnOutput(this, 'CloudFrontUrl', { value: frontend.distributionUrl });
    new cdk.CfnOutput(this, 'UserPoolId', { value: auth.userPool.userPoolId });
    new cdk.CfnOutput(this, 'UserPoolClientId', { value: auth.userPoolClient.userPoolClientId });
    new cdk.CfnOutput(this, 'AgentId', { value: agent.agent.attrAgentId });
  }
}
