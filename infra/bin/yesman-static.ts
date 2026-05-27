#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { WebStaticStack } from '../lib/stacks/web-static-stack';

const app = new cdk.App();

const envName = (app.node.tryGetContext('envName') ?? 'dev') as string;
const awsAccount =
  (app.node.tryGetContext('awsAccount') as string | undefined) ??
  process.env.CDK_DEFAULT_ACCOUNT ??
  process.env.AWS_ACCOUNT_ID;
const awsRegion =
  (app.node.tryGetContext('awsRegion') as string | undefined) ??
  process.env.CDK_DEFAULT_REGION ??
  'ap-northeast-1';

if (!awsAccount) {
  throw new Error('awsAccount is required (-c awsAccount=<id> or env CDK_DEFAULT_ACCOUNT / AWS_ACCOUNT_ID)');
}

new WebStaticStack(app, `yesman-${envName}-web-static`, {
  env: { account: awsAccount, region: awsRegion },
  envName,
});
