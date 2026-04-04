import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as iam from 'aws-cdk-lib/aws-iam';

export interface LaunchpadApiProps {
  orchestratorHandler: lambda.Function;
  userPool: cognito.UserPool;
}

export class LaunchpadApi extends Construct {
  public readonly webSocketApi: apigatewayv2.CfnApi;
  public readonly webSocketStage: apigatewayv2.CfnStage;
  public readonly connectionsUrl: string;

  constructor(scope: Construct, id: string, props: LaunchpadApiProps) {
    super(scope, id);

    this.webSocketApi = new apigatewayv2.CfnApi(this, 'WebSocketApi', {
      name: 'LaunchpadWebSocket',
      protocolType: 'WEBSOCKET',
      routeSelectionExpression: '$request.body.action',
    });

    const integration = new apigatewayv2.CfnIntegration(this, 'LambdaIntegration', {
      apiId: this.webSocketApi.ref,
      integrationType: 'AWS_PROXY',
      integrationUri: `arn:aws:apigateway:${cdk.Stack.of(this).region}:lambda:path/2015-03-31/functions/${props.orchestratorHandler.functionArn}/invocations`,
    });

    const integrationTarget = `integrations/${integration.ref}`;

    for (const routeKey of ['$connect', '$disconnect', 'sendMessage']) {
      new apigatewayv2.CfnRoute(this, `Route_${routeKey.replace('$', '')}`, {
        apiId: this.webSocketApi.ref,
        routeKey,
        target: integrationTarget,
      });
    }

    this.webSocketStage = new apigatewayv2.CfnStage(this, 'ProdStage', {
      apiId: this.webSocketApi.ref,
      stageName: 'prod',
      autoDeploy: true,
    });

    // Grant API Gateway permission to invoke Lambda
    props.orchestratorHandler.addPermission('WebSocketInvoke', {
      principal: new iam.ServicePrincipal('apigateway.amazonaws.com'),
      sourceArn: `arn:aws:execute-api:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:${this.webSocketApi.ref}/*`,
    });

    // Grant Lambda permission to manage WebSocket connections
    this.connectionsUrl = `https://${this.webSocketApi.ref}.execute-api.${cdk.Stack.of(this).region}.amazonaws.com/prod`;

    props.orchestratorHandler.addToRolePolicy(new iam.PolicyStatement({
      actions: ['execute-api:ManageConnections'],
      resources: [`arn:aws:execute-api:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:${this.webSocketApi.ref}/prod/POST/@connections/*`],
    }));
  }
}
