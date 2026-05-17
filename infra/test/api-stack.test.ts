import { App } from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { NetworkStack } from '../lib/stacks/network-stack';
import { DataStack } from '../lib/stacks/data-stack';
import { AuthStack } from '../lib/stacks/auth-stack';
import { AiStack } from '../lib/stacks/ai-stack';
import { ApiStack } from '../lib/stacks/api-stack';

const ctx = {
  envName: 'prod' as const,
  awsAccount: '123456789012',
  awsRegion: 'ap-northeast-1',
  imageDigest: 'sha256:abcdef0123456789',
  cloudfrontPrefixListId: 'pl-test12345',
};

describe('ApiStack', () => {
  const app = new App();
  const env = { account: ctx.awsAccount, region: ctx.awsRegion };
  const network = new NetworkStack(app, 'TestNetwork', { env, ctx });
  const data = new DataStack(app, 'TestData', {
    env,
    ctx,
    vpc: network.vpc,
    auroraSg: network.auroraSg,
  });
  const auth = new AuthStack(app, 'TestAuth', { env, ctx });
  const ai = new AiStack(app, 'TestAi', { env, ctx });
  const stack = new ApiStack(app, 'TestApiStack', {
    env,
    ctx,
    vpc: network.vpc,
    albSg: network.albSg,
    ecsSg: network.ecsSg,
    cluster: data.cluster,
    dbSecret: data.dbSecret,
    llmOpenaiSecret: data.llmOpenaiSecret,
    llmAnthropicSecret: data.llmAnthropicSecret,
    secretsKey: data.secretsKey,
    userPool: auth.userPool,
    appClient: auth.appClient,
    userPoolDomain: auth.userPoolDomain,
    guardrailId: ai.guardrailId,
    bedrockAccessPolicy: ai.bedrockAccessPolicy,
    voiceAccessPolicy: ai.voiceAccessPolicy,
  });
  const template = Template.fromStack(stack);

  test('matches snapshot', () => {
    expect(template.toJSON()).toMatchSnapshot();
  });

  test('ECR Repository has IMMUTABLE tag mutability', () => {
    template.hasResourceProperties('AWS::ECR::Repository', {
      ImageTagMutability: 'IMMUTABLE',
      ImageScanningConfiguration: Match.objectLike({ ScanOnPush: true }),
    });
  });

  test('ECS Service desiredCount is 2 (Multi-AZ initial)', () => {
    template.hasResourceProperties('AWS::ECS::Service', {
      DesiredCount: 2,
    });
  });

  test('ALB idle timeout is 120 seconds (for SSE)', () => {
    template.hasResourceProperties('AWS::ElasticLoadBalancingV2::LoadBalancer', {
      LoadBalancerAttributes: Match.arrayWith([
        Match.objectLike({
          Key: 'idle_timeout.timeout_seconds',
          Value: '120',
        }),
      ]),
    });
  });

  test('SQS Queue with KMS encryption is created', () => {
    template.hasResourceProperties('AWS::SQS::Queue', {
      QueueName: Match.stringLikeRegexp('decision-events'),
      KmsMasterKeyId: Match.anyValue(),
      VisibilityTimeout: 60,
      ReceiveMessageWaitTimeSeconds: 20,
    });
  });

  test('EventBridge Rule targets SQS Queue (NOT API Destinations)', () => {
    template.hasResourceProperties('AWS::Events::Rule', {
      EventPattern: Match.objectLike({
        source: ['yesman.decision'],
        'detail-type': ['DecisionConfirmed'],
      }),
      Targets: Match.arrayWith([
        Match.objectLike({
          Arn: Match.anyValue(), // SQS Queue ARN
        }),
      ]),
    });

    // No API Destinations should exist
    template.resourceCountIs('AWS::Events::ApiDestination', 0);
    template.resourceCountIs('AWS::Events::Connection', 0);
  });

  test('Origin Verify Secret is created (FastAPI middleware validation)', () => {
    template.hasResourceProperties('AWS::SecretsManager::Secret', {
      Name: Match.stringLikeRegexp('origin-verify'),
      GenerateSecretString: Match.objectLike({
        PasswordLength: 32,
        ExcludePunctuation: true,
      }),
    });
  });
});
