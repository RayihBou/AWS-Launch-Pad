// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
import * as crypto from 'crypto';
import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';

/**
 * Separator character used to join the segments of a generated name.
 *
 * Physical name alphabets differ per service, so the separator has to be
 * chosen per resource:
 * - `'-'` for AgentCore Gateway (`^([0-9a-zA-Z][-]?){1,48}$`, hyphens only),
 *   Bedrock Guardrail (`^[0-9a-zA-Z-_]+$`) and API Gateway.
 * - `'_'` for AgentCore Runtime (`^[a-zA-Z][a-zA-Z0-9_]{0,47}$`) and AgentCore
 *   Memory (`[a-zA-Z][a-zA-Z0-9_]{0,47}`), which reject hyphens.
 */
export type NameSeparator = '-' | '_';

export interface DeterministicNameProps {
  /**
   * Literal prefix that identifies the resource, e.g. `launchpad-gateway`.
   * Must only contain characters valid for the target resource.
   */
  readonly prefix: string;
  /**
   * Separator used between prefix, stack seed and hash, and as the
   * replacement for characters that are invalid for the target resource.
   */
  readonly separator: NameSeparator;
  /**
   * Maximum length accepted by the target resource for its physical name.
   */
  readonly maxLength: number;
}

/** Length of the hex hash suffix appended to every generated name. */
const HASH_LENGTH = 8;

/**
 * Builds a deterministic, per-stack physical name.
 *
 * Hardcoded physical names collide with orphaned resources left behind by a
 * previous deployment and prevent two LaunchPad stacks from coexisting in the
 * same account and region. This helper derives the name from the stack name, so
 * it is:
 * - stable across deployments of the same stack (the resource is never replaced
 *   just because the template was re-synthesized), and
 * - unique per stack, which keeps several stacks in one account/region apart.
 *
 * The result is `<prefix><sep><stackName><sep><hash>`, sanitized to the
 * alphabet implied by `separator` and truncated to `maxLength`.
 */
export function deterministicName(scope: Construct, props: DeterministicNameProps): string {
  const { prefix, separator, maxLength } = props;
  const stack = cdk.Stack.of(scope);

  // Stack names are normally concrete; they are only tokens for nested or
  // dynamically named stacks, where the construct path is the stable fallback.
  const seed = cdk.Token.isUnresolved(stack.stackName)
    ? cdk.Names.uniqueId(scope)
    : stack.stackName;

  const hash = crypto.createHash('sha256').update(seed).digest('hex').slice(0, HASH_LENGTH);
  const base = sanitize(`${prefix}${separator}${seed}`, separator);
  const maxBaseLength = maxLength - HASH_LENGTH - separator.length;

  return `${trimSeparators(base.slice(0, maxBaseLength), separator)}${separator}${hash}`;
}

/**
 * Reduces a string to `[0-9a-zA-Z]` plus the separator.
 *
 * Runs of invalid characters collapse into a single separator and leading or
 * trailing separators are dropped, because the AgentCore Gateway pattern
 * rejects consecutive hyphens and a leading hyphen.
 */
function sanitize(value: string, separator: NameSeparator): string {
  return trimSeparators(value.replace(/[^0-9a-zA-Z]+/g, separator), separator);
}

function trimSeparators(value: string, separator: NameSeparator): string {
  const escaped = separator === '-' ? '\\-' : '_';
  return value.replace(new RegExp(`^[${escaped}]+|[${escaped}]+$`, 'g'), '');
}
