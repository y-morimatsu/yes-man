# U1 / infra — NFR Design

**ユニット**: U1 / infra
**フェーズ**: CONSTRUCTION - Per-Unit Loop
**ステージ**: NFR Design (2/4 stages for U1)
**作成日**: 2026-05-10
**前提**: U1 NFR Requirements 承認済 (2026-05-10T09:00:00Z)

---

## 0. ドキュメントの目的

[NFR Requirements](../nfr-requirements/nfr-requirements.md) で確定した目標値・制約を、**実装可能な AWS リソース設計パターン**に落とし込む。各設計判断には NFR ID を明記して traceability を確保する。

本書は CDK スタック構造の決定 (Infrastructure Design) の前段として、横断的な設計パターンと判断基準を提供する。

---

## 1. ネットワーク設計

### 1.1 VPC トポロジ

```
                    ┌──────────────────────┐
                    │   Internet Gateway   │
                    └──────────┬───────────┘
                               │
              ┌────────────────┴────────────────┐
              │                                 │
        ┌─────▼──────┐                   ┌──────▼─────┐
        │  Public    │  ◀── ALB (HTTP)──▶ │  Public    │
        │  Subnet    │  (両 AZ にまたがる) │  Subnet    │
        │  10.0.0.0  │                   │ 10.0.16.0  │
        │  /20 (a)   │                   │  /20 (c)   │
        │ NAT GW     │                   │            │
        └─────┬──────┘                   └──────┬─────┘
              │                                 │
        ┌─────▼──────┐                   ┌──────▼─────┐
        │ Private    │                   │ Private    │
        │ Subnet     │  ◀── ECS Tasks ──▶│ Subnet     │
        │ 10.0.32.0  │    (Multi-AZ)     │ 10.0.48.0  │
        │ /20 (a)    │                   │ /20 (c)    │
        │  ECS / DB  │                   │  ECS / DB  │
        └─────┬──────┘                   └──────┬─────┘
              │  Aurora (Writer 1 つ、データは Multi-AZ レプリケート) │
              └─────────────────────────────────┘
```

> **ALB のサブネット配置**: ALB は **Public Subnet a (10.0.0.0/20) + Public Subnet c (10.0.16.0/20) の両方にまたがって配置** (Multi-AZ 標準構成、AVL-U1-02)。CloudFront から HTTP (80) で受け取り、ECS にルーティング。

### 1.2 設計判断 (NFR ↔ 設計)

| 設計判断 | NFR 参照 | 根拠 |
|---|---|---|
| **VPC CIDR**: `10.0.0.0/16` (65,536 IP) | Open Issues 解決 | 単一 AWS アカウント・単一環境のためフラットな /16 で十分。子サブネットを /20 (4,096 IP each) で 4 つ確保 |
| **2 AZ 構成** (`ap-northeast-1a` + `ap-northeast-1c`) | AVL-U1-02, SEC-U1-01 | 東京リージョン主要 AZ。3 AZ は冗長過多 (コスト・運用複雑度増)、2 AZ で 99.9% 程度の可用性に到達 |
| **Public Subnet × 2**: `10.0.0.0/20` + `10.0.16.0/20` | SEC-U1-05 | ALB と NAT Gateway を配置。Internet からの 443 のみ許可 |
| **Private Subnet × 2**: `10.0.32.0/20` + `10.0.48.0/20` | SEC-U1-01, SEC-U1-02 | ECS Fargate Task と Aurora を配置。Internet からの直接アクセス不可 |
| **NAT Gateway × 1** (Public Subnet a に配置) | COST-U1-02 | コスト優先で 1 個共有。Multi-AZ NAT は不採用 (AZ-a 障害時は手動再起動で許容、デモ品質目標 99%) |
| **Internet Gateway × 1** | AWS 標準 | VPC 標準構成 |
| **Route Tables**: Public 2 / Private 2 (NAT Gateway 経由) | AWS 標準 | 標準パターン |

### 1.3 Security Group 設計

| SG 名 | Inbound | Outbound | 適用先 | NFR |
|---|---|---|---|---|
| `alb-sg` | **AWS-managed prefix list `com.amazonaws.global.cloudfront.origin-facing` :80** のみ (CloudFront 経由限定、HTTPS は CloudFront で終端) | All | ALB | SEC-U1-05, SEC-U1-06 (§5.2 と整合) |
| `ecs-sg` | `alb-sg` :8000 (FastAPI ポート) | All (NAT 経由で外部 API) | ECS Fargate Task | SEC-U1-02 |
| `aurora-sg` | `ecs-sg` :5432 (PostgreSQL のみ) | (Outbound none、デフォルトで十分) | Aurora Serverless v2 Cluster | SEC-U1-04 |

最小権限の原則: ECS → Aurora、ALB → ECS のみ許可。Aurora から外部接続は不要 (DBA 用は Bastion 不要、CDK でクエリ実行用は AWS Secrets Manager + AWS CLI 等で別途)。

---

## 2. ECS Fargate / オートスケール設計

### 2.1 Task Definition

| 項目 | 値 | NFR |
|---|---|---|
| **CPU** | 512 (.5 vCPU) | COST-U1-04, NFR-PERF-02 |
| **Memory** | 1024 MB (1 GB) | COST-U1-04 |
| **Networking** | awsvpc mode (Fargate デフォルト) | SEC-U1-02 |
| **Container Image** | ECR から pull (タグは immutable digest) | Open Issues R8 解決 |
| **Logging** | awslogs driver → CloudWatch Logs (retention 7 日) | OBS-U1-01, OBS-U1-06 |
| **X-Ray Sidecar** | 同梱 (FastAPI に aws-xray-sdk 統合) | OBS-U1-03 |
| **Health Check (Container)** | `curl -f http://localhost:8000/health \|\| exit 1` (interval 30s, retries 3) | AVL-U1-04 |

### 2.2 ECR Image Pull 設定 (Open Issues R8 解決)

- **タグ戦略**: `latest` 不採用。**Immutable digest** (`sha256:...`) を CDK パラメータ経由で参照
- **理由**: タスク再起動時に意図しないイメージ更新を防ぐ。デプロイは CDK 経由で digest を明示変更
- **Pull スループット**: ECR は VPC エンドポイント (Interface Endpoint) 経由で pull することで NAT Gateway コストを節約 (Option、コスト分析で判断)
  - Interface Endpoint: $0.01/hour × 24h × 31 = $7.4/月 × 2 endpoint = $14.8/月
  - NAT Gateway 経由 pull: 1 イメージ pull = ~200MB × $0.045/GB = $0.009 × 100 pull = $0.9/月
  - → デモ規模では NAT 経由で十分 (cost 差は小さい)、Interface Endpoint は不採用

### 2.3 ECS Service Auto-Scaling

| 設定項目 | 値 | NFR |
|---|---|---|
| `desiredCount` | 2 (初期値、Multi-AZ 配置) | AVL-U1-02 |
| `minimumCapacity` | 1 (idle 時) | SCL-U1-01 |
| `maximumCapacity` | 4 (ピーク時) | SCL-U1-01 |
| **Scale-Out** Target Tracking | CPU 70% / Memory 70% | SCL-U1-01 |
| **Scale-Out cooldown** | 60 秒 | 標準 |
| **Scale-In cooldown** | 300 秒 (5 分) | スパイク後すぐに減らさない |
| **Capacity Provider** | FARGATE (FARGATE_SPOT は不採用、デモ安定性優先) | AVL |

> **トレードオフ注記 (AVL-U1-02 ↔ min=1)**: `minimumCapacity=1` はコスト優先の選択であり、scale-in で 1 タスクに減った時間帯は単一 AZ 露出となる。**Multi-AZ レジリエンスは desiredCount ≥ 2 (通常運用 + auto-scale 後) で発動**。デモ規模では idle 時間帯の単一 AZ 露出は許容 (AVL-U1-01 目標 99% を満たすに十分)。本番化検討時は min=2 への引き上げを推奨。

### 2.4 タスク起動レイテンシ (≤ 30 秒目標)

| 要素 | 推定時間 |
|---|---|
| ECS スケジューラ起動 | ~5 秒 |
| ENI アタッチ | ~10 秒 |
| ECR Image Pull (200MB) | ~10 秒 |
| Container 起動 + FastAPI 起動 | ~5 秒 |
| **合計** | **~30 秒** ✅ |

---

## 3. Aurora Serverless v2 設計

### 3.1 Cluster 設定

| 項目 | 値 | NFR |
|---|---|---|
| **Engine** | Aurora PostgreSQL 15.4 | application-design.md §1.1 |
| **Cluster Mode** | Aurora Serverless v2 (`instance class: db.serverless`、provisioned cluster engine 上で動作する serverless インスタンス) | NFR-AVAIL-01 |
| **Min ACU** | 0.5 | COST-U1-03, SCL-U1-02 |
| **Max ACU** | 2.0 | SCL-U1-02 |
| **Storage Encryption** | AWS KMS Customer Managed Key (CMK) | SEC-U1-07 |
| **Multi-AZ Data Replication** | デフォルト (ストレージレイヤー Multi-AZ) | AVL-U1-03 |
| **Writer Instance Count** | 1 (Single instance) | COST-U1-03 |
| **Reader Instance Count** | 0 (Reader 不採用) | COST-U1-03 |
| **Backup Retention** | 1 日 | Open Issues 解決 |
| **Performance Insights** | 有効 (free tier、7 日保持) | OBS-U1-01 |
| **Subnet Group** | Private Subnet a + c | SEC-U1-01 |
| **Public Accessibility** | false | SEC-U1-01 |

### 3.2 KMS 鍵設計

| 鍵 | 用途 | NFR |
|---|---|---|
| `yesman-aurora-kms` | Aurora 保存時暗号化 | SEC-U1-07 |
| `yesman-secrets-kms` | Secrets Manager 暗号化 (LLM API keys 等) | SEC-U1-09 |

- **Key Policy**: AWS 標準 + ECS Task Role に Decrypt 権限
- **Key Rotation**: 自動年次ローテーション有効

### 3.3 Aurora 接続認証

- **方式 A (採用)**: Master ユーザー credentials を Secrets Manager に格納、ECS Task Role が Read 権限で取得
- **方式 B (将来検討)**: IAM database authentication (token ベース) — デモ規模では Secrets Manager の方がシンプル

```
ECS Task → Secrets Manager (GetSecretValue) → DB credentials → Aurora 接続
                                                    ↓
                                          自動ローテーション (30 日、Lambda 経由)
```

### 3.4 Aurora バックアップ

- **自動バックアップ**: 1 日保持 (デモ規模) — COST-U1-03 と整合
- **スナップショット**: 手動取得は不要 (デモ用途、消失リスクは許容)
- **Point-In-Time Recovery**: 標準 1 日

---

## 4. Cognito 設計

### 4.1 User Pool 設定

| 項目 | 値 | NFR |
|---|---|---|
| **Sign-up** | Email + Password | SEC-U1-10 |
| **Password Policy** | **8 文字以上、Upper/Lower/Number 混在** (NFR Req §SEC-U1-10 と整合)。Symbol は推奨だが必須ではない | SEC-U1-10 |
| **MFA** | Optional TOTP (ユーザーが任意で有効化) | SEC-U1-10 |
| **Verification** | Email 経由 (Cognito 標準) | 標準 |
| **App Client** | 1 つ (Web 用)、Hosted UI 有効 | 標準 |
| **Token Expiry** | Access Token 60 分、Refresh Token 30 日 | 標準 |
| **Advanced Security** | Enabled (Audit Mode、デモ規模では Enforce は重い) | SEC-U1 拡張 |
| **Lambda Triggers** | (なし、デモ規模では post-sign-up でプロフィール初期化は不要) | — |

### 4.2 Hosted UI Custom Domain

- **採用**: Cognito 標準ドメイン (`yesman-prod.auth.ap-northeast-1.amazoncognito.com`)
- **不採用**: Custom Domain (デモ規模では不要、ACM 証明書追加負担を回避)

### 4.3 ALB / API → Cognito 認証統合

- **方式**: ALB Listener Rule で Cognito 認証を有効化 (`actions: authenticate-cognito`)
- これにより `/api/*` への未認証アクセスは Hosted UI へリダイレクトされる
- **例外**: `/health` は認証不要 (ALB Target Group health check 用)
- **例外**: `/internal/events/*` は EventBridge API Destinations 専用認証 (IAM Role + Bearer Token)

---

## 5. ALB 設計 (HTTPS は CloudFront で終端、ALB は HTTP only)

### 5.1 ALB 設定

| 項目 | 値 | NFR |
|---|---|---|
| **Scheme** | Internet-facing | 標準 |
| **Subnets** | Public Subnet × 2 (a, c) | AVL-U1-02 |
| **Listeners** | **80 (HTTP) のみ** (HTTPS 終端は CloudFront 側、ALB は private origin として扱う) | SEC-U1-05 と整合 |
| **Idle Timeout** | **120 秒** (デフォルト 60 秒を延長) | FR-CV-02 (SSE 長時間接続) |
| **Target Group** | ECS Service (port 8000, HTTP) | AVL-U1-04 |
| **Health Check** | `/health`, 5s interval, 3 retries (NFR-Req §AVL-U1-04 と整合) | AVL-U1-04 |
| **Stickiness** | Disabled (FastAPI はステートレス) | 標準 |
| **WAF** | Optional (デモ規模では不採用、Rate Limit は ALB Listener Rule + ECS 側で対応) | SEC-U1-16 |
| **Access Logs** | S3 へ出力 (デモ後の解析用) | OBS-U1 |

### 5.2 HTTPS 終端は CloudFront で実施 (ALB は HTTP only)

**設計判断**: ALB は CloudFront 経由のみアクセスされる **private origin** として扱い、HTTPS 終端を CloudFront で行う。これにより:

- ✅ ALB に ACM 証明書不要 (Custom Domain 不要、コスト/運用負担を回避)
- ✅ CloudFront → user 間は HTTPS (TLS 1.2+、SEC-U1-06 達成)
- ⚠️ CloudFront → ALB 間は HTTP (内部経路、要 SG 制限で保護)

**ALB Security Group の追加制限** (重要):
- ALB SG の Inbound 443 制限を解除し、**Inbound 80 を AWS-managed prefix list `com.amazonaws.global.cloudfront.origin-facing` からのみ許可** に変更
- これにより ALB 直接アクセス (任意 IP からの HTTP リクエスト) はブロックされ、CloudFront 経由のみ到達可能
- 追加の保護として CloudFront から ALB へ送信するカスタムヘッダ (例: `X-Origin-Verify: <secret-from-secrets-manager>`) をリスナールールで検証 (Defense in Depth)

**SG ルール更新後**:

| SG 名 | Inbound | 適用先 |
|---|---|---|
| `alb-sg` | **`com.amazonaws.global.cloudfront.origin-facing` prefix list :80 のみ** (HTTPS リスナーは持たない) | ALB |

### 5.3 Rate Limit 実装

NFR SEC-U1-16 で「60 req/min per IP」を要求。実装パターン:

- **Option A**: ALB Listener Rule (per-source-IP rate limiting) — WAF 必要
- **Option B**: FastAPI ミドルウェア (slowapi 等) — アプリ層、シンプル
- **Option C**: CloudFront + AWS WAF Rate-based rule — CloudFront 側

→ **採用 Option B** (FastAPI ミドルウェア): デモ規模ではアプリ層で十分、WAF コスト ($5/月 + リクエスト) を節約。実装は U4 / decision で。

---

## 6. CloudFront / S3 設計

### 6.1 アーキテクチャ

```
                  ┌──────────────────────────────────┐
                  │           CloudFront             │
                  │   Distribution (HTTPS, ACM)      │
                  └────┬───────────────────────┬─────┘
                       │                       │
              Origin 1 │              Origin 2 │
                       ▼                       ▼
              ┌────────────────┐      ┌────────────────┐
              │ S3 Bucket      │      │   ALB (HTTP)   │
              │ (Static Assets)│      │  api.*.elb...  │
              └────────────────┘      └────────────────┘
                                              │
                                         ECS Fargate
```

### 6.2 CloudFront 設定

| 項目 | 値 | NFR |
|---|---|---|
| **Distribution** | Multi-origin (S3 + ALB) | アーキテクチャ |
| **Behavior `/api/*`** | ALB origin、no-cache、HTTPS 要求、SSE 対応 (Origin Read Timeout 120s) | FR-CV-02 |
| **Behavior `/*` (default)** | S3 origin、cache 1 hour、HTTPS only | PERF-U1-06 |
| **SSL Certificate** | AWS-managed (`*.cloudfront.net`) または ACM (us-east-1) | SEC-U1-06 |
| **Price Class** | PriceClass_200 (北米 + 欧州 + アジア)、PriceClass_All は不要 | コスト |
| **Geo Restriction** | なし (デモ用) | — |
| **OAC (Origin Access Control)** | S3 へのアクセスは OAC 経由のみ (S3 Public Access 完全 Block) | SEC-U1-08 |

### 6.3 SSE (Server-Sent Events) 対応

- **CloudFront Behavior**: `/api/decisions/*/stream` に対し
  - Cache Policy: `CachingDisabled`
  - Origin Request Policy: `AllViewer` (Accept ヘッダ等を transparent に渡す)
  - Response Headers: `Cache-Control: no-cache`, `Content-Type: text/event-stream` をそのまま転送
- **Origin (ALB) Settings**: **Origin Response Timeout 60 秒** (CloudFront default 30 秒から quota 増加で 60 秒に拡張。合議推論は < 5s で初回 chunk 到達するため 60s で十分。120s への拡張は AWS Support 個別申請が必要なため不採用)
- **ALB Idle Timeout 120 秒**との関係: ALB の Idle Timeout (TCP コネクション保持時間) は 120 秒、CloudFront の Origin Response Timeout (origin からの最初のレスポンスバイト到達待ち時間) は 60 秒。両者は **異なるタイマー**で、ALB Idle Timeout は SSE chunk が継続的に流れている間は適用されない (chunk 毎にタイマーリセット)
- **Result**: SSE chunk が CloudFront でバッファリングされず、ストリーミング表示が機能する (FR-CV-01〜03 達成)

### 6.4 S3 Static Bucket

| 項目 | 値 | NFR |
|---|---|---|
| **Public Access** | Block all (OAC 経由のみ) | SEC-U1-08 |
| **Encryption** | SSE-S3 (デフォルト) | SEC-U1-08 |
| **Versioning** | Disabled (デモ規模) | コスト |
| **Lifecycle** | デモ後 30 日で削除推奨 (デモ後の手動対応) | — |
| **CORS** | CloudFront ドメインからのみ許可 | SEC-U1-17 |

---

## 7. Bedrock / Guardrails 設計

### 7.1 Bedrock IAM Role

- ECS Task Role に以下のポリシーをアタッチ:
  - `bedrock:InvokeModel` (specific model ARN 限定: Claude 3 Haiku / Nova)
  - `bedrock:InvokeModelWithResponseStream` (SSE 用)
  - `bedrock-runtime:Converse` / `ConverseStream`
  - `bedrock:ApplyGuardrail` (Guardrails 適用)
- **最小権限**: 全 Bedrock モデルへのアクセスは不可、明示モデル ARN のみ許可

### 7.2 Bedrock Guardrails 設定

| 項目 | 値 | NFR |
|---|---|---|
| **Enabled Environments** | prod のみ (dev/ci では Guardrails 無効) | §8.1 |
| **Content Filter**: Sexual | HIGH | SEC-U1-15 (卑猥) |
| **Content Filter**: Violence | HIGH | SEC-U1-15 (暴力) |
| **Content Filter**: Hate / Insults | MEDIUM | NFR-PRIV |
| **Content Filter**: Misconduct | MEDIUM | NFR-PRIV |
| **Topic Policy**: 宗教 | DENY (例: "religious advice", "which religion is right") | SEC-U1-15 |
| **Topic Policy**: 選挙・投票 | DENY (例: "who should I vote", "which candidate") | SEC-U1-15 |
| **PII Filter**: Anonymize | Email / Phone / SSN 等を AI 送信前に [REDACTED] | NFR-SEC-05 |
| **Blocked Output Messaging** | "AI ではこの種の判断はサポートしません" (沈黙演出 fallback) | FR-DM-SILENT |

---

## 8. EventBridge / 非同期処理設計

### 8.1 Bus 設定

| 項目 | 値 |
|---|---|
| **Bus 名** | `yesman-bus` |
| **Default Bus** | 不使用 (custom bus でアプリイベントを分離) |
| **Encryption** | AWS Managed Key (KMS) |

### 8.2 Event Rules

| Rule 名 | パターン | Target | NFR |
|---|---|---|---|
| `decision-confirmed-rule` | `source: yesman.decision`, `detail-type: DecisionConfirmed` | API Destination → ALB `/internal/events/decision-confirmed` | FR-LEARN-07 |

### 8.3 API Destinations 設定

- **HTTP Method**: POST
- **HTTPS Endpoint**: ALB の internal endpoint (Cognito 認証バイパス、専用 Bearer Token 認証)
- **Authentication**: Connection に `API_KEY` を Secrets Manager から取得
- **Retry Policy**: 最大 3 回、24 時間以内
- **DLQ**: SQS DLQ (デモ規模では不要、Open Issue として保留)

---

## 9. Secrets Manager 設計

| シークレット名 | 内容 | ローテーション | NFR |
|---|---|---|---|
| `yesman/db/master` | Aurora マスター credentials | 自動 30 日 (RDS 連携 Lambda) | SEC-U1-09 |
| `yesman/llm/bedrock` | (不要、IAM Role で認証) | — | — |
| `yesman/llm/openai` | OpenAI API Key | 手動 (フォールバック用) | SEC-U1-09 |
| `yesman/llm/anthropic` | Anthropic API Key | 手動 (フォールバック用) | SEC-U1-09 |
| `yesman/eventbridge/api-key` | EventBridge → API Destinations Bearer Token | 手動 | SEC-U1-09 |
| `yesman/web-tokens/cognito` | Cognito App Client Secret | 手動 | SEC-U1-10 |

---

## 10. CloudWatch / X-Ray 観測性設計

### 10.1 Log Groups (retention 7 日)

| Log Group | Source | NFR |
|---|---|---|
| `/aws/ecs/yesman-api` | ECS Task stdout/stderr | OBS-U1-01 |
| `/aws/alb/yesman` | ALB access logs (S3 経由) | OBS-U1 |
| `/aws/rds/cluster/yesman-aurora/postgresql` | Aurora general / slow query | OBS-U1 |
| `/aws/bedrock/yesman-prompts` | Bedrock invocation logs (Guardrails 適用前後) | OBS-U1 |
| `/aws/lambda/yesman-secret-rotator` | Secrets Manager rotation Lambda | — |

### 10.2 CloudWatch Custom Metrics (services.md §6 と整合)

| Metric | 単位 | 用途 |
|---|---|---|
| `decision.requested` | Count | 決定依頼数 |
| `decision.yes` | Count | Yes 採択数 |
| `decision.no` | Count | No 数 |
| `silence.triggered` | Count | 沈黙演出発動数 |
| `score.calculated` | Count | スコア計算数 |
| `consensus.latency.ms` | ms | 合議推論レイテンシ |
| `sse.chunk.count` | Count | SSE chunk 配信数 |
| `bedrock.invocation.count` | Count | Bedrock 呼出数 (COST-U1-11 トリガ) |
| `bedrock.token.input` / `output` | Count | トークン数 (コスト推定) |

### 10.3 CloudWatch Alarms

| Alarm | 条件 | アクション | NFR |
|---|---|---|---|
| `alb-5xx-rate` | 5xx 率 > 1% (5 分平均) | SNS 通知 | OBS-U1-05 |
| `ecs-cpu-high` | CPU > 85% (5 分連続) | Auto-Scaling 連動 | SCL-U1-01 |
| `aurora-cpu-high` | ACU 使用率 > 90% | SNS 通知 (ACU 上限見直し) | SCL-U1-02 |
| `bedrock-spike` | `bedrock.invocation.count` > 想定の 2 倍 | SNS 通知 (LLM 暴走対策) | COST-U1-11 |
| `monthly-budget-80` | AWS Budget $160 超過 (月額の 80%) | SNS 通知 | COST-U1-10 |
| `monthly-budget-100` | AWS Budget $200 超過 | SNS 通知 | COST-U1-10 |

### 10.4 X-Ray Tracing

- **ECS Task**: aws-xray-sdk Python に統合、FastAPI ミドルウェアで自動キャプチャ
- **トレース対象**: HTTP リクエスト / Aurora SQL / Bedrock API / EventBridge PutEvents / Secrets Manager GetSecretValue
- **サンプリング率**: 100% (デモ規模) — 本番運用化時は 10% 程度に調整

---

## 11. Strategy + DI 抽象化設計 (NFR-DEV-04 達成のための鍵)

U1 で構築する AWS リソースが、開発/CI 環境で別実装に切替えられることを保証するための抽象化パターン:

| AWS リソース | 抽象化 | 環境変数 | dev/ci 実装 |
|---|---|---|---|
| Cognito User Pool | `AuthAdapter` Protocol | `AUTH_BACKEND` | `CognitoLocalAuthAdapter` / `MockAuthAdapter` |
| Aurora PostgreSQL | `*Repository` Protocols + `DATABASE_URL` | `STORAGE_BACKEND` | `MockRepository` 群 / Docker PostgreSQL |
| Polly + Transcribe | `VoiceAdapter` Protocol | `VOICE_BACKEND` | `WebSpeechApiAdapter` (FE) / `MockVoiceAdapter` |
| Bedrock | `LLMProviderAdapter` (LiteLLM ラッパ) | `LLM_PROVIDER` | `OllamaAdapter` / `Codex/Claude/Gemini CLI` |
| EventBridge | `EventPublisher` Protocol | `EVENT_BACKEND` | `InlineHttpPostPublisher` / `SyncPublisher` |
| Secrets Manager | `SecretsProvider` Protocol | `APP_ENV` (prod は SM、その他は env) | `EnvVarSecretsProvider` |

**強制制約**: U1 (CDK) で**生成された AWS リソース ID/ARN/URL** は、すべて `Secrets Manager` か `Environment Variables` 経由でアプリに渡る。アプリコードへのハードコード禁止 (NFR Requirements §0 強制制約)。

---

## 12. Health Check 仕様 (`/health` エンドポイント)

NFR Requirements の AVL-U1-04 で「U2 で実装」と明示。U1 では以下を仕様化:

| 項目 | 値 |
|---|---|
| **Path** | `GET /health` |
| **Authentication** | 不要 (ALB Target Group + ECS health check 用) |
| **Response Body** | `{"status": "ok", "db": "ok", "version": "..."}` (JSON) |
| **HTTP Status** | DB 接続性 OK = 200、DB 接続不可 = 503 |
| **Latency Target** | < 100ms (DB connection pool から ping のみ) |
| **U1 が提供する設定** | ALB Target Group health check path = `/health`, interval = 5s, timeout = 3s, healthy threshold = 2, unhealthy threshold = 3 |

---

## 13. デプロイ戦略 (CD)

- **方式 A (採用、デモ規模)**: 開発者が `cdk deploy` を手動実行
- **方式 B (Open Issue、将来検討)**: GitHub Actions で CDK Pipeline 自動化

**手動デプロイ手順** (U7 の Code Generation で README に記載):
```bash
# 1. AWS Credentials 設定
export AWS_PROFILE=yesman-prod
aws sts get-caller-identity

# 2. ECR にイメージ push
docker build -t yesman-api apps/api/
aws ecr get-login-password ... | docker login ...
docker tag yesman-api ECR_URI:DIGEST
docker push ECR_URI:DIGEST

# 3. CDK 環境変数で digest 指定 + deploy
cd infra
pnpm install
cdk deploy --all -c imageDigest=DIGEST
```

---

## 14. Construction フェーズ次ステージへの引き継ぎ

### → Infrastructure Design (次ステージ)
- CDK Stack 構造を決定:
  - `NetworkStack`: VPC / Subnet / NAT / IGW / Route Tables / SG (3 つ)
  - `DataStack`: Aurora Cluster / DB Subnet Group / Secrets / KMS keys
  - `AuthStack`: Cognito User Pool / App Client / Hosted UI
  - `EdgeStack`: CloudFront Distribution / S3 Bucket / OAC
  - `ApiStack`: ECR Repository / ECS Cluster / ECS Service / Task Definition / ALB / EventBridge Bus / API Destinations
  - `AiStack`: Bedrock Guardrails / IAM Roles (Bedrock / Polly / Transcribe アクセス用)
  - `MonitoringStack`: CloudWatch Log Groups / Custom Metrics / Alarms / AWS Budget
- 各 Stack 間の依存と参照 (CloudFormation Output / SSM Parameter Store 経由)

### → Code Generation
- CDK TypeScript コード生成 (`infra/lib/*.ts`)
- Jest snapshot test (TEST-U1-01)
- CDK assertions test (TEST-U1-02)
- README に手動デプロイ手順 + 環境変数説明

---

## 15. Open Issues 解決状況 (NFR Req §10 からの引き継ぎ)

| 項目 | NFR Req での状況 | NFR Design での解決 |
|---|---|---|
| CloudFront Custom Domain | 任意 | **不採用** (`*.cloudfront.net` で OK、ACM 不要) |
| ALB Custom Domain | 任意 | **不採用** (CloudFront 経由なので ALB は private path 扱い) |
| Aurora バックアップ保持期間 | 仮置き | **1 日** に確定 |
| VPC CIDR | 仮置き | **10.0.0.0/16** に確定 |
| AZ 構成 | 仮置き | **`ap-northeast-1a` + `ap-northeast-1c`** に確定 |
| Cognito Hosted UI Custom Domain | 仮置き | **Cognito 標準ドメイン採用** に確定 |
| ECR Image Pull 設定 | Open | **Immutable digest 採用 + NAT 経由 (VPC Endpoint 不採用)** に確定 |
| CloudFront/ALB OriginShield | Open | **不採用** (デモ規模では不要) |

---

## 16. 承認チェックリスト

- [x] NFR Requirements の全 NFR ID (PERF / SCL / SEC / AVL / COST / OBS / TEST / DEV) に対し設計判断あり
- [x] 各設計判断が NFR ID と相互参照
- [x] ネットワーク / ECS / Aurora / Cognito / ALB / CloudFront / Bedrock / EventBridge / Secrets / CloudWatch すべて設計済
- [x] Strategy + DI 抽象化方針 (NFR-DEV-04 達成) を明示
- [x] Health Check 仕様確定 (`/health` 仕様、U2 実装担当)
- [x] Open Issues 全件解決 (NFR Req で残った 8 項目すべて確定)
- [x] 次ステージ (Infrastructure Design) への CDK Stack 構造案を提示

---

## Post-CONSTRUCTION 改修注記 (2026-05-19)

本ドキュメント本体は 2026-05-10 承認時の Snapshot (ultrathink full 6 fixes 適用済) を保持。

**Critical / Important / Improvements の合計 6 件の修正点は全て継続有効**。Post-CONSTRUCTION 期間中、ALB HTTP-only + CloudFront prefix list SG、Cognito MFA Symbol、Multi-AZ ↔ min=1 トレードオフ、CloudFront Origin Timeout 60s、Aurora Cluster Mode 表現等の NFR Design は不変。

→ U1 NFR Design は CONSTRUCTION 完了状態のまま、OPERATIONS phase の `cdk deploy --all` 実機検証時に再確認予定。
