// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
import * as path from 'path';
import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';

export interface LaunchpadPreflightProps {
  /**
   * Bedrock model or inference profile id the agent will invoke,
   * e.g. `us.anthropic.claude-sonnet-5`. The handler strips the inference
   * profile prefix to derive the base model id for the availability checks.
   */
  modelId: string;
  /**
   * Accept the Anthropic end-user terms automatically when the account has no
   * model access yet. Requires all the company detail properties below.
   * When false, the preflight only reports what is missing and fails the stack
   * with the exact CLI command to grant access manually.
   * @default false
   */
  acceptAnthropicTerms?: boolean;
  /** Company name for the Anthropic first-time-use form. */
  companyName?: string;
  /** Company website (full URL) for the Anthropic first-time-use form. */
  companyWebsite?: string;
  /** Estimated number of intended users for the Anthropic first-time-use form. */
  intendedUsers?: string;
  /** Industry option for the Anthropic first-time-use form. */
  industryOption?: string;
  /** Description of the intended use cases for the Anthropic first-time-use form. */
  useCases?: string;
}

/**
 * Bedrock model access preflight check.
 *
 * Deploys a Lambda-backed Custom Resource that verifies (and optionally
 * enables) access to the configured Bedrock model before the AgentCore Runtime
 * is created. Without it, the stack deploys successfully and only fails at
 * runtime, when the agent gets an AccessDeniedException on the first message.
 */
export class LaunchpadPreflight extends Construct {
  public readonly fn: lambda.Function;
  public readonly resource: cdk.CustomResource;

  constructor(scope: Construct, id: string, props: LaunchpadPreflightProps) {
    super(scope, id);

    const region = cdk.Stack.of(this).region;

    // No explicit functionName: CloudFormation generates a unique physical name,
    // so several LaunchPad stacks can coexist in the same account and region.
    this.fn = new lambda.Function(this, 'PreflightFn', {
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'preflight_handler.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../../scripts/preflight')),
      // The handler polls for entitlement propagation for up to 180s and then
      // performs a Converse ping, so it needs headroom above that budget.
      timeout: cdk.Duration.seconds(300),
      memorySize: 256,
      logRetention: logs.RetentionDays.ONE_MONTH,
    });

    this.fn.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        // Read the current access state of the model.
        'bedrock:GetFoundationModelAvailability',
        // Fetch the offer token and accept the model agreement.
        'bedrock:ListFoundationModelAgreementOffers',
        'bedrock:CreateFoundationModelAgreement',
        // Submit the Anthropic first-time-use form.
        'bedrock:PutUseCaseForModelAccess',
        // Converse ping that proves the model is really invocable.
        'bedrock:InvokeModel',
        // Bedrock model agreements are fulfilled through AWS Marketplace, so
        // these two actions are mandatory per the Bedrock documentation for
        // requesting model access: CreateFoundationModelAgreement fails with
        // AccessDeniedException without aws-marketplace:Subscribe, and the
        // subscription state cannot be read without ViewSubscriptions.
        'aws-marketplace:Subscribe',
        'aws-marketplace:ViewSubscriptions',
      ],
      // None of these actions support resource-level permissions.
      resources: ['*'],
    }));

    // Property values are strings: CloudFormation stringifies every custom
    // resource property, and the handler normalises them (is_truthy, str()).
    this.resource = new cdk.CustomResource(this, 'ModelAccessCheck', {
      serviceToken: this.fn.functionArn,
      resourceType: 'Custom::BedrockModelAccessPreflight',
      properties: {
        ModelId: props.modelId,
        Region: region,
        AcceptAnthropicTerms: String(props.acceptAnthropicTerms ?? false),
        CompanyName: props.companyName ?? '',
        CompanyWebsite: props.companyWebsite ?? '',
        IntendedUsers: props.intendedUsers ?? '',
        IndustryOption: props.industryOption ?? '',
        UseCases: props.useCases ?? '',
      },
    });
  }
}
