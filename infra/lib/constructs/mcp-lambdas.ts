// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as path from 'path';

export class McpLambdas extends Construct {
  public readonly cloudwatchFn: lambda.Function;
  public readonly pricingFn: lambda.Function;
  public readonly cloudtrailFn: lambda.Function;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    const runtime = lambda.Runtime.PYTHON_3_12;
    const handler = 'handler.handler';
    const timeout = cdk.Duration.seconds(60);
    const memorySize = 512;
    const arch = lambda.Architecture.ARM_64;

    this.cloudwatchFn = new lambda.Function(this, 'CloudWatchMcp', {
      runtime, handler, timeout, memorySize, architecture: arch,
      code: lambda.Code.fromAsset(path.join(__dirname, '../../../mcp-lambdas/cloudwatch')),
    });
    this.cloudwatchFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['cloudwatch:GetMetricData', 'cloudwatch:DescribeAlarms', 'cloudwatch:ListMetrics',
                'logs:GetLogEvents', 'logs:DescribeLogGroups', 'logs:FilterLogEvents'],
      resources: ['*'],
    }));

    this.pricingFn = new lambda.Function(this, 'PricingMcp', {
      runtime, handler, timeout, memorySize, architecture: arch,
      code: lambda.Code.fromAsset(path.join(__dirname, '../../../mcp-lambdas/pricing')),
    });
    this.pricingFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['pricing:GetProducts', 'pricing:DescribeServices', 'pricing:GetAttributeValues'],
      resources: ['*'],
    }));

    this.cloudtrailFn = new lambda.Function(this, 'CloudTrailMcp', {
      runtime, handler, timeout, memorySize, architecture: arch,
      code: lambda.Code.fromAsset(path.join(__dirname, '../../../mcp-lambdas/cloudtrail')),
    });
    this.cloudtrailFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['cloudtrail:LookupEvents', 'cloudtrail:DescribeTrails', 'cloudtrail:GetTrailStatus'],
      resources: ['*'],
    }));

    // Grant AgentCore Gateway permission to invoke all Lambdas
    const gatewayPrincipal = new iam.ServicePrincipal('bedrock.amazonaws.com');
    [this.cloudwatchFn, this.pricingFn, this.cloudtrailFn].forEach(fn => {
      fn.grantInvoke(gatewayPrincipal);
    });
  }
}
