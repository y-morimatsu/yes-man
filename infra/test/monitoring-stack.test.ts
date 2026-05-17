import { App } from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { NetworkStack } from '../lib/stacks/network-stack';
import { DataStack } from '../lib/stacks/data-stack';
import { AuthStack } from '../lib/stacks/auth-stack';
import { AiStack } from '../lib/stacks/ai-stack';
import { ApiStack } from '../lib/stacks/api-stack';
import { MonitoringStack } from '../lib/stacks/monitoring-stack';

const ctx = {
  envName: 'prod' as const,
  awsAccount: '123456789012',
  awsRegion: 'ap-northeast-1',
  imageDigest: 'sha256:abcdef0123456789',
  cloudfrontPrefixListId: 'pl-test12345',
};

describe('MonitoringStack', () => {
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
  const stack = new MonitoringStack(app, 'TestMonitoringStack', {
    env, ctx, alb: api.alb, ecsService: api.ecsService, cluster: data.cluster,
    monthlyBudgetUsd: 200,
  });
  const template = Template.fromStack(stack);

  test('matches snapshot', () => {
    expect(template.toJSON()).toMatchSnapshot();
  });

  test('exactly 3 explicit Log Groups (ALB / Aurora / Bedrock — ECS は ApiStack で作成済、rotator は自動)', () => {
    template.resourceCountIs('AWS::Logs::LogGroup', 3);
  });

  test('All Log Groups have 7-day retention', () => {
    template.allResourcesProperties('AWS::Logs::LogGroup', Match.objectLike({
      RetentionInDays: 7,
    }));
  });

  test('SNS Topic for alerts is created', () => {
    template.resourceCountIs('AWS::SNS::Topic', 1);
    template.hasResourceProperties('AWS::SNS::Topic', {
      TopicName: Match.stringLikeRegexp('alerts'),
    });
  });

  test('exactly 4 CloudWatch Alarms (alb-5xx / ecs-cpu / aurora-acu / bedrock-spike)', () => {
    template.resourceCountIs('AWS::CloudWatch::Alarm', 4);
  });

  test('AWS Budget with 2 notifications (80% / 100%)', () => {
    template.hasResourceProperties('AWS::Budgets::Budget', {
      Budget: Match.objectLike({
        BudgetType: 'COST',
        TimeUnit: 'MONTHLY',
        BudgetLimit: Match.objectLike({ Amount: 200, Unit: 'USD' }),
      }),
      NotificationsWithSubscribers: Match.arrayWith([
        Match.objectLike({
          Notification: Match.objectLike({ Threshold: 80, ThresholdType: 'PERCENTAGE' }),
        }),
        Match.objectLike({
          Notification: Match.objectLike({ Threshold: 100, ThresholdType: 'PERCENTAGE' }),
        }),
      ]),
    });
  });
});
