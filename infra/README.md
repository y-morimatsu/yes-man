# YesMan Infrastructure (U1 / infra)

AWS CDK (TypeScript) で YesMan の全 AWS インフラを定義する CONSTRUCTION U1 ユニットの成果物。

## 概要

- **CDK version**: v2.150.x
- **Region**: `ap-northeast-1` (東京)
- **対象環境**: `prod` (本番)
- **Stack 数**: 7 (Network / Auth / Ai / Data / Api / Edge / Monitoring)
- **デプロイ方式**: 手動 `cdk deploy` (CI/CD パイプライン化は後続課題)

## アーキテクチャ

```
User → CloudFront (HTTPS) ──┬─→ S3 Bucket (Static PWA)
                            │
                            └─→ ALB (HTTP) → ECS Fargate (FastAPI + X-Ray sidecar)
                                                  │
                                                  ├─→ Aurora Serverless v2 (PostgreSQL)
                                                  ├─→ Cognito (auth)
                                                  ├─→ Bedrock + Guardrails (LLM)
                                                  ├─→ Polly / Transcribe (voice)
                                                  ├─→ Secrets Manager
                                                  └─→ EventBridge → SQS → ECS Poller (async)
```

詳細は [`aidlc-docs/construction/U1-infra/infrastructure-design/infrastructure-design.md`](../aidlc-docs/construction/U1-infra/infrastructure-design/infrastructure-design.md) を参照。

## 前提条件

- Node.js 20+
- pnpm 8+
- AWS CLI v2
- AWS Profile (例: `yesman-prod`) が設定済
- AWS Bedrock の Claude 3 Haiku + Nova Lite モデルへのアクセス申請済 ([RUNBOOK.md](./RUNBOOK.md))
- CloudFront origin-facing prefix list ID を取得済 ([RUNBOOK.md](./RUNBOOK.md))

## セットアップ

```bash
# 依存インストール
pnpm install

# 初回 CDK Bootstrap (account/region 単位で 1 回のみ)
AWS_PROFILE=yesman-prod cdk bootstrap aws://$(aws sts get-caller-identity --query Account --output text)/ap-northeast-1
```

## デプロイ手順

### 1. ECR にコンテナイメージを push

```bash
# (U2-U7 で apps/api/ のコードが完成後)

# ECR Repository は ApiStack 作成時に出力される URI を確認
ECR_URI=$(aws cloudformation describe-stacks \
  --stack-name yesman-prod-api \
  --query "Stacks[0].Outputs[?OutputKey=='EcrRepoUri'].OutputValue" \
  --output text)

# ECR にログイン
aws ecr get-login-password --region ap-northeast-1 | \
  docker login --username AWS --password-stdin $ECR_URI

# ビルド + push
docker build -t yesman-api ../apps/api/
docker tag yesman-api:latest $ECR_URI:$(git rev-parse --short HEAD)
IMAGE_DIGEST=$(docker push $ECR_URI:$(git rev-parse --short HEAD) | grep -oE 'sha256:[a-f0-9]+')

echo "Image Digest: $IMAGE_DIGEST"
```

### 2. CloudFront prefix list ID を取得 (初回のみ)

```bash
PREFIX_LIST_ID=$(aws ec2 describe-managed-prefix-lists \
  --filters Name=prefix-list-name,Values=com.amazonaws.global.cloudfront.origin-facing \
  --region ap-northeast-1 \
  --query "PrefixLists[0].PrefixListId" \
  --output text)
```

### 3. CDK Deploy

```bash
AWS_PROFILE=yesman-prod cdk deploy --all \
  --context imageDigest=$IMAGE_DIGEST \
  --context cloudfrontPrefixListId=$PREFIX_LIST_ID
```

依存解決順に 7 Stack がデプロイされる: Network → Auth/Ai → Data → Api → Edge → Monitoring。

### 4. Post-deploy 手順

[`RUNBOOK.md`](./RUNBOOK.md) を参照し、以下を実行:

- LLM API キーの手動投入 (`yesman/prod/llm/openai`, `yesman/prod/llm/anthropic`)
- SNS Topic にメール受信先を追加
- Cognito App Client の callback URLs を CloudFront ドメインに更新

## 開発用コマンド

```bash
# CloudFormation Template synth
pnpm synth

# 差分確認
AWS_PROFILE=yesman-prod cdk diff

# テスト (AWS 認証不要、CI で実行可)
pnpm test

# 初回実行時は snapshot が無いため自動生成される (1 回目は成功で snapshot 作成のみ)
# snapshot を意図的に更新する場合:
pnpm test:update

# 削除 (デモ後)
AWS_PROFILE=yesman-prod cdk destroy --all
```

## Stack 一覧

| Stack | 主要リソース |
|---|---|
| `yesman-prod-network` | VPC (10.0.0.0/16) / Subnet × 4 / NAT / 3 SG |
| `yesman-prod-auth` | Cognito User Pool / App Client (PKCE) / Hosted UI |
| `yesman-prod-ai` | Bedrock Guardrails / IAM Managed Policy × 2 |
| `yesman-prod-data` | KMS × 2 / Aurora Serverless v2 / Secrets × 3 |
| `yesman-prod-api` | ECR / ECS Fargate / ALB / EventBridge / SQS |
| `yesman-prod-edge` | CloudFront / S3 Static / OAC |
| `yesman-prod-monitoring` | Log Groups × 3 / SNS / Alarms × 4 / AWS Budget |

## 環境変数

`bin/yesman.ts` は以下の環境変数を参照する:

| 変数 | 用途 | デフォルト |
|---|---|---|
| `CDK_DEFAULT_ACCOUNT` | AWS Account ID (AWS Profile から自動取得) | (必須、prod deploy 時) |
| `CDK_DEFAULT_REGION` | AWS Region | `ap-northeast-1` |

CDK context (`--context KEY=VALUE`):

| context key | 用途 | デフォルト |
|---|---|---|
| `envName` | 環境名 (prod / dev) | `prod` |
| `imageDigest` | ECR イメージ digest | (必須、prod deploy 時) |
| `cloudfrontPrefixListId` | CloudFront origin-facing prefix list ID | `pl-XXXXXXXX` (要更新) |

## トラブルシューティング

[`RUNBOOK.md`](./RUNBOOK.md#トラブルシューティング) を参照。

## 順序依存

U1 (本ユニット) は他のユニットの前提となるが、以下に注意:

- `/health` エンドポイントは **U2 / storage** で実装される。U2 完了までは ECS タスクが unhealthy 状態になる (deploy は通る)
- アプリコード本体は **U3-U7** で実装され、ECR イメージとして push される
- 初回 deploy 時は U1 を先行して deploy → U2-U7 のコードを実装 → ECR push → CDK re-deploy のフロー
