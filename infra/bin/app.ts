#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { LaunchpadStack } from '../lib/launchpad-stack';

const app = new cdk.App();

const adminEmail = app.node.tryGetContext('adminEmail');
if (!adminEmail) {
  throw new Error('Required context: adminEmail. Usage: cdk deploy -c adminEmail=admin@example.com');
}

new LaunchpadStack(app, 'LaunchPadStack', {
  adminEmail,
  language: app.node.tryGetContext('language') ?? 'en',
  modelId: app.node.tryGetContext('modelId'),
  domainName: app.node.tryGetContext('domainName'),
  hostedZoneId: app.node.tryGetContext('hostedZoneId'),
  zoneName: app.node.tryGetContext('zoneName'),
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});
