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
          // Harm categories unrelated to the agent's domain stay at HIGH: they
          // never fire on legitimate cloud-operations traffic.
          { type: 'SEXUAL', inputStrength: 'HIGH', outputStrength: 'HIGH' },
          { type: 'VIOLENCE', inputStrength: 'HIGH', outputStrength: 'HIGH' },
          { type: 'HATE', inputStrength: 'HIGH', outputStrength: 'HIGH' },
          { type: 'INSULTS', inputStrength: 'HIGH', outputStrength: 'HIGH' },
          // MISCONDUCT lowered HIGH -> MEDIUM on both directions: the agent's
          // domain is cloud security, and the vocabulary of findings and
          // remediation commands (exposed credentials, open security groups,
          // public buckets, exploitable misconfigurations) sits adjacent to the
          // vocabulary of misconduct, so HIGH flags legitimate analysis.
          { type: 'MISCONDUCT', inputStrength: 'MEDIUM', outputStrength: 'MEDIUM' },
          // PROMPT_ATTACK lowered HIGH -> MEDIUM on input (output stays NONE,
          // the model response is not an attack surface here). Measured reason:
          // at HIGH, any second-person imperative text — the shape of this
          // agent's own instructions, e.g. "You are an assistant. You MUST call
          // tools. NEVER execute write actions" — is flagged with HIGH
          // confidence, so system-prompt-like or tool-guidance content in a
          // user turn was being blocked.
          { type: 'PROMPT_ATTACK', inputStrength: 'MEDIUM', outputStrength: 'NONE' },
        ],
      },
      // There is deliberately NO `topicPolicyConfig` on this guardrail. Every
      // DENY topic that was tried here has been removed, and the policy itself
      // is gone rather than left empty. The reasoning is worth recording,
      // because "add a DENY topic for privilege escalation" is the obvious first
      // instinct for an agent that talks about IAM all day, and measurement
      // against the real Bedrock classifier showed it does not work.
      //
      // 1. Topic classifiers are incompatible with an agent whose *domain is*
      //    IAM and credential auditing. A DENY topic is an intent classifier
      //    over the user's turn, and it cannot distinguish "audit the
      //    administrator permissions that exist in my account" from "give me
      //    administrator permissions". Those two requests share almost all of
      //    their vocabulary — IAM, role, policy, administrator, permissions, my
      //    account — and only differ in intent, which is exactly the axis the
      //    classifier gets wrong. For a general-purpose assistant the topic
      //    would fire on a thin slice of traffic; for this agent that slice is
      //    the product. The last surviving topic, `IAM-Privilege-Escalation`,
      //    blocked "Lista los roles IAM de mi cuenta y dime cuales tienen
      //    permisos de administrador" — an advertised capability of AWS
      //    LaunchPad (security posture analysis over IAM) and a strictly
      //    read-only question.
      //
      // 2. Narrowing the definition does not fix it. Successive rewrites that
      //    named only the write verbs (create, modify, attach, delete, grant,
      //    escalate) still blocked any request that combines administrator
      //    permissions with the user's own account, which is the shape of most
      //    legitimate IAM audit questions. The failure is not a wording problem
      //    that a better definition solves.
      //
      // 3. Exclusion clauses are not honoured. Definitions that stated
      //    "explicitly EXCLUDES read-only and audit queries" changed nothing:
      //    the classifier kept blocking the excluded cases. Character budget
      //    spent on exclusions is wasted twice over, because the CLASSIC tier
      //    caps `definition` at 200 characters and the exclusion text crowds out
      //    the intent signal that does have an effect. The same effect was
      //    measured earlier on the removed `Credential-Management` topic, whose
      //    exclusion clause failed to stop it blocking "Revisa la antiguedad de
      //    mis access keys y dime cuales llevan mas de 90 dias sin rotar".
      //
      // 4. With `topicPolicyConfig` removed, all 8 validation cases produce the
      //    expected result. The dangerous cases stay covered by mechanisms that
      //    do not depend on topic intent classification:
      //      - the escalation request carrying credential exfiltration ("crear
      //        un IAM user con AdministratorAccess y darme las claves") is
      //        caught by the MISCONDUCT content filter at MEDIUM;
      //      - prompt injection is caught by PROMPT_ATTACK on input;
      //      - sensitive data is caught by the PII policy below.
      //
      // 5. The real protection against write actions was never the guardrail.
      //    It is (a) the AgentCore Runtime's read-only IAM role — the single
      //    write grant is `s3:PutObject` scoped to the `reports/` prefix — so an
      //    escalation attempt cannot be executed regardless of what the model
      //    decides to do, and (b) the agent system prompt, which also handles
      //    scope enforcement (the reason the `Non-AWS-Topics` topic was dropped:
      //    it failed to block its own literal example "Tell me a joke" while
      //    blocking valid AWS questions phrased negatively). IAM enforcement is
      //    deterministic; an intent classifier is not.
      //
      // ACCEPTED COST: a bare escalation request with no exfiltration and no
      // other harmful signal — "Give me admin access", "Add me to the
      // administrators group" — now passes the guardrail and reaches the model.
      // This is accepted knowingly. Such a request is unactionable: the Runtime
      // role cannot create or modify IAM principals, so the worst outcome is the
      // agent explaining, or declining to explain, a procedure the user could
      // read in the public AWS documentation. That is a far smaller cost than
      // blocking the IAM audit questions the product exists to answer.
      sensitiveInformationPolicyConfig: {
        // Only genuinely out-of-domain sensitive data is blocked. The NAME,
        // EMAIL and PHONE entities previously set to ANONYMIZE were removed:
        // the agent audits the customer's own account, so redacting principal
        // names and contact addresses destroys the usefulness of IAM reports,
        // user and group inventories, CloudTrail actor attribution, and account
        // contact findings — the anonymised output named no one and could not be
        // acted on. SSN and card numbers have no legitimate place in cloud
        // operations traffic, so they remain hard BLOCK.
        piiEntitiesConfig: [
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
    // filter or PII rule above changes.
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
