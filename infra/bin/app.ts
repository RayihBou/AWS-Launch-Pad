#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { LaunchpadStack } from '../lib/launchpad-stack';

const app = new cdk.App();

new LaunchpadStack(app, 'LaunchpadStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
  domainName: app.node.tryGetContext('domainName'),
  hostedZoneId: app.node.tryGetContext('hostedZoneId'),
  zoneName: app.node.tryGetContext('zoneName'),
  language: app.node.tryGetContext('language'),
});
