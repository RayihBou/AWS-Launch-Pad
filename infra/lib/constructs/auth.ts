// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from 'aws-cdk-lib/aws-lambda';

export interface LaunchpadAuthProps {
  adminEmail: string;
}

export class LaunchpadAuth extends Construct {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;

  constructor(scope: Construct, id: string, props: LaunchpadAuthProps) {
    super(scope, id);

    this.userPool = new cognito.UserPool(this, 'UserPool', {
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      autoVerify: { email: true },
      passwordPolicy: {
        minLength: 8,
        requireUppercase: true,
        requireLowercase: true,
        requireDigits: true,
      },
      mfa: cognito.Mfa.REQUIRED,
      mfaSecondFactor: { sms: false, otp: true },
      userInvitation: {
        emailSubject: 'Welcome to AWS LaunchPad - Your Access Credentials',
        emailBody: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#0f1419;font-family:'Amazon Ember','Helvetica Neue',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0f1419;padding:40px 20px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;">
<tr><td style="background:linear-gradient(135deg,#232f3e,#1a252f);padding:30px;border-radius:12px 12px 0 0;border-bottom:3px solid #ff9900;text-align:center;">
<img src="https://assets.rayihbou.people.aws.dev/aws-logo.svg" alt="AWS" width="80" style="margin-bottom:12px;">
<h1 style="color:#ffffff;margin:0;font-size:24px;font-weight:600;">AWS LaunchPad</h1>
<p style="color:#b0b8c1;margin:8px 0 0;font-size:14px;">Cloud AI Assistant</p>
</td></tr>
<tr><td style="background-color:#1a1f26;padding:30px;">
<h2 style="color:#ffffff;margin:0 0 16px;font-size:20px;">Welcome!</h2>
<p style="color:#b0b8c1;font-size:15px;line-height:1.6;margin:0 0 24px;">Your AWS LaunchPad account has been created. Use the credentials below to sign in for the first time.</p>
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#242b33;border:1px solid #3d4852;border-radius:8px;margin:0 0 24px;">
<tr><td style="padding:20px;">
<p style="color:#b0b8c1;font-size:13px;margin:0 0 8px;text-transform:uppercase;letter-spacing:1px;">Username</p>
<p style="color:#ffffff;font-size:18px;margin:0 0 16px;font-weight:600;">{username}</p>
<p style="color:#b0b8c1;font-size:13px;margin:0 0 8px;text-transform:uppercase;letter-spacing:1px;">Temporary Password</p>
<p style="color:#ff9900;font-size:18px;margin:0;font-weight:600;font-family:monospace;">{####}</p>
</td></tr>
</table>
<h3 style="color:#ffffff;margin:0 0 12px;font-size:16px;">First Login Steps</h3>
<table width="100%" cellpadding="0" cellspacing="0">
<tr><td style="padding:8px 0;color:#b0b8c1;font-size:14px;"><span style="color:#ff9900;font-weight:bold;margin-right:8px;">1.</span> Sign in with the credentials above</td></tr>
<tr><td style="padding:8px 0;color:#b0b8c1;font-size:14px;"><span style="color:#ff9900;font-weight:bold;margin-right:8px;">2.</span> Set a new password when prompted</td></tr>
<tr><td style="padding:8px 0;color:#b0b8c1;font-size:14px;"><span style="color:#ff9900;font-weight:bold;margin-right:8px;">3.</span> Configure MFA with an authenticator app (Google Authenticator, Authy, or Microsoft Authenticator)</td></tr>
</table>
</td></tr>
<tr><td style="background-color:#1a1f26;padding:20px 30px;border-top:1px solid #3d4852;border-radius:0 0 12px 12px;text-align:center;">
<p style="color:#6b7785;font-size:12px;margin:0;">This is an automated message from AWS LaunchPad. Do not reply to this email.</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`,
      },
    });

    this.userPoolClient = this.userPool.addClient('AppClient', {
      authFlows: { userSrp: true, custom: true, userPassword: true },
      generateSecret: false,
    });

    // Create initial admin user - skip if already exists
    const createUserFn = new lambda.Function(this, 'CreateUserFn', {
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
import boto3, cfnresponse
def handler(event, context):
    if event['RequestType'] == 'Delete':
        cfnresponse.send(event, context, cfnresponse.SUCCESS, {})
        return
    try:
        client = boto3.client('cognito-idp')
        client.admin_create_user(
            UserPoolId=event['ResourceProperties']['UserPoolId'],
            Username=event['ResourceProperties']['Email'],
            UserAttributes=[
                {'Name': 'email', 'Value': event['ResourceProperties']['Email']},
                {'Name': 'email_verified', 'Value': 'true'},
            ],
            DesiredDeliveryMediums=['EMAIL'],
        )
    except client.exceptions.UsernameExistsException:
        pass
    cfnresponse.send(event, context, cfnresponse.SUCCESS, {})
`),
      timeout: cdk.Duration.seconds(30),
    });
    this.userPool.grant(createUserFn, 'cognito-idp:AdminCreateUser');

    new cdk.CustomResource(this, 'AdminUser', {
      serviceToken: createUserFn.functionArn,
      properties: {
        UserPoolId: this.userPool.userPoolId,
        Email: props.adminEmail,
      },
    });
  }
}
