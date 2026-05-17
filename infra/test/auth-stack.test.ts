import { App } from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { AuthStack } from '../lib/stacks/auth-stack';

const ctx = {
  envName: 'prod' as const,
  awsAccount: '123456789012',
  awsRegion: 'ap-northeast-1',
  imageDigest: 'sha256:test',
  cloudfrontPrefixListId: 'pl-test12345',
};

describe('AuthStack', () => {
  const app = new App();
  const stack = new AuthStack(app, 'TestAuthStack', {
    env: { account: ctx.awsAccount, region: ctx.awsRegion },
    ctx,
  });
  const template = Template.fromStack(stack);

  test('matches snapshot', () => {
    expect(template.toJSON()).toMatchSnapshot();
  });

  test('UserPool has password policy min 8, no symbols required', () => {
    template.hasResourceProperties('AWS::Cognito::UserPool', {
      Policies: Match.objectLike({
        PasswordPolicy: Match.objectLike({
          MinimumLength: 8,
          RequireLowercase: true,
          RequireUppercase: true,
          RequireNumbers: true,
          RequireSymbols: false, // NFR Req §SEC-U1-10 と整合
        }),
      }),
    });
  });

  test('UserPool MFA is OPTIONAL (TOTP only)', () => {
    template.hasResourceProperties('AWS::Cognito::UserPool', {
      MfaConfiguration: 'OPTIONAL',
      EnabledMfas: Match.arrayWith(['SOFTWARE_TOKEN_MFA']),
    });
  });

  test('UserPool advancedSecurityMode is AUDIT (not Enforce)', () => {
    template.hasResourceProperties('AWS::Cognito::UserPool', {
      UserPoolAddOns: Match.objectLike({
        AdvancedSecurityMode: 'AUDIT',
      }),
    });
  });

  test('AppClient generateSecret is false (SPA + PKCE)', () => {
    template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
      GenerateSecret: Match.absent(), // generateSecret: false → property is absent in CFN
      AllowedOAuthFlows: Match.arrayWith(['code']),
    });
  });

  test('UserPoolDomain uses cognito prefix yesman-prod', () => {
    template.hasResourceProperties('AWS::Cognito::UserPoolDomain', {
      Domain: 'yesman-prod',
    });
  });
});
