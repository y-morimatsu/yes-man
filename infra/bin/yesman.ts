#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { NetworkStack } from '../lib/stacks/network-stack';
import { DataStack } from '../lib/stacks/data-stack';
import { AuthStack } from '../lib/stacks/auth-stack';
import { AiStack } from '../lib/stacks/ai-stack';
import { ApiStack } from '../lib/stacks/api-stack';
import { EdgeStack } from '../lib/stacks/edge-stack';
import { MonitoringStack } from '../lib/stacks/monitoring-stack';
import { loadContext } from '../lib/config/context';

const app = new cdk.App();
const ctx = loadContext(app);
const env: cdk.Environment = { account: ctx.awsAccount, region: ctx.awsRegion };

// -----------------------------------------------------------------
// Stack 生成 (依存解決順)
//
// 依存グラフ:
//   NetworkStack
//     ├─ AuthStack (no dep)
//     ├─ AiStack (no dep)
//     └─ DataStack (vpc, auroraSg)
//          → ApiStack (vpc, sg, db, secrets, userPool, ai)
//               → EdgeStack (alb, originVerifySecret)
//               → MonitoringStack (alb, ecsService, cluster)
// -----------------------------------------------------------------

const network = new NetworkStack(app, `yesman-${ctx.envName}-network`, { env, ctx });

const auth = new AuthStack(app, `yesman-${ctx.envName}-auth`, { env, ctx });

const ai = new AiStack(app, `yesman-${ctx.envName}-ai`, { env, ctx });

const data = new DataStack(app, `yesman-${ctx.envName}-data`, {
  env,
  ctx,
  vpc: network.vpc,
  auroraSg: network.auroraSg,
});

const api = new ApiStack(app, `yesman-${ctx.envName}-api`, {
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
  userPoolDomain: auth.userPoolDomain,    // U3: COGNITO_HOSTED_UI_URL 生成用
  guardrailId: ai.guardrailId,
  bedrockAccessPolicy: ai.bedrockAccessPolicy,
  voiceAccessPolicy: ai.voiceAccessPolicy,
});

// EdgeStack — Custom Domain 不採用のため env はそのまま (ap-northeast-1)
// CloudFront Distribution はグローバルリソース、Stack 自体は任意 region で作成可
new EdgeStack(app, `yesman-${ctx.envName}-edge`, {
  env,
  ctx,
  alb: api.alb,
  originVerifySecret: api.originVerifySecret,
});

new MonitoringStack(app, `yesman-${ctx.envName}-monitoring`, {
  env,
  ctx,
  alb: api.alb,
  ecsService: api.ecsService,
  cluster: data.cluster,
  monthlyBudgetUsd: 200,
});

// アプリ全体に共通タグ
cdk.Tags.of(app).add('Project', 'yesman');
cdk.Tags.of(app).add('Env', ctx.envName);
cdk.Tags.of(app).add('ManagedBy', 'cdk');
