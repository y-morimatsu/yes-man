# U1 / infra — Infrastructure Design

**ユニット**: U1 / infra
**フェーズ**: CONSTRUCTION - Per-Unit Loop
**ステージ**: Infrastructure Design (3/4 stages for U1)
**作成日**: 2026-05-10
**前提**:
- U1 NFR Requirements 承認済 (2026-05-10T09:00:00Z)
- U1 NFR Design 承認済 (2026-05-10T10:00:00Z)

---

## 0. ドキュメントの目的

NFR Design で確定した設計判断を、**実装可能な AWS CDK Stack 構造**に落とし込む。本書は Code Generation (CDK TypeScript 実装) の直前 specification として、Stack 分割・依存関係・各 Construct の責務を確定する。

---

## 1. CDK プロジェクト構造

`infra/` は **pnpm + Turborepo monorepo の workspace member** (`apps/api/` / `apps/web/` と並列)。`pnpm-workspace.yaml` の `packages:` に `infra` を含める。

```
infra/                                  # U1 のスコープ (pnpm workspace member)
├── package.json                        # CDK + TypeScript 依存
├── tsconfig.json
├── cdk.json                            # CDK アプリエントリ + context
├── jest.config.js                      # snapshot + assertions テスト用
├── .gitignore                          # cdk.out/ 除外
├── bin/
│   └── yesman.ts                       # CDK App エントリ (Stack 生成)
├── lib/
│   ├── stacks/
│   │   ├── network-stack.ts            # VPC / Subnet / NAT / SG
│   │   ├── data-stack.ts               # Aurora / KMS / Secrets
│   │   ├── auth-stack.ts               # Cognito User Pool / App Client
│   │   ├── edge-stack.ts               # CloudFront / S3 / OAC
│   │   ├── api-stack.ts                # ECR / ECS / ALB / EventBridge
│   │   ├── ai-stack.ts                 # Bedrock Guardrails / IAM Roles
│   │   └── monitoring-stack.ts         # CloudWatch / X-Ray / Budget
│   ├── constructs/                     # 再利用可能な Construct (任意)
│   │   ├── secret-with-rotation.ts
│   │   └── alb-cloudfront-origin.ts
│   └── config/
│       ├── context.ts                  # env (dev/prod) ごとの context 読込
│       └── types.ts                    # 共通 型定義
└── test/
    ├── snapshots/                      # __snapshots__ ディレクトリ
    ├── network-stack.test.ts           # snapshot + assertions
    ├── data-stack.test.ts
    └── ... (各 Stack 1 ファイル)
```

---

## 2. CDK App エントリポイント (`bin/yesman.ts`)

```typescript
import * as cdk from 'aws-cdk-lib';
import { NetworkStack } from '../lib/stacks/network-stack';
import { DataStack } from '../lib/stacks/data-stack';
import { AuthStack } from '../lib/stacks/auth-stack';
import { EdgeStack } from '../lib/stacks/edge-stack';
import { ApiStack } from '../lib/stacks/api-stack';
import { AiStack } from '../lib/stacks/ai-stack';
import { MonitoringStack } from '../lib/stacks/monitoring-stack';
import { loadContext } from '../lib/config/context';

const app = new cdk.App();
const ctx = loadContext(app);   // dev/prod context + imageDigest etc.

const env = { account: ctx.awsAccount, region: ctx.awsRegion /* ap-northeast-1 */ };

// Stack 生成 (依存順)
const network = new NetworkStack(app, `yesman-${ctx.envName}-network`, { env });
const data    = new DataStack(   app, `yesman-${ctx.envName}-data`,    { env, vpc: network.vpc, dbSg: network.auroraSg });
const auth    = new AuthStack(   app, `yesman-${ctx.envName}-auth`,    { env });
const ai      = new AiStack(     app, `yesman-${ctx.envName}-ai`,      { env, envName: ctx.envName });
const api     = new ApiStack(    app, `yesman-${ctx.envName}-api`,     { env, vpc: network.vpc, ecsSg: network.ecsSg, albSg: network.albSg, dbSecret: data.dbSecret, userPool: auth.userPool, appClient: auth.appClient, llmSecrets: data.llmSecrets, eventApiKey: data.eventApiKey, guardrailId: ai.guardrailId, imageDigest: ctx.imageDigest });
const edge    = new EdgeStack(   app, `yesman-${ctx.envName}-edge`,    { env, alb: api.alb, originVerifySecret: api.originVerifySecret });   // Custom Domain 不採用のため ap-northeast-1 で OK (CloudFront Distribution はグローバルリソース、Stack 自体はどの region でも作成可)
new MonitoringStack(app, `yesman-${ctx.envName}-monitoring`, { env, alb: api.alb, ecsService: api.ecsService, cluster: data.cluster, monthlyBudgetUsd: 200 });
```

### 重要パラメータ

| context | 役割 | 例 |
|---|---|---|
| `envName` | 環境名 | `prod` / `dev` (CDK は prod のみ deploy 想定) |
| `awsAccount` | 対象 AWS Account ID | `123456789012` |
| `awsRegion` | 対象リージョン | `ap-northeast-1` |
| `imageDigest` | ECS タスクで使用する ECR イメージの digest | `sha256:abc...` |

`cdk.json` で:
```json
{
  "context": {
    "@aws-cdk/aws-ecs:disableEcsImdsBlocking": false,
    "envName": "prod"
  }
}
```

AWS Account / Region は **環境変数** から取得 (複数アカウントへの deploy 容易化、Pull Request CI で別アカウントへ deploy 可能):
```typescript
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT || ctx.awsAccount,
  region:  process.env.CDK_DEFAULT_REGION  || 'ap-northeast-1',
};
```

deploy 時に:
- `AWS_PROFILE=yesman-prod cdk deploy --all --context imageDigest=sha256:...`
- Account/Region は AWS Profile から自動取得

---

## 3. NetworkStack (VPC / Subnet / NAT / SG)

### 責務
- VPC `10.0.0.0/16` 作成
- 2 AZ (`ap-northeast-1a` + `ap-northeast-1c`) で Public/Private サブネット × 各 2 個 = 計 4 サブネット
- NAT Gateway 1 個 (Public Subnet a に配置、コスト最適化)
- 3 Security Group (`alb-sg` / `ecs-sg` / `aurora-sg`)

### 主要 Construct

| Construct | プロパティ |
|---|---|
| `ec2.Vpc` | `cidr: '10.0.0.0/16'`, `maxAzs: 2`, `natGateways: 1`, `subnetConfiguration: [public /20, private-with-egress /20]` |
| `ec2.SecurityGroup` × 3 | `alb-sg`, `ecs-sg`, `aurora-sg` (詳細は NFR Design §1.3) |

### Outputs (cross-stack)
- `vpc`: `ec2.Vpc` (DataStack / ApiStack で使用)
- `albSg`, `ecsSg`, `auroraSg`: `ec2.SecurityGroup` (各 Stack で attach)

### SG ルール詳細

```typescript
// alb-sg: CloudFront prefix list からのみ HTTP 80 を許可
// 注意: prefix list ID は region-specific。deploy 前に下記コマンドで取得:
//   aws ec2 describe-managed-prefix-lists \
//     --filters Name=prefix-list-name,Values=com.amazonaws.global.cloudfront.origin-facing \
//     --region ap-northeast-1
// 取得した PrefixListId を cdk.json context (`cloudfrontPrefixListId`) に設定
const cfPrefixListId = this.node.tryGetContext('cloudfrontPrefixListId') || 'pl-XXXXXXXX';   // 例: ap-northeast-1 の値
albSg.addIngressRule(ec2.Peer.prefixList(cfPrefixListId), ec2.Port.tcp(80), 'CloudFront origin only');

// ecs-sg: alb-sg からの 8000 (FastAPI)
ecsSg.addIngressRule(albSg, ec2.Port.tcp(8000), 'ALB → ECS FastAPI');

// aurora-sg: ecs-sg からの 5432 (PostgreSQL)
auroraSg.addIngressRule(ecsSg, ec2.Port.tcp(5432), 'ECS → Aurora PostgreSQL');
```

---

## 4. DataStack (Aurora / KMS / Secrets)

### 責務
- KMS CMK 2 個作成 (`yesman-aurora-kms` / `yesman-secrets-kms`)
- Aurora Serverless v2 PostgreSQL Cluster
- Secrets Manager に DB master credentials + 自動ローテーション設定
- LLM API keys 等のシークレットを保管 (空で作成、値は手動投入)
- EventBridge API Destinations 用 Bearer Token 保管

### 主要 Construct

| Construct | プロパティ |
|---|---|
| `kms.Key` × 2 | Aurora 用 / Secrets Manager 用 (自動年次ローテーション、Description, removalPolicy: RETAIN) |
| `rds.DatabaseCluster` | `engine: AuroraPostgresEngineVersion.VER_15_4`, `writer: ClusterInstance.serverlessV2({...})`, `readers: []`, `serverlessV2MinCapacity: 0.5`, `serverlessV2MaxCapacity: 2`, `vpc + subnetSelection: PRIVATE_WITH_EGRESS`, `storageEncrypted: true`, `storageEncryptionKey: auroraKmsKey`, `backupRetention: Duration.days(1)`, `performanceInsightsRetention: 7` |
| Aurora cluster `credentials` | `rds.Credentials.fromGeneratedSecret('yesman', { secretName: 'yesman/db/master', encryptionKey: secretsKmsKey })` — cluster 作成時に Secret 自動生成される |
| **自動ローテーション** | `cluster.addRotationSingleUser({ automaticallyAfter: Duration.days(30) })` — AWS provided Lambda + Log Group `/aws/lambda/...` が自動生成 (本 Stack で明示作成不要) |
| `secretsmanager.Secret` `yesman/llm/openai` | 空で作成、`encryptionKey: secretsKmsKey`、値は手動投入 |
| `secretsmanager.Secret` `yesman/llm/anthropic` | 同上 |
| `secretsmanager.Secret` `yesman/eventbridge/api-key` | 空で作成、値は手動投入 |
| ~~`yesman/web-tokens/cognito`~~ | **不要** (Cognito App Client は `generateSecret: false`、SPA は PKCE で認証するため App Client Secret 不在) |

### Outputs
- `cluster`: `rds.DatabaseCluster`
- `dbSecret`: `secretsmanager.Secret` (`yesman/db/master`)
- `llmSecrets`: `{ openai, anthropic }` Secret 参照
- `eventApiKey`: Secret 参照

---

## 5. AuthStack (Cognito)

### 責務
- Cognito User Pool
- App Client (Hosted UI 有効)
- Hosted UI ドメイン (Cognito 標準ドメイン)

### 主要 Construct

| Construct | プロパティ |
|---|---|
| `cognito.UserPool` | `passwordPolicy: { minLength: 8, requireLowercase: true, requireUppercase: true, requireDigits: true, requireSymbols: false }`, `mfa: Mfa.OPTIONAL`, `mfaSecondFactor: { otp: true, sms: false }`, `signInAliases: { email: true }`, `selfSignUpEnabled: true`, `advancedSecurityMode: AdvancedSecurityMode.AUDIT` (デモ規模はAUDIT、本番化時 ENFORCED 検討), `email: UserPoolEmail.withCognito()` (デフォルト Cognito email) |
| `cognito.UserPoolClient` | `userPool`, `authFlows: { adminUserPassword: false, userPassword: false, userSrp: true }`, **`generateSecret: false`** (SPA は client side で secret 保持不可、PKCE で代替)、`oAuth: { flows: { authorizationCodeGrant: true /* CDK は PKCE をデフォルト有効 */ }, scopes: [OAuthScope.OPENID, OAuthScope.EMAIL, OAuthScope.PROFILE], callbackUrls: [`https://${cfDomain}/auth/callback`], logoutUrls: [`https://${cfDomain}/auth/logout`] }` |
| `cognito.UserPoolDomain` | `cognitoDomain: { domainPrefix: `yesman-${envName}` }` (= `yesman-prod.auth.ap-northeast-1.amazoncognito.com`) |

### Outputs
- `userPool`: `cognito.UserPool`
- `appClient`: `cognito.UserPoolClient`
- `userPoolDomain`: `cognito.UserPoolDomain`

---

## 6. AiStack (Bedrock Guardrails / IAM Roles)

### 責務
- Bedrock Guardrails 作成 (prod のみ、dev/ci では未作成)
- Bedrock / Polly / Transcribe アクセス用 IAM Role (ECS Task Role に attach されるポリシー)

### 主要 Construct

| Construct | プロパティ |
|---|---|
| `bedrock.CfnGuardrail` (L1 CFN) | `contentPolicyConfig.filtersConfig: [{type: SEXUAL, inputStrength: HIGH, outputStrength: HIGH}, {type: VIOLENCE, ...}, {type: HATE, ...MEDIUM}, {type: MISCONDUCT, ...MEDIUM}]`, `topicPolicyConfig.topicsConfig: [{name: 'Religion', type: DENY, definition: '...', examples: [...]}, {name: 'Elections', type: DENY, ...}]`, `sensitiveInformationPolicyConfig.piiEntitiesConfig: [{type: EMAIL, action: ANONYMIZE}, {type: PHONE, ANONYMIZE}, ...]`, `blockedInputMessaging: 'AI はこの種の判断はサポートしません'`, `blockedOutputsMessaging: '...'` |
| `iam.ManagedPolicy` `yesman-bedrock-access` | Bedrock InvokeModel / InvokeModelWithResponseStream / Converse / ConverseStream / ApplyGuardrail のみ許可 (specific model ARN: Claude 3 Haiku + Nova) |
| `iam.ManagedPolicy` `yesman-voice-access` | Polly SynthesizeSpeech + Transcribe StartTranscriptionJob 等 |

### Outputs
- `guardrailId`: Bedrock Guardrail ID (ApiStack 経由で ECS Task に環境変数として渡す)
- `bedrockAccessPolicy`, `voiceAccessPolicy`: `iam.ManagedPolicy`

---

## 7. ApiStack (ECR / ECS / ALB / EventBridge)

### 責務
- ECR Repository (タスク用イメージ受け)
- ECS Cluster + Service + Task Definition
- ALB (HTTP only) + Target Group
- EventBridge Bus + Rule + API Destinations + Connection
- ECS Task Role (Bedrock/Polly/Transcribe/Secrets/EventBridge アクセス)

### 主要 Construct

| Construct | プロパティ |
|---|---|
| `ecr.Repository` `yesman-api` | `imageScanOnPush: true`, `imageTagMutability: IMMUTABLE`, `lifecycleRules: [{maxImageCount: 10}]` |
| `ecs.Cluster` | `vpc`, `containerInsights: true` |
| `ecs.FargateTaskDefinition` | `cpu: 512`, `memoryLimitMiB: 1024`, `taskRole: ecsTaskRole` (Bedrock/Polly/Transcribe/Secrets policies attached), `executionRole: ecsExecRole` (ECR pull + CloudWatch Logs) |
| `ContainerDefinition` (API) | `image: ContainerImage.fromEcrRepository(repo, imageDigest)`, `logging: AwsLogDriver({ streamPrefix: 'yesman-api', logRetention: RetentionDays.ONE_WEEK })`, `environment: { APP_ENV: 'prod', AUTH_BACKEND: 'cognito', STORAGE_BACKEND: 'aurora', VOICE_BACKEND: 'aws', LLM_PROVIDER: 'bedrock', EVENT_BACKEND: 'eventbridge', COGNITO_USER_POOL_ID, COGNITO_APP_CLIENT_ID, BEDROCK_GUARDRAIL_ID, EVENT_BUS_NAME }`, **`secrets: { DATABASE_URL: Secret.fromSecretsManager(dbSecret), OPENAI_API_KEY, ANTHROPIC_API_KEY, EVENTBRIDGE_API_KEY, ORIGIN_VERIFY_SECRET }`** (注: `COGNITO_APP_CLIENT_SECRET` は不要、SPA PKCE のため), `portMappings: [{ containerPort: 8000 }]`, `healthCheck: { command: ['CMD-SHELL', 'curl -f http://localhost:8000/health \|\| exit 1'], interval: Duration.seconds(30), retries: 3 }` |
| `ContainerDefinition` (X-Ray sidecar) | `image: 'amazon/aws-xray-daemon'`, `portMappings: [{ containerPort: 2000, protocol: UDP }]` |
| `ecs.FargateService` | `cluster`, `taskDefinition`, `desiredCount: 2`, `assignPublicIp: false`, `vpcSubnets: { subnetType: PRIVATE_WITH_EGRESS }`, `securityGroups: [ecsSg]`, `enableExecuteCommand: true (デモ運用補助)`, `capacityProviderStrategies: [{ capacityProvider: 'FARGATE', weight: 1 }]` |
| **Auto-Scaling** | `scalableTarget.scaleOnCpuUtilization({ targetUtilizationPercent: 70 })`, `scaleOnMemoryUtilization({ targetUtilizationPercent: 70 })`, `minCapacity: 1`, `maxCapacity: 4` |
| `elbv2.ApplicationLoadBalancer` | `vpc`, `internetFacing: true`, `securityGroup: albSg`, `idleTimeout: Duration.seconds(120)`, `subnets: [public a + c]` |
| `elbv2.ApplicationListener` (HTTP 80) | `port: 80`, `defaultAction: forward to target group` (X-Origin-Verify 検証はアプリ層で実施) |
| `elbv2.ApplicationTargetGroup` | `targetType: IP`, `port: 8000`, `protocol: HTTP`, `targets: [ecsService]`, `healthCheck: { path: '/health', interval: Duration.seconds(5), unhealthyThresholdCount: 3, healthyThresholdCount: 2, timeout: Duration.seconds(3) }`, `deregistrationDelay: Duration.seconds(30)` |
| `events.EventBus` `yesman-bus` | KMS 暗号化 (`yesman-secrets-kms`) |
| `events.Rule` `decision-confirmed-rule` | `eventPattern: { source: ['yesman.decision'], detailType: ['DecisionConfirmed'] }`, `targets: [SqsQueue(decisionEventsQueue)]` |
| `sqs.Queue` `yesman-decision-events` | KMS 暗号化 (`yesman-secrets-kms`)、`visibilityTimeout: 60s`、DLQ なし (デモ規模、必要なら後付け)、`receiveMessageWaitTime: 20s` (long polling) |
| **(API Destinations 不採用)** | 当初設計の EventBridge → ALB internal endpoint は ALB SG が CloudFront prefix list 制限のため不可能。SQS 経由に変更 |

### Originverify Secret (FastAPI middleware で検証 / CloudFormation Template への値露出回避)

- CDK で `secretsmanager.Secret` を `yesman/api/origin-verify` として作成 (値は CDK 自動生成、`generateSecretString`)
- **検証方法 (重要)**: ALB Listener Rule では検証しない (Listener Rule に Secret 値を渡すと CloudFormation Template に平文露出する)
- 代わりに ECS Task の `secrets` 経由で環境変数 `ORIGIN_VERIFY_SECRET` を Secret から取得し、**FastAPI middleware で検証**
- CloudFront の Origin Custom Headers (EdgeStack §8) で `X-Origin-Verify: <secret>` を付加 (これも CDK で動的解決、CloudFront Distribution リソースに反映される)
- 直接 ALB アクセス時はヘッダ不在 → FastAPI middleware が 403 Forbidden 返却
- Defense in Depth: SG (CloudFront prefix list 制限) + アプリ層 middleware (X-Origin-Verify 検証) の二段構え

### Outputs
- `alb`: `elbv2.ApplicationLoadBalancer` (EdgeStack で origin として使用)
- `ecsService`: `ecs.FargateService` (MonitoringStack でメトリクス対象)
- `originVerifySecret`: Secret (EdgeStack で CloudFront → ALB のヘッダ値として使用)
- `decisionEventsQueue`: `sqs.Queue` (ECS Task が SQS Poller で消費、MonitoringStack でメトリクス対象)

### ECS Task の SQS 消費パターン

ECS Task は FastAPI と並列で **asyncio タスク** として SQS Long Polling Poller を起動する (`apps/api/src/infrastructure/async/sqs_poller.py` 等で実装、U5 / learning が担当)。これにより:
- API Destinations は不要 (内部経路のみで完結)
- ALB SG の CloudFront prefix list 制限と矛盾しない
- DecisionConfirmed イベントが SQS 経由で ECS Task に届き、`update_profile_from_decision` を非同期実行
- VPC 完結 (Internet 通過なし、セキュリティ堅牢)
- 失敗時は SQS デフォルトの再試行 (visibility timeout 60s × default 5 回 → メッセージ削除またはエラーログ)

---

## 8. EdgeStack (CloudFront / S3 / OAC)

### 責務
- CloudFront Distribution (multi-origin: S3 + ALB)
- S3 Static bucket + OAC
- SSE 対応 Behavior

### 重要な制約
- ACM 証明書を使う場合は `us-east-1` リージョンに作成する必要がある (CloudFront 仕様)
- 本設計では Custom Domain 不採用のため、ACM 不要 (`*.cloudfront.net` の AWS-managed cert を使用)
- Stack は `ap-northeast-1` で作成可能 (CloudFront Distribution 自体はグローバルリソース)

### 主要 Construct

| Construct | プロパティ |
|---|---|
| `s3.Bucket` `yesman-static` | `blockPublicAccess: BLOCK_ALL`, `encryption: S3_MANAGED`, `removalPolicy: DESTROY` (デモ規模) |
| `cloudfront.OriginAccessControl` | for S3 |
| `cloudfront.Distribution` | 後述 (multi-origin) |

### Distribution 構成

```typescript
new cloudfront.Distribution(this, 'Cdn', {
  defaultBehavior: {
    origin: new origins.S3BucketOrigin(staticBucket, { originAccessControl: oac }),
    viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
    cachePolicy: CachePolicy.CACHING_OPTIMIZED,
    compress: true,
  },
  additionalBehaviors: {
    '/api/*': {
      origin: new origins.HttpOrigin(albDns, {
        protocolPolicy: OriginProtocolPolicy.HTTP_ONLY,  // ALB は HTTP only
        customHeaders: { 'X-Origin-Verify': originVerifySecret.secretValue.unsafeUnwrap() }, // CloudFront Distribution は値をリソースに保持。ALB Listener Rule での検証は使わず、FastAPI middleware が ECS secrets 経由で取得した値と照合
      }),
      cachePolicy: CachePolicy.CACHING_DISABLED,
      originRequestPolicy: OriginRequestPolicy.ALL_VIEWER,
      viewerProtocolPolicy: ViewerProtocolPolicy.HTTPS_ONLY,
      allowedMethods: AllowedMethods.ALLOW_ALL,
      compress: false,  // SSE で chunk が壊れる可能性、無効化
    },
    '/api/decisions/*/stream': {
      // 同上、Origin Response Timeout 60s (quota 増加申請を実施した前提)
      origin: new origins.HttpOrigin(albDns, {
        protocolPolicy: OriginProtocolPolicy.HTTP_ONLY,
        customHeaders: { 'X-Origin-Verify': originVerifySecret.unsafeUnwrap() },
        readTimeout: Duration.seconds(60),
      }),
      cachePolicy: CachePolicy.CACHING_DISABLED,
      originRequestPolicy: OriginRequestPolicy.ALL_VIEWER,
      viewerProtocolPolicy: ViewerProtocolPolicy.HTTPS_ONLY,
      allowedMethods: AllowedMethods.ALLOW_ALL,
      compress: false,
    },
  },
  priceClass: PriceClass.PRICE_CLASS_200,
  // certificate: undefined,  // *.cloudfront.net で OK
});
```

### Outputs
- `distribution`: `cloudfront.Distribution` (MonitoringStack で 5xx 監視)
- `distributionDomainName`: 文字列 (Cognito callback URL 等で参照)

---

## 9. MonitoringStack (CloudWatch / X-Ray / Budget)

### 責務
- CloudWatch Log Groups (retention 7 日)
- CloudWatch Custom Metrics 名前空間 `Yesman/Decision` 定義 (実際の publish はアプリ側)
- CloudWatch Alarms (6 件) + SNS Topic
- AWS Budget (月額 $200) + 80% / 100% アラート

### 主要 Construct

| Construct | プロパティ |
|---|---|
| `sns.Topic` `yesman-alerts` | Email subscription は手動で追加 (CDK では作成のみ) |
| `logs.LogGroup` × 4 | `/aws/ecs/yesman-api`, `/aws/alb/yesman`, `/aws/rds/cluster/yesman-aurora/postgresql`, `/aws/bedrock/yesman-prompts` (retention 7 日)。**`/aws/lambda/<rotator>` は RDS auto-rotation が自動生成するため CDK 明示作成は不要** (重複作成で deploy エラー回避) |
| `cloudwatch.Alarm` `alb-5xx-rate` | metric: ALB HTTPCode_Target_5XX_Count / RequestCount > 0.01, evaluationPeriods: 5 (5 分平均), actions: [SnsAction(alerts)] |
| `cloudwatch.Alarm` `ecs-cpu-high` | metric: ECS Service CPU Utilization > 85%, evaluationPeriods: 5, actions: [SnsAction(alerts)] |
| `cloudwatch.Alarm` `aurora-cpu-high` | Aurora cluster ACU 使用率 > 90% |
| `cloudwatch.Alarm` `bedrock-spike` | Custom metric `bedrock.invocation.count` > baseline × 2 |
| `cloudwatch.Alarm` `monthly-budget-80` / `monthly-budget-100` | Budget で実装 (下記) |
| `budgets.CfnBudget` | `budgetType: COST`, `timeUnit: MONTHLY`, `budgetLimit: { amount: 200, unit: 'USD' }`, `notificationsWithSubscribers: [{ notification: { threshold: 80, ... }, subscribers: [{ subscriptionType: SNS, address: alertsTopic.topicArn }] }, { ... threshold: 100, ... }]` |

---

## 10. Stack 依存グラフ

```
                ┌─────────────────────┐
                │   NetworkStack       │
                │  (VPC / Subnet / SG) │
                └─────────┬───────────┘
                          │
              ┌───────────┼──────────────┐
              │           │              │
              ▼           ▼              ▼
       ┌──────────┐  ┌────────┐  ┌──────────────┐
       │ AuthStack│  │ AiStack│  │  DataStack   │
       │ (Cognito)│  │(Bedrock│  │(Aurora/Sec/  │
       │          │  │ Guard) │  │ KMS)         │
       └────┬─────┘  └───┬────┘  └──────┬───────┘
            │            │              │
            └──────┬─────┴──────────────┘
                   ▼
            ┌──────────────────┐
            │    ApiStack      │
            │ (ECR/ECS/ALB/EB) │
            └─────────┬────────┘
                      │
            ┌─────────▼─────────┐
            │    EdgeStack      │
            │  (CloudFront/S3)  │
            └─────────┬─────────┘
                      │
            ┌─────────▼─────────┐
            │  MonitoringStack  │
            │ (CW Alarm/Budget) │
            └───────────────────┘
```

Deploy 順 (CDK が依存解決):
1. NetworkStack
2. AuthStack / AiStack / DataStack (並列可能)
3. ApiStack
4. EdgeStack
5. MonitoringStack

---

## 11. Cross-Stack 参照戦略

| 方法 | 適用箇所 | 理由 |
|---|---|---|
| **CDK constructor props** (直接 reference) | NetworkStack → 他、AuthStack → ApiStack、DataStack → ApiStack | 同一 CDK App 内では shared CloudFormation Output で解決される (CDK 標準) |
| **SSM Parameter Store** | (将来検討) | 別 CDK App / 別環境への共有時に有用、本デモ規模では不要 |
| **CloudFormation Output** | 各 Stack 末尾で `CfnOutput` を定義し、AWS CLI / コンソールから参照可能に | デバッグ・運用補助 |

各 Stack の主要 Output:

| Stack | Output |
|---|---|
| Network | `VpcId`, `AlbSgId`, `EcsSgId`, `AuroraSgId` |
| Data | `AuroraEndpoint`, `DbSecretArn`, `LlmSecretArns` |
| Auth | `UserPoolId`, `AppClientId`, `HostedUiUrl` |
| Ai | `GuardrailId`, `BedrockPolicyArn`, `VoicePolicyArn` |
| Api | `EcrRepoUri`, `EcsServiceName`, `AlbDns`, `EventBusName`, `OriginVerifySecretArn` |
| Edge | `CloudFrontDistributionId`, `CloudFrontDomainName` |
| Monitoring | `AlertTopicArn`, `BudgetName` |

---

## 12. Code Generation で扱う事項 (次ステージ)

### 12.1 CDK TypeScript 実装ファイル
- `bin/yesman.ts` + 7 Stack ファイル + `lib/config/*` + `package.json` / `tsconfig.json` / `cdk.json` / `jest.config.js`

### 12.2 Jest テスト
- Snapshot test: 各 Stack の synth 結果を `__snapshots__` に固定
- Assertions test: VPC CIDR / SG ルール / IAM 権限 / Cognito Password Policy / Aurora 暗号化有効 等を `Template.fromStack().hasResourceProperties()` で検証

### 12.3 README (`infra/README.md`)
- 依存インストール: `pnpm install`
- 初回 bootstrap: `cdk bootstrap aws://ACCOUNT/REGION`
- Deploy: `cdk deploy --all --context imageDigest=sha256:...`
- Destroy: `cdk destroy --all` (デモ後のクリーンアップ用)
- 環境変数: `.env.example` を提供 (本番 deploy 時は AWS Profile 推奨)

### 12.4 Operational Runbook
- **手動シークレット投入**: `yesman/llm/openai`, `yesman/llm/anthropic`, `yesman/eventbridge/api-key` の値を `aws secretsmanager put-secret-value` で投入
- **SNS Topic 購読**: `aws sns subscribe --topic-arn <yesman-alerts-arn> --protocol email --notification-endpoint <admin@example.com>` でメール受信先を追加 + メール内リンクで確認
- **Bedrock Model アクセス申請**:
  - AWS Console → Bedrock → Model access から Anthropic Claude 3 Haiku / Amazon Nova の Access Request を提出 (即時承認の場合が多い)
  - ap-northeast-1 で利用可能なモデルを `aws bedrock list-foundation-models --region ap-northeast-1` で確認
  - Model ARN を CDK context または環境変数で参照
- **CloudFront prefix list ID 取得** (NetworkStack で参照):
  - `aws ec2 describe-managed-prefix-lists --filters Name=prefix-list-name,Values=com.amazonaws.global.cloudfront.origin-facing --region ap-northeast-1`
  - 取得した `pl-XXXXXXXX` を `cdk.json` の `context.cloudfrontPrefixListId` に設定
- **AWS Budgets 初回作成時の権限**: 初めて AWS Budgets を使う AWS Account では、IAM Role に `aws-portal:ViewBilling` 権限を付与する必要がある場合あり。Org 管理 Account では `aws.amazon.com/billing/home` で Billing access を IAM ユーザー/Role に許可
- **CloudFront → ALB X-Origin-Verify Secret 確認**: `aws secretsmanager get-secret-value --secret-id yesman/api/origin-verify` でシークレット値確認 (デバッグ用)

---

## 13. 承認チェックリスト

- [x] CDK プロジェクト構造 (`infra/` 配下) が確定
- [x] 7 Stack の責務・主要 Construct・依存関係が明示
- [x] NFR Requirements / NFR Design 全要件が実装可能な形で展開済
- [x] Cross-Stack 参照戦略が明確 (CDK constructor props 中心)
- [x] Code Generation で生成すべきファイル一覧が確定
- [x] Operational Runbook (手動投入 / 監視) が言及されている
- [x] テスト戦略 (Jest snapshot + assertions) が確定
