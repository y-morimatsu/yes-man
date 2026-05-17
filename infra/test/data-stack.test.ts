import { App } from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { NetworkStack } from '../lib/stacks/network-stack';
import { DataStack } from '../lib/stacks/data-stack';

const ctx = {
  envName: 'prod' as const,
  awsAccount: '123456789012',
  awsRegion: 'ap-northeast-1',
  imageDigest: 'sha256:test',
  cloudfrontPrefixListId: 'pl-test12345',
};

describe('DataStack', () => {
  const app = new App();
  const network = new NetworkStack(app, 'TestNetworkStack', {
    env: { account: ctx.awsAccount, region: ctx.awsRegion },
    ctx,
  });
  const stack = new DataStack(app, 'TestDataStack', {
    env: { account: ctx.awsAccount, region: ctx.awsRegion },
    ctx,
    vpc: network.vpc,
    auroraSg: network.auroraSg,
  });
  const template = Template.fromStack(stack);

  test('matches snapshot', () => {
    expect(template.toJSON()).toMatchSnapshot();
  });

  test('exactly 2 KMS keys created (aurora + secrets)', () => {
    template.resourceCountIs('AWS::KMS::Key', 2);
  });

  test('KMS keys have rotation enabled', () => {
    template.allResourcesProperties('AWS::KMS::Key', Match.objectLike({
      EnableKeyRotation: true,
    }));
  });

  test('Aurora cluster has storage encryption enabled', () => {
    template.hasResourceProperties('AWS::RDS::DBCluster', {
      StorageEncrypted: true,
      KmsKeyId: Match.anyValue(),
    });
  });

  test('Aurora Serverless v2 ACU range 0.5-2.0', () => {
    template.hasResourceProperties('AWS::RDS::DBCluster', {
      ServerlessV2ScalingConfiguration: Match.objectLike({
        MinCapacity: 0.5,
        MaxCapacity: 2,
      }),
    });
  });

  test('Aurora cluster uses PostgreSQL 15.4', () => {
    template.hasResourceProperties('AWS::RDS::DBCluster', {
      Engine: 'aurora-postgresql',
      EngineVersion: Match.stringLikeRegexp('^15\\.'),
    });
  });

  test('Aurora cluster has backup retention 1 day', () => {
    template.hasResourceProperties('AWS::RDS::DBCluster', {
      BackupRetentionPeriod: 1,
    });
  });
});
