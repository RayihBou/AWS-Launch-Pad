import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as bedrock from 'aws-cdk-lib/aws-bedrock';

export interface LaunchpadAgentProps {
  monitoringHandler: lambda.Function;
}

export class LaunchpadAgent extends Construct {
  public readonly agent: bedrock.CfnAgent;
  public readonly knowledgeBase: bedrock.CfnKnowledgeBase;
  public readonly vpc: ec2.Vpc;
  public readonly cluster: rds.DatabaseCluster;

  constructor(scope: Construct, id: string, props: LaunchpadAgentProps) {
    super(scope, id);

    const stack = cdk.Stack.of(this);

    // VPC
    this.vpc = new ec2.Vpc(this, 'Vpc', {
      maxAzs: 2,
      natGateways: 1,
    });

    // Aurora PostgreSQL Serverless v2 with pgvector
    const parameterGroup = new rds.ParameterGroup(this, 'PgParams', {
      engine: rds.DatabaseClusterEngine.auroraPostgres({ version: rds.AuroraPostgresEngineVersion.VER_15_4 }),
      parameters: { 'shared_preload_libraries': 'pgvector' },
    });

    this.cluster = new rds.DatabaseCluster(this, 'AuroraCluster', {
      engine: rds.DatabaseClusterEngine.auroraPostgres({ version: rds.AuroraPostgresEngineVersion.VER_15_4 }),
      parameterGroup,
      serverlessV2MinCapacity: 0.5,
      serverlessV2MaxCapacity: 4,
      writer: rds.ClusterInstance.serverlessV2('Writer'),
      vpc: this.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      defaultDatabaseName: 'launchpad',
    });

    // Bedrock Agent IAM Role
    const agentRole = new iam.Role(this, 'AgentRole', {
      assumedBy: new iam.ServicePrincipal('bedrock.amazonaws.com'),
      inlinePolicies: {
        bedrock: new iam.PolicyDocument({
          statements: [new iam.PolicyStatement({
            actions: ['bedrock:InvokeModel'],
            resources: [`arn:aws:bedrock:${stack.region}::foundation-model/*`],
          })],
        }),
      },
    });

    // Bedrock Agent
    this.agent = new bedrock.CfnAgent(this, 'Agent', {
      agentName: 'launchpad-assistant',
      foundationModel: 'anthropic.claude-3-sonnet-20240229-v1:0',
      instruction: 'You are an AWS operations assistant that helps with monitoring, security analysis, and modernization recommendations for cloud infrastructure.',
      idleSessionTtlInSeconds: 1800,
      agentResourceRoleArn: agentRole.roleArn,
      actionGroups: [{
        actionGroupName: 'MonitoringActions',
        actionGroupExecutor: { lambda: props.monitoringHandler.functionArn },
        description: 'Actions for AWS monitoring and observability',
      }],
    });

    // Grant Bedrock permission to invoke monitoring Lambda
    props.monitoringHandler.addPermission('BedrockInvoke', {
      principal: new iam.ServicePrincipal('bedrock.amazonaws.com'),
      sourceArn: this.agent.attrAgentArn,
    });

    // Knowledge Base IAM Role
    const kbRole = new iam.Role(this, 'KBRole', {
      assumedBy: new iam.ServicePrincipal('bedrock.amazonaws.com'),
      inlinePolicies: {
        bedrock: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              actions: ['bedrock:InvokeModel'],
              resources: [`arn:aws:bedrock:${stack.region}::foundation-model/amazon.titan-embed-text-v2:0`],
            }),
            new iam.PolicyStatement({
              actions: ['rds-data:ExecuteStatement', 'rds-data:BatchExecuteStatement', 'rds:DescribeDBClusters'],
              resources: [this.cluster.clusterArn],
            }),
            new iam.PolicyStatement({
              actions: ['secretsmanager:GetSecretValue'],
              resources: [this.cluster.secret!.secretArn],
            }),
          ],
        }),
      },
    });

    // Knowledge Base
    this.knowledgeBase = new bedrock.CfnKnowledgeBase(this, 'KnowledgeBase', {
      name: 'launchpad-kb',
      roleArn: kbRole.roleArn,
      knowledgeBaseConfiguration: {
        type: 'VECTOR',
        vectorKnowledgeBaseConfiguration: {
          embeddingModelArn: `arn:aws:bedrock:${stack.region}::foundation-model/amazon.titan-embed-text-v2:0`,
        },
      },
      storageConfiguration: {
        type: 'RDS',
        rdsConfiguration: {
          credentialsSecretArn: this.cluster.secret!.secretArn,
          databaseName: 'launchpad',
          resourceArn: this.cluster.clusterArn,
          tableName: 'bedrock_kb',
          fieldMapping: {
            primaryKeyField: 'id',
            vectorField: 'embedding',
            textField: 'content',
            metadataField: 'metadata',
          },
        },
      },
    });
  }
}
