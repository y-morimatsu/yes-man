# YesMan Infrastructure RUNBOOK

U1 / infra の運用手順書。手動操作が必要な項目を網羅。

## 目次

1. [LLM API キーの手動投入](#1-llm-api-キーの手動投入)
2. [SNS Topic にメール受信先を追加](#2-sns-topic-にメール受信先を追加)
3. [Bedrock Model アクセス申請](#3-bedrock-model-アクセス申請)
4. [CloudFront prefix list ID 取得](#4-cloudfront-prefix-list-id-取得)
5. [AWS Budgets 初回作成時の権限確認](#5-aws-budgets-初回作成時の権限確認)
6. [X-Origin-Verify Secret 確認](#6-x-origin-verify-secret-確認)
7. [Cognito App Client callback URL の更新](#7-cognito-app-client-callback-url-の更新)
8. [トラブルシューティング](#8-トラブルシューティング)

---

## 1. LLM API キーの手動投入

CDK は placeholder Secret として作成するが、値はセキュリティ上 CDK には含まない。Deploy 後に手動投入する。

```bash
# OpenAI
aws secretsmanager put-secret-value \
  --secret-id yesman/prod/llm/openai \
  --secret-string "sk-proj-..." \
  --region ap-northeast-1

# Anthropic
aws secretsmanager put-secret-value \
  --secret-id yesman/prod/llm/anthropic \
  --secret-string "sk-ant-..." \
  --region ap-northeast-1
```

確認:

```bash
aws secretsmanager get-secret-value \
  --secret-id yesman/prod/llm/openai \
  --region ap-northeast-1 \
  --query SecretString --output text
```

> **注**: Bedrock のキーは不要 (IAM Role で認証)。

---

## 2. SNS Topic にメール受信先を追加

CloudWatch Alarms / AWS Budgets の通知先を追加する。

```bash
# Topic ARN を取得
TOPIC_ARN=$(aws cloudformation describe-stacks \
  --stack-name yesman-prod-monitoring \
  --query "Stacks[0].Outputs[?OutputKey=='AlertTopicArn'].OutputValue" \
  --output text)

# Email 購読
aws sns subscribe \
  --topic-arn $TOPIC_ARN \
  --protocol email \
  --notification-endpoint admin@example.com \
  --region ap-northeast-1

# 受信したメール内のリンクから購読を確認
```

複数アドレス登録時は上記を繰り返す。

---

## 3. Bedrock Model アクセス申請

ap-northeast-1 で Claude 3 Haiku / Amazon Nova Lite を使用するには、初回モデルアクセス申請が必要。

1. AWS Console → **Bedrock** → **Model access**
2. 以下のモデルにチェックして Request:
   - **Anthropic**: Claude 3 Haiku
   - **Amazon**: Nova Lite (もしくは Nova Pro)
3. 通常 1-2 分で承認 (自動)。承認後 `Access granted` 表示

利用可能モデルの確認:

```bash
aws bedrock list-foundation-models --region ap-northeast-1 \
  --query 'modelSummaries[?contains(modelId, `claude-3-haiku`) || contains(modelId, `nova`)]'
```

**Model ARN format**:
- `arn:aws:bedrock:ap-northeast-1::foundation-model/anthropic.claude-3-haiku-20240307-v1:0`
- `arn:aws:bedrock:ap-northeast-1::foundation-model/amazon.nova-lite-v1:0`

`lib/stacks/ai-stack.ts` の `bedrockModelArns` 配列をモデルアクセス承認済の ARN に揃える。

---

## 4. CloudFront prefix list ID 取得

ALB SG が CloudFront origin からのみ受け入れる設定で必要。

```bash
aws ec2 describe-managed-prefix-lists \
  --filters Name=prefix-list-name,Values=com.amazonaws.global.cloudfront.origin-facing \
  --region ap-northeast-1 \
  --query "PrefixLists[0].PrefixListId" \
  --output text
```

出力例: `pl-58a04531`

これを `cdk.json` の `context.cloudfrontPrefixListId` に設定するか、deploy 時に `--context cloudfrontPrefixListId=pl-...` で渡す。

---

## 5. AWS Budgets 初回作成時の権限確認

AWS Budgets を初めて使う AWS Account では、CDK で deploy 前に以下を確認する。

```bash
# 自分の IAM User / Role に Budgets 権限があるか確認
aws iam list-attached-user-policies --user-name your-user
# または、組織管理 Account で Billing access が許可されているか
```

足りない場合、IAM Role に以下を付与 (組織管理者作業):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "budgets:*",
        "aws-portal:ViewBilling"
      ],
      "Resource": "*"
    }
  ]
}
```

---

## 6. X-Origin-Verify Secret 確認

CloudFront → ALB → ECS の origin verification で使われる Secret。FastAPI middleware が検証する。

```bash
# 値を確認 (デバッグ時)
aws secretsmanager get-secret-value \
  --secret-id yesman/prod/api/origin-verify \
  --region ap-northeast-1 \
  --query SecretString --output text
```

> **注**: この値は CDK が自動生成し、CloudFront Distribution の Custom Header と ECS Task の環境変数 (Secrets 経由) に渡る。FastAPI middleware で受信ヘッダと環境変数の値を照合する実装は U7a/U7d で行う。

ローテーション (任意):

```bash
# 新しい値を生成して更新
NEW_SECRET=$(openssl rand -hex 16)
aws secretsmanager put-secret-value \
  --secret-id yesman/prod/api/origin-verify \
  --secret-string "$NEW_SECRET" \
  --region ap-northeast-1

# CDK で CloudFront Distribution を再 deploy (新しい値を Origin Custom Header に反映)
cdk deploy yesman-prod-edge --context imageDigest=... --context cloudfrontPrefixListId=...

# ECS タスクを再起動 (新 Secret 値を読込)
aws ecs update-service \
  --cluster yesman-prod-cluster \
  --service yesman-prod-api \
  --force-new-deployment \
  --region ap-northeast-1
```

---

## 7. Cognito App Client callback URL の更新

AuthStack 初回 deploy 時は placeholder URL (`placeholder.cloudfront.net`) で作成される。EdgeStack deploy 後、実際の CloudFront ドメインに更新する。

```bash
# CloudFront ドメインを取得
CF_DOMAIN=$(aws cloudformation describe-stacks \
  --stack-name yesman-prod-edge \
  --query "Stacks[0].Outputs[?OutputKey=='CloudFrontDomainName'].OutputValue" \
  --output text)

# App Client ID を取得
APP_CLIENT_ID=$(aws cloudformation describe-stacks \
  --stack-name yesman-prod-auth \
  --query "Stacks[0].Outputs[?OutputKey=='AppClientId'].OutputValue" \
  --output text)

USER_POOL_ID=$(aws cloudformation describe-stacks \
  --stack-name yesman-prod-auth \
  --query "Stacks[0].Outputs[?OutputKey=='UserPoolId'].OutputValue" \
  --output text)

# Callback URL を更新
aws cognito-idp update-user-pool-client \
  --user-pool-id $USER_POOL_ID \
  --client-id $APP_CLIENT_ID \
  --callback-urls "https://${CF_DOMAIN}/auth/callback" \
  --logout-urls "https://${CF_DOMAIN}/auth/logout" \
  --allowed-o-auth-flows code \
  --allowed-o-auth-scopes openid email profile \
  --allowed-o-auth-flows-user-pool-client \
  --region ap-northeast-1
```

または CDK の `auth-stack.ts` に CloudFront ドメインを props 経由で渡し、deploy 直前に値を確定して再 deploy する pattern も可。

---

## 8. トラブルシューティング

### ECS タスクが unhealthy → 起動失敗のループ

- 初回 deploy 時、`/health` エンドポイントは未実装 (U2 で実装)。タスクが unhealthy → 削除のループになる
- 対処: U2 で `/health` 実装後に Container Image を push、Task Definition の image digest を更新して再 deploy

### Aurora 接続失敗 (FATAL: password authentication failed)

- Secrets Manager の `yesman/prod/db/master` ローテーションでパスワードが更新された直後の場合あり
- ECS タスクは Secrets Manager から起動時に値を取得するため、ローテーション後にタスク再起動が必要

```bash
aws ecs update-service \
  --cluster yesman-prod-cluster \
  --service yesman-prod-api \
  --force-new-deployment \
  --region ap-northeast-1
```

### Bedrock 403 AccessDeniedException

- Model access が承認されていない可能性 (Section 3 参照)
- AiStack の `bedrockModelArns` 配列が承認済モデルと一致しているか確認

### CloudFront から ALB に 502 Bad Gateway

- ALB SG が CloudFront prefix list を許可していない可能性
- `lib/stacks/network-stack.ts` の `cloudfrontPrefixListId` が正しい (region-specific) か確認
- Section 4 のコマンドで取得した最新値を `cdk.json` に反映 + 再 deploy

### CloudFront → ALB で 403 Forbidden (Origin Verify 検証失敗)

- FastAPI middleware が X-Origin-Verify ヘッダを正しく検証しているか確認 (U7a で実装)
- 値が一致するか手動確認:
  ```bash
  # Secret 値
  aws secretsmanager get-secret-value --secret-id yesman/prod/api/origin-verify --query SecretString --output text
  # ECS Task 環境変数 (タスク内で確認)
  aws ecs execute-command --cluster yesman-prod-cluster --task <task-id> --container api \
    --interactive --command "env | grep ORIGIN_VERIFY"
  ```

### CDK deploy で「Cannot find module 'aws-cdk-lib'」

- `pnpm install` 未実行
- node_modules を削除して再インストール: `rm -rf node_modules && pnpm install`

### SSE chunk がブラウザに届かない

- CloudFront Behavior の `compress: false` を確認
- CachePolicy が `CACHING_DISABLED` か確認
- ALB Idle Timeout が 120s か確認 (`aws elbv2 describe-load-balancer-attributes`)

---

## アーキテクチャ概要への参照

- 詳細設計: [`aidlc-docs/construction/U1-infra/infrastructure-design/infrastructure-design.md`](../aidlc-docs/construction/U1-infra/infrastructure-design/infrastructure-design.md)
- NFR Design: [`aidlc-docs/construction/U1-infra/nfr-design/nfr-design.md`](../aidlc-docs/construction/U1-infra/nfr-design/nfr-design.md)
- NFR Requirements: [`aidlc-docs/construction/U1-infra/nfr-requirements/nfr-requirements.md`](../aidlc-docs/construction/U1-infra/nfr-requirements/nfr-requirements.md)
