// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
import * as path from 'path';
import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as agentcore from '@aws-cdk/aws-bedrock-agentcore-alpha';
import { deterministicName } from '../naming';

export interface LaunchpadAgentCoreProps {
  userPool: cognito.UserPool;
  userPoolClient: cognito.UserPoolClient;
  mcpLambdas: lambda.Function[];
  language: string;
  modelId: string;
  uploadsBucket: string;
  /**
   * Name of the AgentCore Memory resource.
   * Must match [a-zA-Z][a-zA-Z0-9_]{0,47} (letters, digits and underscore only, max 48 chars).
   * Provide an existing name to reuse a memory; otherwise a deterministic
   * per-stack name is generated to avoid collisions between stacks.
   * @default - `launchpad_<stackName>_<hash>`
   */
  memoryName?: string;
  enableCrossAccount?: boolean;
  /** Guardrail id enforced by the agent on every model invocation. */
  guardrailId: string;
  /**
   * Published guardrail version (never `DRAFT`). Required so the Runtime always
   * enforces the exact snapshot deployed by this stack.
   */
  guardrailVersion: string;
}

export class LaunchpadAgentCore extends Construct {
  public readonly runtime: agentcore.Runtime;
  public readonly gateway: agentcore.Gateway;
  public readonly memory: agentcore.Memory;

  constructor(scope: Construct, id: string, props: LaunchpadAgentCoreProps) {
    super(scope, id);

    const region = cdk.Stack.of(this).region;

    // --- Memory ---
    // AgentCore Memory names must match [a-zA-Z][a-zA-Z0-9_]{0,47}: letters, digits
    // and underscore only (no hyphens), max 48 chars. A hardcoded name collides with
    // orphaned memories and prevents two stacks in the same account/region, so the
    // default is derived deterministically from the stack name.
    const memoryName = props.memoryName ?? deterministicName(this, {
      prefix: 'launchpad',
      separator: '_',
      maxLength: 48,
    });

    this.memory = new agentcore.Memory(this, 'Memory', {
      memoryName,
      description: 'LaunchPad agent long-term memory',
      expirationDuration: cdk.Duration.days(365),
      memoryStrategies: [
        agentcore.MemoryStrategy.usingBuiltInSemantic(),
      ],
    });

    // --- Gateway with Custom JWT (Cognito) ---
    // Gateway names must match ^([0-9a-zA-Z][-]?){1,48}$: alphanumeric characters
    // with single hyphens between them (no underscores), max 48 chars.
    this.gateway = new agentcore.Gateway(this, 'Gateway', {
      gatewayName: deterministicName(this, {
        prefix: 'launchpad-gateway',
        separator: '-',
        maxLength: 48,
      }),
      authorizerConfiguration: agentcore.GatewayAuthorizer.usingCustomJwt({
        discoveryUrl: `https://cognito-idp.${region}.amazonaws.com/${props.userPool.userPoolId}/.well-known/openid-configuration`,
        allowedAudience: [props.userPoolClient.userPoolClientId],
      }),
    });

    // Remote MCP target: AWS Knowledge (public, uses IAM role)
    const knowledgeTarget = this.gateway.addMcpServerTarget('KnowledgeTarget', {
      gatewayTargetName: 'aws-knowledge-mcp',
      description: 'AWS documentation and best practices',
      endpoint: 'https://knowledge-mcp.global.api.aws',
      credentialProviderConfigurations: [
        agentcore.GatewayCredentialProvider.fromIamRole(),
      ],
    });

    // Escape hatch: Knowledge MCP is a public AWS endpoint - no credentials needed at target level
    const cfnKnowledgeTarget = knowledgeTarget.node.defaultChild as cdk.CfnResource;
    cfnKnowledgeTarget.addPropertyDeletionOverride('CredentialProviderConfigurations');

    // Lambda MCP targets with tool schemas
    const lambdaTargets: { name: string; desc: string; tools: any[] }[] = [
      {
        name: 'cloudwatch-mcp', desc: 'CloudWatch monitoring',
        tools: [
          { name: 'describe_alarms', description: 'List CloudWatch alarms', inputSchema: { type: 'object', properties: { state: { type: 'string' } }, required: [] } },
          { name: 'get_metric_statistics', description: 'Get metric stats', inputSchema: { type: 'object', properties: { namespace: { type: 'string' }, metric_name: { type: 'string' }, dimension_name: { type: 'string' }, dimension_value: { type: 'string' }, hours: { type: 'number' } }, required: ['namespace', 'metric_name'] } },
          { name: 'list_log_groups', description: 'List CloudWatch log groups', inputSchema: { type: 'object', properties: { prefix: { type: 'string' }, limit: { type: 'number' } }, required: [] } },
        ],
      },
      {
        name: 'pricing-mcp', desc: 'AWS Pricing',
        tools: [
          { name: 'get_products', description: 'Get pricing for AWS services', inputSchema: { type: 'object', properties: { service_code: { type: 'string' }, instance_type: { type: 'string' }, region: { type: 'string' } }, required: ['service_code'] } },
          { name: 'describe_services', description: 'List AWS services in Pricing API', inputSchema: { type: 'object', properties: { service_code: { type: 'string' } }, required: [] } },
        ],
      },
      {
        name: 'cloudtrail-mcp', desc: 'CloudTrail audit',
        tools: [
          { name: 'lookup_events', description: 'Look up CloudTrail events', inputSchema: { type: 'object', properties: { lookup_attributes: { type: 'object' }, max_results: { type: 'number' } }, required: [] } },
          { name: 'describe_trails', description: 'Describe trails', inputSchema: { type: 'object', properties: {}, required: [] } },
        ],
      },
    ];

    props.mcpLambdas.forEach((fn, i) => {
      this.gateway.addLambdaTarget(`McpTarget${i}`, {
        gatewayTargetName: lambdaTargets[i].name,
        description: lambdaTargets[i].desc,
        lambdaFunction: fn,
        toolSchema: agentcore.ToolSchema.fromInline(lambdaTargets[i].tools),
      });
    });

    // --- Runtime from container image ---
    // The container URI is injected via CDK context by setup.sh
    const containerUri = scope.node.tryGetContext('containerUri') ||
      `${cdk.Stack.of(this).account}.dkr.ecr.${cdk.Stack.of(this).region}.amazonaws.com/launchpad-agent:latest`;
    const artifact = agentcore.AgentRuntimeArtifact.fromImageUri(containerUri);

    this.runtime = new agentcore.Runtime(this, 'Runtime', {
      // Runtime names must match ^[a-zA-Z][a-zA-Z0-9_]{0,47}$: they start with a
      // letter and only allow letters, digits and underscores (no hyphens),
      // which is a different alphabet from the Gateway name above.
      runtimeName: deterministicName(this, {
        prefix: 'launchpad_agent',
        separator: '_',
        maxLength: 48,
      }),
      agentRuntimeArtifact: artifact,
      description: 'LaunchPad Strands SDK agent',
      environmentVariables: {
        LANGUAGE: props.language,
        MODEL_ID: props.modelId,
        GATEWAY_ENDPOINT: this.gateway.gatewayUrl!,
        MEMORY_ID: this.memory.memoryId,
        UPLOADS_BUCKET: props.uploadsBucket,
        ...(props.enableCrossAccount ? { ENABLE_CROSS_ACCOUNT: 'true' } : {}),
        // Both values are always injected: BedrockModel only attaches the
        // guardrail when id and version are present, and an empty version would
        // silently fall back to DRAFT instead of the published snapshot.
        GUARDRAIL_ID: props.guardrailId,
        GUARDRAIL_VERSION: props.guardrailVersion,
      },
    });

    // Grant ECR pull access for container image
    this.runtime.addToRolePolicy(new iam.PolicyStatement({
      actions: ['ecr:GetAuthorizationToken'],
      resources: ['*'],
    }));
    this.runtime.addToRolePolicy(new iam.PolicyStatement({
      actions: ['ecr:BatchGetImage', 'ecr:GetDownloadUrlForLayer', 'ecr:BatchCheckLayerAvailability'],
      resources: [`arn:aws:ecr:${region}:${cdk.Stack.of(this).account}:repository/launchpad-agent`],
    }));

    // Grant Bedrock model invocation
    this.runtime.addToRolePolicy(new iam.PolicyStatement({
      actions: ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'],
      resources: ['arn:aws:bedrock:*::foundation-model/*', 'arn:aws:bedrock:*:*:inference-profile/*'],
    }));

    // Grant AgentCore Memory access
    this.runtime.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'bedrock-agentcore:CreateMemoryEvent', 'bedrock-agentcore:RetrieveMemoryRecords',
        'bedrock-agentcore:SearchMemoryRecords', 'bedrock-agentcore:GetMemory',
      ],
      resources: [this.memory.memoryArn],
    }));

    // Grant read-only access to AWS services (tools + MCP servers).
    // This statement must remain read-only: the agent never performs write or
    // mutating actions. The only write grant lives in ReportUploadWriteAccess below.
    this.runtime.addToRolePolicy(new iam.PolicyStatement({
      sid: 'ReadOnlyToolAccess',
      actions: [
        // S3
        's3:ListAllMyBuckets', 's3:ListBucket', 's3:GetObject', 's3:GetBucketLocation',
        's3:GetBucketPublicAccessBlock', 's3:GetEncryptionConfiguration', 's3:GetBucketVersioning',
        // EC2
        'ec2:DescribeInstances', 'ec2:DescribeSecurityGroups', 'ec2:DescribeVpcs',
        'ec2:DescribeSubnets', 'ec2:DescribeRouteTables', 'ec2:DescribeNatGateways',
        'ec2:DescribeVpcEndpoints', 'ec2:DescribeNetworkInterfaces', 'ec2:DescribeFlowLogs',
        'ec2:DescribeTransitGateways', 'ec2:DescribeVpnConnections',
        // CloudWatch
        'cloudwatch:DescribeAlarms', 'cloudwatch:GetMetricStatistics', 'cloudwatch:GetMetricData', 'cloudwatch:ListMetrics',
        'logs:GetLogEvents', 'logs:DescribeLogGroups', 'logs:FilterLogEvents',
        // CloudTrail
        'cloudtrail:LookupEvents', 'cloudtrail:DescribeTrails', 'cloudtrail:GetTrailStatus',
        // Lambda
        'lambda:ListFunctions', 'lambda:GetFunction',
        // Cost Explorer
        'ce:GetCostAndUsage', 'ce:GetCostForecast', 'ce:GetDimensionValues',
        // IAM (read-only)
        'iam:ListUsers', 'iam:ListRoles', 'iam:ListPolicies', 'iam:ListGroups',
        'iam:GetUser', 'iam:GetRole', 'iam:GetPolicy', 'iam:GetPolicyVersion',
        'iam:ListAttachedRolePolicies', 'iam:ListAttachedUserPolicies',
        'iam:SimulatePrincipalPolicy', 'iam:ListAccessKeys',
        // Security
        'securityhub:GetFindings', 'securityhub:DescribeStandards', 'securityhub:BatchGetSecurityControls',
        'guardduty:ListFindings', 'guardduty:GetFindings', 'guardduty:ListDetectors',
        'inspector2:ListFindings', 'inspector2:ListCoverage',
        'access-analyzer:ListAnalyzers', 'access-analyzer:ListFindings',
        'config:DescribeConfigRules', 'config:GetComplianceSummaryByResourceType',
        // WAF
        'wafv2:ListWebACLs', 'wafv2:GetWebACL', 'wafv2:ListResourcesForWebACL',
        // RDS
        'rds:DescribeDBInstances', 'rds:DescribeDBClusters',
        // ECS
        'ecs:ListClusters', 'ecs:DescribeClusters', 'ecs:ListServices', 'ecs:DescribeServices',
        'ecs:ListTasks', 'ecs:DescribeTasks', 'ecs:DescribeTaskDefinition',
        'ecr:DescribeRepositories', 'ecr:ListImages',
        // EKS
        'eks:ListClusters', 'eks:DescribeCluster', 'eks:ListNodegroups', 'eks:DescribeNodegroup',
        // Support
        'support:DescribeCases', 'support:DescribeCommunications', 'support:DescribeServices',
        'support:DescribeSeverityLevels',
        // Billing
        'budgets:DescribeBudgets', 'budgets:DescribeBudgetPerformanceHistory',
        'compute-optimizer:GetEnrollmentStatus', 'compute-optimizer:GetRecommendationSummaries',
        'savingsplans:DescribeSavingsPlans', 'savingsplans:DescribeSavingsPlansOfferingRates',
        'pricing:GetProducts', 'pricing:DescribeServices', 'pricing:GetAttributeValues',
        // Well-Architected
        'wellarchitected:Get*', 'wellarchitected:List*',
        // Network
        'networkmanager:DescribeGlobalNetworks', 'networkmanager:GetConnections',
        'network-firewall:ListFirewalls', 'network-firewall:DescribeFirewall',
      ],
      resources: ['*'],
    }));

    // Sole write grant: the incremental report tools (agent/app.py) write the report
    // object to the uploads bucket under the reports/ prefix and return a presigned GET
    // URL. Section state lives under reports-state/ while the report is being assembled
    // and is deleted by finalize_report (the bucket lifecycle rule expires it anyway).
    this.runtime.addToRolePolicy(new iam.PolicyStatement({
      sid: 'ReportUploadWriteAccess',
      actions: ['s3:PutObject'],
      resources: [`arn:aws:s3:::${props.uploadsBucket}/reports/*`],
    }));
    this.runtime.addToRolePolicy(new iam.PolicyStatement({
      sid: 'ReportStateAccess',
      actions: ['s3:PutObject', 's3:GetObject', 's3:DeleteObject'],
      resources: [`arn:aws:s3:::${props.uploadsBucket}/reports-state/*`],
    }));

    // Cross-account policies (only when enabled)
    if (props.enableCrossAccount) {
      this.runtime.addToRolePolicy(new iam.PolicyStatement({
        sid: 'CrossAccountAssumeRole',
        actions: ['sts:AssumeRole'],
        resources: ['arn:aws:iam::*:role/LaunchPadReadOnlyRole'],
      }));
      this.runtime.addToRolePolicy(new iam.PolicyStatement({
        sid: 'OrganizationsReadOnly',
        actions: ['organizations:ListAccounts', 'organizations:DescribeOrganization', 'organizations:DescribeAccount'],
        resources: ['*'],
      }));
    }
  }
}

