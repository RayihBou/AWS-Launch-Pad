import { Construct } from 'constructs';
import * as cognito from 'aws-cdk-lib/aws-cognito';

export class LaunchpadAuth extends Construct {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;
  public readonly viewerGroup: cognito.CfnUserPoolGroup;
  public readonly operatorGroup: cognito.CfnUserPoolGroup;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.userPool = new cognito.UserPool(this, 'UserPool', {
      selfSignUpEnabled: true,
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
    });

    this.userPoolClient = this.userPool.addClient('AppClient', {
      authFlows: { userSrp: true, custom: true, userPassword: true },
      generateSecret: false,
    });

    this.viewerGroup = new cognito.CfnUserPoolGroup(this, 'ViewerGroup', {
      userPoolId: this.userPool.userPoolId,
      groupName: 'Viewer',
      description: 'Read-only access',
    });

    this.operatorGroup = new cognito.CfnUserPoolGroup(this, 'OperatorGroup', {
      userPoolId: this.userPool.userPoolId,
      groupName: 'Operator',
      description: 'Read and write access',
    });
  }
}
