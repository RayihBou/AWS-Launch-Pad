import * as path from 'path';
import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigwv2Integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as apigwv2Authorizers from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import * as cognito from 'aws-cdk-lib/aws-cognito';

export interface ApiProxyProps {
  userPool: cognito.UserPool;
  userPoolClient: cognito.UserPoolClient;
  mcpLambdaArns: string[];
}

export class ApiProxy extends Construct {
  public readonly apiUrl: string;
  public readonly ecrRepository: ecr.Repository;
  public readonly gatewayRoleName: string;
  public readonly runtimeRoleName: string;

  constructor(scope: Construct, id: string, props: ApiProxyProps) {
    super(scope, id);

    const account = cdk.Stack.of(this).account;
    const region = cdk.Stack.of(this).region;

    // DynamoDB table for conversation history
    const conversationsTable = new dynamodb.Table(this, 'Conversations', {
      tableName: 'launchpad-conversations',
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // ECR repository for agent container
    this.ecrRepository = new ecr.Repository(this, 'AgentRepo', {
      repositoryName: 'launchpad-agent',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      emptyOnDelete: true,
    });

    // IAM Role for AgentCore Gateway
    const gatewayRole = new iam.Role(this, 'GatewayRole', {
      roleName: 'LaunchpadGatewayRole',
      assumedBy: new iam.ServicePrincipal('bedrock-agentcore.amazonaws.com'),
    });
    gatewayRole.addToPolicy(new iam.PolicyStatement({
      actions: ['lambda:InvokeFunction'],
      resources: props.mcpLambdaArns.map(arn => `${arn}*`),
    }));
    this.gatewayRoleName = gatewayRole.roleName;

    // IAM Role for AgentCore Runtime
    const runtimeRole = new iam.Role(this, 'RuntimeRole', {
      roleName: 'LaunchpadRuntimeRole',
      assumedBy: new iam.ServicePrincipal('bedrock-agentcore.amazonaws.com'),
    });
    runtimeRole.addToPolicy(new iam.PolicyStatement({
      actions: ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'],
      resources: ['*'],
    }));
    runtimeRole.addToPolicy(new iam.PolicyStatement({
      actions: ['ecr:GetAuthorizationToken'],
      resources: ['*'],
    }));
    runtimeRole.addToPolicy(new iam.PolicyStatement({
      actions: ['ecr:BatchGetImage', 'ecr:GetDownloadUrlForLayer', 'ecr:BatchCheckLayerAvailability'],
      resources: [this.ecrRepository.repositoryArn],
    }));
    runtimeRole.addToPolicy(new iam.PolicyStatement({
      sid: 'ToolAccess',
      actions: [
        's3:ListAllMyBuckets', 's3:ListBucket', 's3:GetObject', 's3:GetBucketLocation',
        'ec2:DescribeInstances', 'ec2:DescribeSecurityGroups', 'ec2:DescribeVpcs',
        'cloudwatch:DescribeAlarms', 'cloudwatch:GetMetricStatistics', 'cloudwatch:ListMetrics',
        'cloudtrail:LookupEvents',
        'lambda:ListFunctions', 'lambda:GetFunction',
        'ce:GetCostAndUsage',
      ],
      resources: ['*'],
      conditions: { StringEquals: { 'aws:RequestedRegion': region } },
    }));
    // S3 needs global resource
    runtimeRole.addToPolicy(new iam.PolicyStatement({
      actions: ['s3:ListAllMyBuckets'],
      resources: ['*'],
    }));
    this.runtimeRoleName = runtimeRole.roleName;

    // Lambda Proxy function
    const proxyFn = new lambda.Function(this, 'ProxyFn', {
      functionName: 'launchpad-proxy',
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'proxy_handler.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../../scripts/proxy')),
      timeout: cdk.Duration.seconds(120),
      memorySize: 256,
      environment: {
        RUNTIME_ARN: '', // Set by deploy script after AgentCore Runtime creation
        QUALIFIER: 'default_endpoint',
      },
    });

    // Proxy permissions
    proxyFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['bedrock-agentcore:InvokeAgentRuntime'],
      resources: [`arn:aws:bedrock-agentcore:${region}:${account}:runtime/*`],
    }));
    conversationsTable.grantReadWriteData(proxyFn);

    // API Gateway HTTP API with Cognito JWT authorizer
    const httpApi = new apigwv2.HttpApi(this, 'HttpApi', {
      apiName: 'launchpad-api',
      corsPreflight: {
        allowOrigins: ['*'],
        allowMethods: [apigwv2.CorsHttpMethod.POST, apigwv2.CorsHttpMethod.GET, apigwv2.CorsHttpMethod.OPTIONS],
        allowHeaders: ['content-type', 'authorization'],
        maxAge: cdk.Duration.hours(1),
      },
    });

    const authorizer = new apigwv2Authorizers.HttpJwtAuthorizer('CognitoAuth', `https://cognito-idp.${region}.amazonaws.com/${props.userPool.userPoolId}`, {
      jwtAudience: [props.userPoolClient.userPoolClientId],
    });

    const integration = new apigwv2Integrations.HttpLambdaIntegration('ProxyIntegration', proxyFn);

    httpApi.addRoutes({
      path: '/chat',
      methods: [apigwv2.HttpMethod.POST],
      integration,
      authorizer,
    });

    httpApi.addRoutes({
      path: '/history',
      methods: [apigwv2.HttpMethod.GET],
      integration,
      authorizer,
    });

    this.apiUrl = httpApi.apiEndpoint;

    // Outputs
    new cdk.CfnOutput(this, 'ApiEndpoint', { value: this.apiUrl });
    new cdk.CfnOutput(this, 'EcrRepositoryUri', { value: this.ecrRepository.repositoryUri });
    new cdk.CfnOutput(this, 'GatewayRoleArn', { value: gatewayRole.roleArn });
    new cdk.CfnOutput(this, 'RuntimeRoleArn', { value: runtimeRole.roleArn });
    new cdk.CfnOutput(this, 'ProxyFunctionName', { value: proxyFn.functionName });
  }
}
