// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
import { Construct } from 'constructs';
import * as bedrock from 'aws-cdk-lib/aws-bedrock';

export class LaunchpadGuardrail extends Construct {
  public readonly guardrailId: string;
  public readonly guardrailVersion: string;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    const guardrail = new bedrock.CfnGuardrail(this, 'Guardrail', {
      name: 'launchpad-guardrail',
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
    });

    const guardrailVersion = new bedrock.CfnGuardrailVersion(this, 'GuardrailVersion', {
      guardrailIdentifier: guardrail.attrGuardrailId,
    });

    this.guardrailId = guardrail.attrGuardrailId;
    this.guardrailVersion = guardrailVersion.attrVersion;
  }
}
