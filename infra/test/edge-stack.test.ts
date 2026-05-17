import { App } from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { NetworkStack } from '../lib/stacks/network-stack';
import { DataStack } from '../lib/stacks/data-stack';
import { AuthStack } from '../lib/stacks/auth-stack';
import { AiStack } from '../lib/stacks/ai-stack';
import { ApiStack } from '../lib/stacks/api-stack';
import { EdgeStack } from '../lib/stacks/edge-stack';

const ctx = {
  envName: 'prod' as const,
  awsAccount: '123456789012',
  awsRegion: 'ap-northeast-1',
  imageDigest: 'sha256:abcdef0123456789',
  cloudfrontPrefixListId: 'pl-test12345',
};

describe('EdgeStack', () => {
  const app = new App();
  const env = { account: ctx.awsAccount, region: ctx.awsRegion };
  const network = new NetworkStack(app, 'TestNetwork', { env, ctx });
  const data = new DataStack(app, 'TestData', {
    env, ctx, vpc: network.vpc, auroraSg: network.auroraSg,
  });
  const auth = new AuthStack(app, 'TestAuth', { env, ctx });
  const ai = new AiStack(app, 'TestAi', { env, ctx });
  const api = new ApiStack(app, 'TestApi', {
    env, ctx, vpc: network.vpc, albSg: network.albSg, ecsSg: network.ecsSg,
    cluster: data.cluster, dbSecret: data.dbSecret,
    llmOpenaiSecret: data.llmOpenaiSecret, llmAnthropicSecret: data.llmAnthropicSecret,
    secretsKey: data.secretsKey, userPool: auth.userPool, appClient: auth.appClient,
    guardrailId: ai.guardrailId, bedrockAccessPolicy: ai.bedrockAccessPolicy,
    voiceAccessPolicy: ai.voiceAccessPolicy,
  });
  const stack = new EdgeStack(app, 'TestEdgeStack', {
    env, ctx, alb: api.alb, originVerifySecret: api.originVerifySecret,
  });
  const template = Template.fromStack(stack);

  test('matches snapshot', () => {
    expect(template.toJSON()).toMatchSnapshot();
  });

  test('S3 bucket blocks all public access', () => {
    template.hasResourceProperties('AWS::S3::Bucket', {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });
  });

  test('CloudFront Distribution has Origin Access Control', () => {
    template.resourceCountIs('AWS::CloudFront::OriginAccessControl', 1);
  });

  test('CloudFront has 3 cache behaviors (default + api + sse)', () => {
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({
        CacheBehaviors: Match.arrayWith([
          Match.objectLike({
            PathPattern: 'api/decisions/*/stream',
            Compress: false,
          }),
          Match.objectLike({
            PathPattern: 'api/*',
            Compress: false,
          }),
        ]),
      }),
    });
  });

  test('CloudFront price class is PriceClass_200', () => {
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({
        PriceClass: 'PriceClass_200',
      }),
    });
  });

  test('SPA fallback: 403/404 → index.html', () => {
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({
        CustomErrorResponses: Match.arrayWith([
          Match.objectLike({
            ErrorCode: 403,
            ResponseCode: 200,
            ResponsePagePath: '/index.html',
          }),
          Match.objectLike({
            ErrorCode: 404,
            ResponseCode: 200,
            ResponsePagePath: '/index.html',
          }),
        ]),
      }),
    });
  });
});
