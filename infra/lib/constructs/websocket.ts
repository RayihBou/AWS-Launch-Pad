// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
import * as path from 'path';
import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigwv2Integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as apigwv2Authorizers from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';

export interface LaunchpadWebSocketProps {
  cognitoClientId: string;
  runtimeArn: string;
  conversationsTableName: string;
  uploadsBucketName: string;
}

export class LaunchpadWebSocket extends Construct {
  public readonly wsApi: apigwv2.WebSocketApi;
  public readonly wsStage: apigwv2.WebSocketStage;
  public readonly wsEndpoint: string;

  constructor(scope: Construct, id: string, props: LaunchpadWebSocketProps) {
    super(scope, id);

    const region = cdk.Stack.of(this).region;
    const account = cdk.Stack.of(this).account;

    // Lambda Authorizer (validates Cognito JWT on $connect)
    const authorizerFn = new lambda.Function(this, 'AuthorizerFn', {
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'authorizer.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../../scripts/websocket')),
      timeout: cdk.Duration.seconds(10),
      memorySize: 128,
      environment: {
        COGNITO_CLIENT_ID: props.cognitoClientId,
      },
    });

    // WS Handler (invokes AgentCore Runtime, streams responses)
    const wsHandlerFn = new lambda.Function(this, 'WsHandlerFn', {
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'ws_handler.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../../scripts/websocket')),
      timeout: cdk.Duration.seconds(900),
      memorySize: 512,
      environment: {
        RUNTIME_ARN: props.runtimeArn,
        QUALIFIER: 'default_endpoint',
        CONVERSATIONS_TABLE: props.conversationsTableName,
        UPLOADS_BUCKET: props.uploadsBucketName,
      },
    });

    // Grant WS handler permissions
    wsHandlerFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['bedrock-agentcore:InvokeAgentRuntime'],
      resources: [props.runtimeArn, `${props.runtimeArn}/*`],
    }));
    wsHandlerFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:UpdateItem', 'dynamodb:Query'],
      resources: [`arn:aws:dynamodb:${region}:${account}:table/${props.conversationsTableName}`],
    }));
    wsHandlerFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['s3:GetObject', 's3:DeleteObject'],
      resources: [`arn:aws:s3:::${props.uploadsBucketName}/*`],
    }));

    // WebSocket API
    this.wsApi = new apigwv2.WebSocketApi(this, 'WsApi', {
      apiName: 'launchpad-ws',
    });

    this.wsStage = new apigwv2.WebSocketStage(this, 'WsStage', {
      webSocketApi: this.wsApi,
      stageName: 'production',
      autoDeploy: true,
    });

    // Grant manage connections (postToConnection)
    wsHandlerFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['execute-api:ManageConnections'],
      resources: [
        `arn:aws:execute-api:${region}:${account}:${this.wsApi.apiId}/${this.wsStage.stageName}/POST/@connections/*`,
      ],
    }));

    // Set WS_ENDPOINT env var for postToConnection
    wsHandlerFn.addEnvironment('WS_ENDPOINT',
      `https://${this.wsApi.apiId}.execute-api.${region}.amazonaws.com/${this.wsStage.stageName}`);

    // Authorizer
    const authorizer = new apigwv2Authorizers.WebSocketLambdaAuthorizer('WsAuth', authorizerFn, {
      identitySource: ['route.request.querystring.token'],
    });

    // Routes
    const wsIntegration = new apigwv2Integrations.WebSocketLambdaIntegration('WsIntegration', wsHandlerFn);

    this.wsApi.addRoute('$connect', { integration: wsIntegration, authorizer });
    this.wsApi.addRoute('$disconnect', { integration: wsIntegration });
    this.wsApi.addRoute('sendMessage', { integration: wsIntegration });

    this.wsEndpoint = `wss://${this.wsApi.apiId}.execute-api.${region}.amazonaws.com/${this.wsStage.stageName}`;

    // --- Warmup Lambda + EventBridge ---
    const warmupFn = new lambda.Function(this, 'WarmupFn', {
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'warmup_handler.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../../scripts/warmup')),
      timeout: cdk.Duration.seconds(30),
      memorySize: 128,
      environment: {
        RUNTIME_ARN: props.runtimeArn,
        QUALIFIER: 'default_endpoint',
      },
    });

    warmupFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['bedrock-agentcore:InvokeAgentRuntime'],
      resources: [props.runtimeArn, `${props.runtimeArn}/*`],
    }));

    new events.Rule(this, 'WarmupRule', {
      schedule: events.Schedule.rate(cdk.Duration.minutes(5)),
      targets: [new targets.LambdaFunction(warmupFn)],
    });
  }
}
