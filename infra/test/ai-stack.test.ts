import { App } from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { AiStack } from '../lib/stacks/ai-stack';

const ctx = {
  envName: 'prod' as const,
  awsAccount: '123456789012',
  awsRegion: 'ap-northeast-1',
  imageDigest: 'sha256:test',
  cloudfrontPrefixListId: 'pl-test12345',
};

describe('AiStack', () => {
  const app = new App();
  const stack = new AiStack(app, 'TestAiStack', {
    env: { account: ctx.awsAccount, region: ctx.awsRegion },
    ctx,
  });
  const template = Template.fromStack(stack);

  test('matches snapshot', () => {
    expect(template.toJSON()).toMatchSnapshot();
  });

  test('Guardrail has Sexual content filter at HIGH', () => {
    template.hasResourceProperties('AWS::Bedrock::Guardrail', {
      ContentPolicyConfig: Match.objectLike({
        FiltersConfig: Match.arrayWith([
          Match.objectLike({
            Type: 'SEXUAL',
            InputStrength: 'HIGH',
            OutputStrength: 'HIGH',
          }),
        ]),
      }),
    });
  });

  test('Guardrail Topic Policy denies Religion topic', () => {
    template.hasResourceProperties('AWS::Bedrock::Guardrail', {
      TopicPolicyConfig: Match.objectLike({
        TopicsConfig: Match.arrayWith([
          Match.objectLike({
            Name: 'Religion',
            Type: 'DENY',
          }),
        ]),
      }),
    });
  });

  test('Guardrail PII Filter anonymizes EMAIL', () => {
    template.hasResourceProperties('AWS::Bedrock::Guardrail', {
      SensitiveInformationPolicyConfig: Match.objectLike({
        PiiEntitiesConfig: Match.arrayWith([
          Match.objectLike({ Type: 'EMAIL', Action: 'ANONYMIZE' }),
        ]),
      }),
    });
  });

  test('Bedrock IAM Policy uses specific model ARNs (not wildcard)', () => {
    template.hasResourceProperties('AWS::IAM::ManagedPolicy', {
      ManagedPolicyName: Match.stringLikeRegexp('bedrock-access'),
      PolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: Match.arrayWith(['bedrock:InvokeModel']),
            Resource: Match.arrayWith([
              Match.stringLikeRegexp('foundation-model/anthropic.claude'),
            ]),
          }),
        ]),
      }),
    });
  });

  test('Two ManagedPolicies created (Bedrock + Voice)', () => {
    template.resourceCountIs('AWS::IAM::ManagedPolicy', 2);
  });
});
