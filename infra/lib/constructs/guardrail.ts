// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
import * as crypto from 'crypto';
import { Construct } from 'constructs';
import * as bedrock from 'aws-cdk-lib/aws-bedrock';
import { deterministicName } from '../naming';

export class LaunchpadGuardrail extends Construct {
  public readonly guardrailId: string;
  /**
   * Numeric version published by AWS::Bedrock::GuardrailVersion (GetAtt
   * `Version`), never `DRAFT`. Consumers must enforce this exact version.
   */
  public readonly guardrailVersion: string;
  /**
   * Full guardrail ARN (`arn:aws:bedrock:<region>:<account>:guardrail/<id>`).
   * Needed to scope the `bedrock:ApplyGuardrail` grant on any principal that
   * invokes the model with this guardrail attached.
   */
  public readonly guardrailArn: string;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    // The policy configuration is kept in its own object so it can be hashed
    // below: AWS::Bedrock::GuardrailVersion only publishes a new version when
    // the resource is replaced, so without a config-derived Description the
    // stack would keep pointing at version 1 while the guardrail DRAFT evolves.
    const guardrailConfig: Omit<bedrock.CfnGuardrailProps, 'name'> = {
      blockedInputMessaging: 'I can only assist with AWS cloud operations. This request is outside my scope.',
      blockedOutputsMessaging: 'I cannot provide this type of response. Please ask about AWS cloud operations.',
      contentPolicyConfig: {
        filtersConfig: [
          { type: 'SEXUAL', inputStrength: 'HIGH', outputStrength: 'HIGH' },
          { type: 'VIOLENCE', inputStrength: 'HIGH', outputStrength: 'HIGH' },
          { type: 'HATE', inputStrength: 'HIGH', outputStrength: 'HIGH' },
          { type: 'INSULTS', inputStrength: 'HIGH', outputStrength: 'HIGH' },
          { type: 'MISCONDUCT', inputStrength: 'HIGH', outputStrength: 'HIGH' },
          { type: 'PROMPT_ATTACK', inputStrength: 'HIGH', outputStrength: 'NONE' },
        ],
      },
      topicPolicyConfig: {
        topicsConfig: [
          {
            name: 'IAM-Privilege-Escalation',
            definition: 'Requests to create, modify, or escalate IAM permissions, roles, policies, or access levels.',
            examples: [
              'Give me admin access',
              'Create an IAM policy with full permissions',
              'Add me to the administrators group',
              'Change my IAM role to have more permissions',
            ],
            type: 'DENY',
          },
          {
            name: 'Credential-Management',
            definition: 'Requests to create, display, or manage AWS credentials, access keys, secret keys, or passwords.',
            examples: [
              'Show me the access keys',
              'Create new AWS credentials',
              'What is the root account password',
              'Generate a secret access key',
            ],
            type: 'DENY',
          },
          {
            name: 'Non-AWS-Topics',
            definition: 'Requests about topics unrelated to AWS cloud services, architecture, or operations.',
            examples: [
              'Tell me a joke',
              'Write a poem',
              'What is the weather today',
              'Help me with my homework',
            ],
            type: 'DENY',
          },
        ],
      },
      sensitiveInformationPolicyConfig: {
        piiEntitiesConfig: [
          { type: 'EMAIL', action: 'ANONYMIZE' },
          { type: 'PHONE', action: 'ANONYMIZE' },
          { type: 'NAME', action: 'ANONYMIZE' },
          { type: 'US_SOCIAL_SECURITY_NUMBER', action: 'BLOCK' },
          { type: 'CREDIT_DEBIT_CARD_NUMBER', action: 'BLOCK' },
        ],
      },
    };

    const guardrail = new bedrock.CfnGuardrail(this, 'Guardrail', {
      // Guardrail names must match ^[0-9a-zA-Z-_]+$ (max 50 chars). A per-stack
      // name avoids clashing with a guardrail orphaned by a previous deployment.
      name: deterministicName(this, {
        prefix: 'launchpad-guardrail',
        separator: '-',
        maxLength: 50,
      }),
      ...guardrailConfig,
    });

    // Description update requires Replacement, so a config-derived hash makes
    // CloudFormation publish (and hand back) a fresh version whenever any
    // filter, topic or PII rule above changes.
    const configHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(guardrailConfig))
      .digest('hex')
      .slice(0, 12);

    const guardrailVersion = new bedrock.CfnGuardrailVersion(this, 'GuardrailVersion', {
      guardrailIdentifier: guardrail.attrGuardrailId,
      description: `LaunchPad guardrail config ${configHash}`,
    });

    this.guardrailId = guardrail.attrGuardrailId;
    this.guardrailVersion = guardrailVersion.attrVersion;
    this.guardrailArn = guardrail.attrGuardrailArn;
  }
}
