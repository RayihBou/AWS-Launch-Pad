// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
import * as path from 'path';
import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigwv2Integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as apigwv2Authorizers from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import * as cognito from 'aws-cdk-lib/aws-cognito';

export interface ApiProxyProps {
  userPool: cognito.UserPool;
  userPoolClient: cognito.UserPoolClient;
  runtimeArn: string;
  uploadsBucket: s3.Bucket;
}

export class ApiProxy extends Construct {
  public readonly apiUrl: string;
  public readonly conversationsTable: dynamodb.Table;
  public readonly uploadsBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: ApiProxyProps) {
    super(scope, id);

    const account = cdk.Stack.of(this).account;
    const region = cdk.Stack.of(this).region;

    // DynamoDB v2 table (userId PK + conversationId SK)
    this.conversationsTable = new dynamodb.Table(this, 'Conversations', {
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'conversationId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // S3 uploads bucket (passed from parent stack)
    this.uploadsBucket = props.uploadsBucket;

    // Lambda Proxy function
    const proxyFn = new lambda.Function(this, 'ProxyFn', {
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'proxy_handler.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../../scripts/proxy')),
      timeout: cdk.Duration.seconds(120),
      memorySize: 256,
      environment: {
        RUNTIME_ARN: props.runtimeArn,
        QUALIFIER: 'DEFAULT',
        CONVERSATIONS_TABLE: this.conversationsTable.tableName,
        UPLOADS_BUCKET: this.uploadsBucket.bucketName,
      },
    });

    // Proxy permissions
    proxyFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['bedrock-agentcore:InvokeAgentRuntime'],
      resources: [props.runtimeArn],
    }));
    this.conversationsTable.grantReadWriteData(proxyFn);
    this.uploadsBucket.grantReadWrite(proxyFn);

    // API Gateway HTTP API with Cognito JWT authorizer
    const httpApi = new apigwv2.HttpApi(this, 'HttpApi', {
      apiName: 'launchpad-api',
      corsPreflight: {
        allowOrigins: ['*'],
        allowMethods: [
          apigwv2.CorsHttpMethod.POST, apigwv2.CorsHttpMethod.GET,
          apigwv2.CorsHttpMethod.DELETE, apigwv2.CorsHttpMethod.PATCH,
          apigwv2.CorsHttpMethod.OPTIONS,
        ],
        allowHeaders: ['content-type', 'authorization'],
        maxAge: cdk.Duration.hours(1),
      },
    });

    const authorizer = new apigwv2Authorizers.HttpJwtAuthorizer(
      'CognitoAuth',
      `https://cognito-idp.${region}.amazonaws.com/${props.userPool.userPoolId}`,
      { jwtAudience: [props.userPoolClient.userPoolClientId] },
    );

    const integration = new apigwv2Integrations.HttpLambdaIntegration('ProxyIntegration', proxyFn);

    // All routes
    const routes: [string, apigwv2.HttpMethod[]][] = [
      ['/chat', [apigwv2.HttpMethod.POST]],
      ['/history', [apigwv2.HttpMethod.GET, apigwv2.HttpMethod.DELETE, apigwv2.HttpMethod.PATCH]],
      ['/conversations', [apigwv2.HttpMethod.GET]],
      ['/upload-url', [apigwv2.HttpMethod.GET]],
    ];

    for (const [routePath, methods] of routes) {
      httpApi.addRoutes({ path: routePath, methods, integration, authorizer });
    }

    this.apiUrl = httpApi.apiEndpoint;
  }
}
