# U1 / infra — Code Generation Plan (Part 1 of 2)

**ユニット**: U1 / infra
**フェーズ**: CONSTRUCTION - Per-Unit Loop
**ステージ**: Code Generation (4/4 for U1)
**Part**: 1 of 2 (**Planning**) — Part 2 は実装本体
**作成日**: 2026-05-10
**前提**: U1 Infrastructure Design 承認済 (2026-05-10T10:30:00Z)

---

## 0. ドキュメントの目的

U1 Infrastructure Design で確定した CDK Stack 構造を **CDK TypeScript コード + Jest テスト + README/Runbook** として実装するための **実装計画書**。各ファイルの生成順・チェックボックス付きステップを明示し、Part 2 (Generation) で実行する。

---

## 1. 生成対象ファイル一覧

`infra/` ディレクトリ配下に以下を生成:

### 1.1 プロジェクト設定 (5 files)
- [ ] `infra/package.json` — CDK v2 + TypeScript + Jest 依存
- [ ] `infra/tsconfig.json` — TypeScript 設定
- [ ] `infra/cdk.json` — CDK App エントリ + context (envName, cloudfrontPrefixListId 等)
- [ ] `infra/jest.config.js` — Jest 設定 (snapshot + assertions)
- [ ] `infra/.gitignore` — cdk.out/, node_modules/ 除外

### 1.2 エントリポイント (1 file)
- [ ] `infra/bin/yesman.ts` — CDK App、7 Stack 生成

### 1.3 共通設定 (2 files)
- [ ] `infra/lib/config/types.ts` — 共通型定義 (StackContext 等)
- [ ] `infra/lib/config/context.ts` — context 読込ヘルパー (envName, awsAccount, awsRegion, imageDigest, cloudfrontPrefixListId)

### 1.4 Stack 実装 (7 files)
- [ ] `infra/lib/stacks/network-stack.ts` — VPC / Subnet / NAT / 3 SG
- [ ] `infra/lib/stacks/data-stack.ts` — Aurora Serverless v2 + KMS × 2 + Secrets × 4
- [ ] `infra/lib/stacks/auth-stack.ts` — Cognito User Pool + App Client (generateSecret: false, PKCE) + Hosted UI Domain
- [ ] `infra/lib/stacks/ai-stack.ts` — Bedrock Guardrails (L1 CFN) + IAM Managed Policy × 2
- [ ] `infra/lib/stacks/api-stack.ts` — ECR + ECS Fargate + ALB (HTTP) + EventBridge + Origin Verify Secret
- [ ] `infra/lib/stacks/edge-stack.ts` — CloudFront + S3 + OAC + SSE Behavior
- [ ] `infra/lib/stacks/monitoring-stack.ts` — Log Groups × 4 + SNS + Alarms × 6 + AWS Budget

### 1.5 テスト (8 files)
- [ ] `infra/test/network-stack.test.ts` — snapshot + assertions
- [ ] `infra/test/data-stack.test.ts`
- [ ] `infra/test/auth-stack.test.ts`
- [ ] `infra/test/ai-stack.test.ts`
- [ ] `infra/test/api-stack.test.ts`
- [ ] `infra/test/edge-stack.test.ts`
- [ ] `infra/test/monitoring-stack.test.ts`
- [ ] `infra/test/__snapshots__/` (ディレクトリ、Jest 自動生成)

### 1.6 ドキュメント (2 files)
- [ ] `infra/README.md` — Deploy 手順 + 環境変数 + 各 Stack 説明
- [ ] `infra/RUNBOOK.md` — 手動シークレット投入 / SNS 購読 / Bedrock 申請 / prefix list 取得 / AWS Budgets 権限 等の運用手順

**合計**: **24 ファイル** + 1 snapshots ディレクトリ (Jest 自動生成) = 25 path

---

## 2. 生成順序 (依存解決順)

```
[Phase A] プロジェクト設定 + 共通設定
   1.1 package.json / tsconfig.json / cdk.json / jest.config.js / .gitignore
   1.3 lib/config/types.ts + lib/config/context.ts
   
[Phase B] Stack 実装 (依存順、独立 Stack は並列可能)
   1.4.1 NetworkStack         (依存なし)
   1.4.2 AuthStack            (依存なし)
   1.4.3 AiStack              (依存なし)
   1.4.4 DataStack            (Network から VPC / SG)
   1.4.5 ApiStack             (Network / Data / Auth / Ai)
   1.4.6 EdgeStack            (Api)
   1.4.7 MonitoringStack      (Api / Data)
   
[Phase C] エントリポイント
   1.2 bin/yesman.ts (Phase B の Stack 全てを参照)
   
[Phase D] テスト
   1.5 各 Stack に対応する test ファイル
   
[Phase E] ドキュメント
   1.6 README.md + RUNBOOK.md
```

---

## 3. 各ファイルの実装詳細

### 3.1 `infra/package.json` — CDK v2 + 必要依存

> **U1 スコープ外**: pnpm workspace の root 設定 (`pnpm-workspace.yaml` / root `package.json`) は U7c (api-client) や global setup で扱う。U1 では `infra/package.json` のみ生成し、`"name": "@yesman/infra"` を宣言。

主な dependencies:
- `aws-cdk-lib` (^2.x)
- `constructs` (^10.x)

主な devDependencies:
- `typescript` (^5.x)
- `ts-node` / `tsx`
- `jest` + `@types/jest` + `ts-jest`
- `@types/node`

scripts:
- `build`: `tsc`
- `watch`: `tsc -w`
- `synth`: `cdk synth`
- `diff`: `cdk diff`
- `deploy`: `cdk deploy --all`
- `destroy`: `cdk destroy --all`
- `test`: `jest`

### 3.2 `infra/tsconfig.json`
- target: ES2022
- module: commonjs (CDK 標準)
- strict: true
- esModuleInterop: true
- skipLibCheck: true
- outDir: `lib/` (CDK 標準は flat 構成だが念のため)

### 3.3 `infra/cdk.json`
```json
{
  "app": "npx tsx bin/yesman.ts",
  "watch": {
    "include": ["**"],
    "exclude": ["README.md", "RUNBOOK.md", "cdk.out", "**/*.test.ts"]
  },
  "context": {
    "envName": "prod",
    "cloudfrontPrefixListId": "pl-XXXXXXXX",
    "@aws-cdk/aws-iam:minimizePolicies": true
  }
}
```
*注: 不要な `@aws-cdk/aws-rds:databaseProxyUniqueResourceName` (RDS Proxy 用 feature flag) は削除済*

### 3.4 `infra/lib/config/types.ts`
共通型:
```typescript
export interface AppContext {
  envName: 'prod' | 'dev';
  awsAccount: string;
  awsRegion: string;
  imageDigest: string;
  cloudfrontPrefixListId: string;
}

export interface CommonStackProps extends cdk.StackProps {
  ctx: AppContext;
}
```

### 3.5 `infra/lib/config/context.ts`
```typescript
export function loadContext(app: cdk.App): AppContext {
  const envName = (app.node.tryGetContext('envName') ?? 'prod') as 'prod' | 'dev';
  // test 環境では 000000000000 を fallback として許容
  const awsAccount = process.env.CDK_DEFAULT_ACCOUNT ?? '000000000000';
  const awsRegion = process.env.CDK_DEFAULT_REGION ?? 'ap-northeast-1';
  const imageDigest = app.node.tryGetContext('imageDigest') ?? '';
  const cloudfrontPrefixListId = app.node.tryGetContext('cloudfrontPrefixListId') ?? '';
  // バリデーション (prod deploy 時のみ厳格、test/synth では fallback で通過)
  const isProdDeploy = envName === 'prod' && process.env.CDK_DEFAULT_ACCOUNT;
  if (isProdDeploy && !imageDigest) throw new Error('--context imageDigest required for prod deploy');
  if (isProdDeploy && !cloudfrontPrefixListId) throw new Error('--context cloudfrontPrefixListId required (see RUNBOOK.md)');
  return { envName, awsAccount, awsRegion, imageDigest, cloudfrontPrefixListId };
}
```
*注: `CDK_DEFAULT_ACCOUNT` の fallback (`'000000000000'`) は test/synth 用。実 deploy は AWS Profile/SDK が account を解決*

### 3.6 `infra/lib/stacks/network-stack.ts`
- `ec2.Vpc` (cidr: '10.0.0.0/16', maxAzs: 2, natGateways: 1, subnetConfiguration: PUBLIC /20 + PRIVATE_WITH_EGRESS /20)
- `ec2.SecurityGroup` × 3: alb-sg / ecs-sg / aurora-sg
- alb-sg: `ec2.Peer.prefixList(ctx.cloudfrontPrefixListId)` :80
- ecs-sg: from alb-sg :8000
- aurora-sg: from ecs-sg :5432
- 公開 properties: vpc, albSg, ecsSg, auroraSg

### 3.7 `infra/lib/stacks/data-stack.ts`
- `kms.Key` × 2: auroraKey / secretsKey (enableKeyRotation: true)
- `rds.DatabaseCluster`:
  - engine: AuroraPostgresEngineVersion.VER_15_4
  - writer: ClusterInstance.serverlessV2({ })
  - readers: []
  - serverlessV2MinCapacity: 0.5
  - serverlessV2MaxCapacity: 2
  - credentials: `rds.Credentials.fromGeneratedSecret('yesman', { secretName: 'yesman/db/master', encryptionKey: secretsKey })`
  - vpc + vpcSubnets: PRIVATE_WITH_EGRESS
  - securityGroups: [auroraSg from NetworkStack]
  - storageEncrypted: true / storageEncryptionKey: auroraKey
  - backupRetention: Duration.days(1)
  - performanceInsightsRetention: PerformanceInsightRetention.DEFAULT (7 days)
- `cluster.addRotationSingleUser({ automaticallyAfter: Duration.days(30), vpc: vpc, vpcSubnets: { subnetType: SubnetType.PRIVATE_WITH_EGRESS } })` (rotation Lambda は Aurora と同じ VPC の Private Subnet に配置)
- Placeholder Secrets × 3 (yesman/llm/openai, yesman/llm/anthropic, yesman/eventbridge/api-key):
  - `new secretsmanager.Secret(this, ..., { secretName, encryptionKey: secretsKey, description: 'Manually injected at runtime' })`
- 公開 properties: cluster, dbSecret, llmOpenaiSecret, llmAnthropicSecret, eventApiKeySecret, secretsKey

### 3.8 `infra/lib/stacks/auth-stack.ts`
- `cognito.UserPool`:
  - passwordPolicy (上記)
  - mfa: Mfa.OPTIONAL
  - mfaSecondFactor: { otp: true, sms: false }
  - signInAliases: { email: true }
  - selfSignUpEnabled: true
  - advancedSecurityMode: AdvancedSecurityMode.AUDIT
- `cognito.UserPoolClient`:
  - generateSecret: false (SPA + PKCE)
  - authFlows: { userSrp: true }
  - oAuth: { flows: { authorizationCodeGrant: true }, scopes, callbackUrls (CloudFront 後付け), logoutUrls }
- `cognito.UserPoolDomain`: cognitoDomain: { domainPrefix: `yesman-${envName}` }
- 公開 properties: userPool, appClient, userPoolDomain

### 3.9 `infra/lib/stacks/ai-stack.ts`
- `bedrock.CfnGuardrail`:
  - contentPolicyConfig.filtersConfig: Sexual HIGH / Violence HIGH / Hate MEDIUM / Misconduct MEDIUM
  - topicPolicyConfig.topicsConfig: Religion DENY / Elections DENY (definition + examples 付き)
  - sensitiveInformationPolicyConfig.piiEntitiesConfig: EMAIL/PHONE ANONYMIZE
  - blockedInputMessaging / blockedOutputsMessaging
- `iam.ManagedPolicy` `yesman-bedrock-access`:
  - bedrock:InvokeModel / InvokeModelWithResponseStream / Converse / ConverseStream / ApplyGuardrail
  - resources: Bedrock model ARN (Claude 3 Haiku / Nova)
  - **ARN format 例** (RUNBOOK.md で正確値確認):
    - `arn:aws:bedrock:ap-northeast-1::foundation-model/anthropic.claude-3-haiku-20240307-v1:0`
    - `arn:aws:bedrock:ap-northeast-1::foundation-model/amazon.nova-lite-v1:0`
- `iam.ManagedPolicy` `yesman-voice-access`:
  - polly:SynthesizeSpeech / transcribe:StartStreamTranscription 等
- 公開 properties: guardrailId, bedrockAccessPolicy, voiceAccessPolicy

### 3.10 `infra/lib/stacks/api-stack.ts`
- `ecr.Repository` `yesman-api` (immutable, scanOnPush: true)
- `secretsmanager.Secret` `yesman/api/origin-verify` (`generateSecretString: { excludePunctuation: true, passwordLength: 32 }`)
- `ecs.Cluster`: vpc, containerInsights: true
- `iam.Role` ecsTaskRole + ecsExecRole + Bedrock/Voice/Secrets/EventBridge/**SQS** policies attached
- `ecs.FargateTaskDefinition`: cpu 512 / memory 1024
- `ContainerDefinition` (API) + (X-Ray sidecar)
  - environment: APP_ENV / AUTH_BACKEND / STORAGE_BACKEND / VOICE_BACKEND / LLM_PROVIDER / EVENT_BACKEND / COGNITO_USER_POOL_ID / COGNITO_APP_CLIENT_ID / BEDROCK_GUARDRAIL_ID / EVENT_BUS_NAME / **DECISION_EVENTS_QUEUE_URL**
  - secrets: DATABASE_URL / OPENAI_API_KEY / ANTHROPIC_API_KEY / ORIGIN_VERIFY_SECRET
    *(注: EVENTBRIDGE_API_KEY は SQS パターンで不要、COGNITO_APP_CLIENT_SECRET も SPA PKCE で不要)*
- `ecs.FargateService`:
  - desiredCount: 2, minimumCapacity: 1, maximumCapacity: 4
  - assignPublicIp: false, vpcSubnets: PRIVATE_WITH_EGRESS, securityGroups: [ecsSg]
  - enableExecuteCommand: true
- Auto-Scaling: scaleOnCpuUtilization 70% / scaleOnMemoryUtilization 70%
- `elbv2.ApplicationLoadBalancer`:
  - internetFacing: true, securityGroup: albSg, idleTimeout: 120s, subnets: PUBLIC
- `elbv2.ApplicationListener` (80 HTTP) + Target Group (port 8000, HC /health 5s/3retries)
- **`sqs.Queue` `yesman-decision-events`**: KMS 暗号化 (secretsKey)、visibilityTimeout: 60s、receiveMessageWaitTime: 20s (long polling)、DLQ なし (デモ規模)
- `events.EventBus` `yesman-bus`
- `events.Rule` `decision-confirmed-rule`: **targets: [new targets.SqsQueue(decisionEventsQueue)]** (API Destinations 不採用、SQS 経由で ECS Task が消費)
- ECS Task Role に `sqs:ReceiveMessage / DeleteMessage / GetQueueAttributes` 権限付与 (decisionEventsQueue 限定)
- 公開 properties: alb, ecsService, originVerifySecret, decisionEventsQueue

### 3.11 `infra/lib/stacks/edge-stack.ts`
- `s3.Bucket` `yesman-static-{envName}-{accountId}` (block all public access, encryption: S3_MANAGED, removalPolicy: DESTROY デモ規模)
- `cloudfront.OriginAccessControl`
- `cloudfront.Distribution`:
  - defaultBehavior: S3 origin via OAC
  - additionalBehaviors:
    - `/api/decisions/*/stream`: ALB origin + readTimeout 60s + CachingDisabled + AllViewer + ALLOW_ALL + compress: false
    - `/api/*`: ALB origin + customHeaders `X-Origin-Verify` (from originVerifySecret.secretValue) + CachingDisabled
  - priceClass: PRICE_CLASS_200
- 公開 properties: distribution

> **セキュリティ Trade-off ノート**: `originVerifySecret.secretValue` は CloudFront Distribution の customHeaders として CloudFormation Template に埋め込まれる (CDK 制約)。完全に隠蔽するには Lambda@Edge での動的取得が必要だが、追加コスト + 複雑度のためハッカソン範囲外。CDK Bootstrap Bucket は AWS Account 内部リソースのためアクセス権限が限定されており、リスクは限定的。本番化検討時は Lambda@Edge or AWS Secrets Manager + 別パターン (e.g., Origin Request Lambda) を採用。

### 3.12 `infra/lib/stacks/monitoring-stack.ts`
- `logs.LogGroup` × 4 (retention 7 days): ecs / alb / aurora / bedrock
  - Note: /aws/lambda/yesman-secret-rotator は明示作成しない
- `sns.Topic` `yesman-alerts`
- `cloudwatch.Alarm` × 6:
  - alb-5xx-rate
  - ecs-cpu-high
  - aurora-cpu-high
  - bedrock-spike (custom metric)
  - (budget alarms are below)
- `budgets.CfnBudget` $200 + 80% / 100% thresholds → SNS

### 3.13 `infra/bin/yesman.ts`
- `import 'source-map-support/register'`
- `const app = new cdk.App()`
- `const ctx = loadContext(app)`
- `const env = { account: ctx.awsAccount, region: ctx.awsRegion }`
- 7 Stack を依存順に生成 (NetworkStack 既に解説済)
- EdgeStack は ApiStack の `originVerifySecret` を receive

### 3.14 各 Stack `*.test.ts`

各 Stack に **最低 5 件の assertion** + 1 snapshot test。具体的な assertion 対象:

| Stack | 最低 assertion 内容 |
|---|---|
| NetworkStack | VPC CIDR / NAT count=1 / SG count=3 / alb-sg prefix list / aurora-sg from ecs-sg |
| DataStack | Aurora encrypted=true / KMS key count=2 / Aurora serverlessV2 min=0.5 max=2 / dbSecret created / rotation Lambda VPC config |
| AuthStack | UserPool MFA=OPTIONAL / passwordPolicy minLength=8 + requireSymbols=false / UserPoolClient generateSecret=false / Hosted UI domain prefix / advancedSecurityMode=AUDIT |
| AiStack | Guardrail Sexual=HIGH / Topic Religion DENY / PII Email ANONYMIZE / Bedrock IAM policy resource ARN exact |
| ApiStack | ECR immutable=true / ECS desiredCount=2 / ALB idleTimeout=120 / SQS encryption KMS / **NO API Destinations** / EventBridge → SQS target |
| EdgeStack | CloudFront 2 origins (S3 + ALB) / `/api/*` cache=disabled / `/api/decisions/*/stream` readTimeout=60 / OAC for S3 |
| MonitoringStack | LogGroup count=4 (rotator 除外) / SNS Topic / Alarm count=6 / Budget threshold=200 |

Pattern:
```typescript
import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { NetworkStack } from '../lib/stacks/network-stack';

describe('NetworkStack', () => {
  const app = new App();
  const ctx = { envName: 'prod' as const, awsAccount: '123456789012', awsRegion: 'ap-northeast-1', imageDigest: 'sha256:test', cloudfrontPrefixListId: 'pl-test' };
  const stack = new NetworkStack(app, 'TestNetworkStack', { env: { account: ctx.awsAccount, region: ctx.awsRegion }, ctx });
  const template = Template.fromStack(stack);

  test('matches snapshot', () => {
    expect(template.toJSON()).toMatchSnapshot();
  });

  test('VPC has correct CIDR', () => {
    template.hasResourceProperties('AWS::EC2::VPC', { CidrBlock: '10.0.0.0/16' });
  });

  test('NAT Gateway count is 1', () => {
    template.resourceCountIs('AWS::EC2::NatGateway', 1);
  });

  // ... 各 Stack で 5 件以上 assert
});
```

### 3.15 `infra/README.md`
- プロジェクト概要
- Prerequisites (Node 20+, pnpm, AWS CLI, AWS Profile)
- Setup
  - `pnpm install`
  - `cdk bootstrap aws://ACCOUNT/REGION` (初回のみ)
- ECR Image Push
  - `aws ecr get-login-password ... | docker login`
  - `docker build -t yesman-api apps/api/`
  - `docker tag` / `docker push`
  - Image digest を取得
- Deploy
  - `cdk deploy --all --context imageDigest=sha256:...`
- Diff / Destroy
- Test (`pnpm test`)
- 各 Stack 概要 (1 行ずつ)
- 環境変数表

### 3.16 `infra/RUNBOOK.md`
- 手動シークレット投入手順 (yesman/llm/openai 等)
- SNS Topic にメール受信先追加
- Bedrock Model アクセス申請 (Anthropic Claude + Nova、ap-northeast-1)
- CloudFront prefix list ID 取得 (`aws ec2 describe-managed-prefix-lists`)
- AWS Budgets 初回作成時の IAM 権限
- X-Origin-Verify Secret 確認方法
- トラブルシューティング (ECS タスク起動失敗 / Aurora 接続失敗 / Bedrock 403 等)

---

## 4. CDK バージョンと依存関係の確定

| パッケージ | バージョン |
|---|---|
| aws-cdk-lib | ^2.150.0 (2026-05 最新の stable) |
| constructs | ^10.3.0 |
| typescript | ^5.4.0 |
| tsx | ^4.7.0 |
| jest | ^29.7.0 |
| ts-jest | ^29.1.0 |
| @types/jest | ^29.5.0 |
| @types/node | ^20.0.0 |

---

## 5. 出力するファイル数集計

| カテゴリ | ファイル数 |
|---|---|
| プロジェクト設定 | 5 |
| エントリポイント | 1 |
| 共通設定 | 2 |
| Stack 実装 | 7 |
| テスト | 7 |
| ドキュメント | 2 |
| **合計** | **24** |

---

## 6. 検証 / Acceptance Criteria (Part 2 完了時の確認項目)

- [ ] `pnpm install` が成功
- [ ] `pnpm tsc --noEmit` がエラーなく完了 (型チェック)
- [ ] `pnpm jest` が全テスト pass (snapshot + assertions)
- [ ] `pnpm cdk synth` が全 Stack をエラーなく synth 可能 (`cdk.out/*.template.json` 生成)
- [ ] `pnpm cdk diff` で想定通りの差分が表示される (初回 deploy 前)
- [ ] **deploy は実行しない** (デモ前の手動 deploy を想定、CDK CI で deploy しないこと)
- [ ] `infra/README.md` の手順で外部開発者が再現 deploy 可能
- [ ] `infra/RUNBOOK.md` に運用手順 6 項目 (シークレット投入 / SNS / Bedrock / prefix list / Budgets / Origin Verify) すべて記載

---

## 7. リスクと緩和策

| リスク | 緩和策 |
|---|---|
| CDK v2 API バージョン差異で型エラー | aws-cdk-lib バージョンを `package.json` で固定 (`^2.150.0`) |
| Bedrock model アクセス未承認で deploy 後にエラー | RUNBOOK.md で先に Model アクセス申請を促す |
| CloudFront prefix list ID 誤入力 | RUNBOOK.md の取得コマンドを明示、CDK context 検証で missing なら fail |
| ALB target group health check `/health` 未実装 (U2 担当) | infra deploy は通るが、ECS タスクが unhealthy になる。U2 完了まで `/health` は stub で fail 期待。Order of Operations を README に明記 |
| Aurora endpoint 取得タイミング | DataStack の Aurora cluster `clusterEndpoint.hostname` を ApiStack に props 経由で渡す (CDK が自動解決) |
| **EventBridge → ALB 不可問題** (元 API Destinations) | **SQS パターンで解決済** (Infrastructure Design / Code Gen Plan 共に修正)。EventBridge → SQS → ECS Task SQS Poller で内部完結 |
| CloudFront customHeaders Secret CFN template 埋め込み | デモ規模では受容、CDK Bootstrap Bucket は account 内部のためリスク限定的。本番化時は Lambda@Edge 検討 |

---

## 8. Part 2 (Generation) 実行プラン

Part 1 (本書) 承認後、Part 2 で以下を実行:

1. ディレクトリ作成 (`infra/` 配下)
2. Phase A (プロジェクト設定 + 共通設定) ファイル生成
3. Phase B (7 Stack) ファイル生成
4. Phase C (エントリポイント) ファイル生成
5. Phase D (テスト) ファイル生成
6. Phase E (ドキュメント) ファイル生成
7. 検証: `pnpm install` (可能なら、もしくは構文チェックのみ)
8. 検証: 各ファイルが Plan §1 の一覧通り存在
9. aidlc-state.md を「U1 完了 / U1 - Build and Test 入力」へ更新
10. audit.md にエントリ追記
11. ユーザーへ 2-option completion 提示

---

## 9. 承認チェックリスト

- [x] 24 ファイル すべてに役割と実装方針が記載
- [x] CDK バージョンと依存関係が確定
- [x] 生成順序 (Phase A → E) が明示
- [x] 各 Stack の主要 Construct + 公開 properties が定義
- [x] 検証手順 / Acceptance Criteria が明示
- [x] リスクと緩和策が網羅
- [x] Part 2 実行プランが明確
