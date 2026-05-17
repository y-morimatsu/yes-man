import { App } from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { NetworkStack } from '../lib/stacks/network-stack';

const ctx = {
  envName: 'prod' as const,
  awsAccount: '123456789012',
  awsRegion: 'ap-northeast-1',
  imageDigest: 'sha256:test',
  cloudfrontPrefixListId: 'pl-test12345',
};

describe('NetworkStack', () => {
  const app = new App();
  const stack = new NetworkStack(app, 'TestNetworkStack', {
    env: { account: ctx.awsAccount, region: ctx.awsRegion },
    ctx,
  });
  const template = Template.fromStack(stack);

  test('matches snapshot', () => {
    expect(template.toJSON()).toMatchSnapshot();
  });

  test('VPC has CIDR 10.0.0.0/16', () => {
    template.hasResourceProperties('AWS::EC2::VPC', { CidrBlock: '10.0.0.0/16' });
  });

  test('NAT Gateway count is 1 (cost optimization)', () => {
    template.resourceCountIs('AWS::EC2::NatGateway', 1);
  });

  test('exactly 3 security groups exist', () => {
    template.resourceCountIs('AWS::EC2::SecurityGroup', 3);
  });

  test('ALB SG accepts CloudFront prefix list on port 80', () => {
    template.hasResourceProperties('AWS::EC2::SecurityGroup', {
      GroupDescription: Match.stringLikeRegexp('ALB SG'),
      SecurityGroupIngress: Match.arrayWith([
        Match.objectLike({
          FromPort: 80,
          ToPort: 80,
          IpProtocol: 'tcp',
          SourcePrefixListId: ctx.cloudfrontPrefixListId,
        }),
      ]),
    });
  });

  test('Aurora SG accepts from ECS SG on 5432', () => {
    template.hasResourceProperties('AWS::EC2::SecurityGroup', {
      GroupDescription: Match.stringLikeRegexp('Aurora'),
      SecurityGroupIngress: Match.absent(),
    });
    // Separate ingress rule
    template.hasResourceProperties('AWS::EC2::SecurityGroupIngress', {
      FromPort: 5432,
      ToPort: 5432,
      IpProtocol: 'tcp',
    });
  });
});
