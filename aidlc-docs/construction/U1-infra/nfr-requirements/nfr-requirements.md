# U1 / infra — NFR Requirements

**ユニット**: U1 / infra (AWS CDK 全体)
**フェーズ**: CONSTRUCTION - Per-Unit Loop
**ステージ**: NFR Requirements (1/4 stages for U1)
**作成日**: 2026-05-10
**前提**: Functional Design は SKIP (新規データモデル/業務ロジックなし、CDK 構成のみ)

---

## 0. ユニットスコープ

U1 は YesMan の **全 AWS リソースを CDK (TypeScript) で定義**する単一のインフラユニット。デプロイ対象は単一 AWS アカウント・単一リージョン (`ap-northeast-1` 想定)、単一環境 (`dev` → `prod` への昇格は CDK context で対応)。

### U1 が定義する AWS リソース
- **ネットワーク**: VPC (新規) / Public/Private サブネット (2 AZ) / NAT Gateway / Internet Gateway / Route Tables
- **エッジ/フロント**: CloudFront / S3 (Static) / ACM
- **認証**: Cognito User Pool / Hosted UI / App Client
- **API ランタイム**: ALB (HTTPS) / ECS Cluster / ECS Service (Fargate) / Task Definition / ECR Repository
- **データベース**: Aurora Serverless v2 Cluster (PostgreSQL) / DB Subnet Group / Security Group
- **AI/LLM**: Bedrock 利用 IAM Role + Bedrock Guardrails 設定 (本番のみ)
- **非同期**: EventBridge Bus (`yesman-bus`) / API Destinations
- **音声**: Polly + Transcribe (IAM Role)
- **シークレット**: AWS Secrets Manager (LLM API keys / DB credentials)
- **監視**: CloudWatch Log Groups / X-Ray
- **CI/CD 補助**: ECR Repository (build artifact 受け)

### U1 が定義しない範囲
- アプリケーションコード (FastAPI / React) → U2〜U7
- DB スキーマ・Alembic マイグレーション → U2 / storage
- Cognito ユーザープロビジョニング → U3 / auth
- Bedrock プロンプト設計 → U4 / decision
- 認証 PAT/Secret の値そのもの → 運用時に手動投入 (CDK には値は含めない)
- **開発/CI 環境の Docker Compose / シミュレータ構成** → U-Test (テスト基盤) / 各機能ユニット (アダプタ実装) で整備 (§8 で要件のみ明示)

### 強制制約
- U1 が定義する CDK スタックは **「開発/CI で AWS なしで完結できる」前提を壊してはならない** (§8.7 を参照)。具体的には、CDK で構築するリソース ARN/URL/ID は環境変数 or Secrets Manager 経由で必ず抽象化する

---

## 1. Performance Requirements

| ID | 要件 | 根拠 | 目標値 |
|---|---|---|---|
| **PERF-U1-01** | API レスポンス (フロントエンド処理) | NFR-PERF-01 | < 100ms (Yes/No スワイプ確定の体感) |
| **PERF-U1-02** | AI 合議提案生成 (バックエンド合計) | NFR-PERF-02 | < 5s (ローディング許容範囲) |
| **PERF-U1-03** | SSE ストリーミング初回 chunk 到達 | FR-CV-02 (派生) | < 1s (LLM 初期トークン受信) |
| **PERF-U1-04** | ALB → ECS Fargate のリクエスト処理レイテンシ | 内部目標 | < 200ms (合議呼出を除く API) |
| **PERF-U1-05** | Aurora クエリ (単純 SELECT/INSERT) | 内部目標 | < 50ms (p95) |
| **PERF-U1-06** | CloudFront キャッシュヒット時の静的アセット配信 | 内部目標 | < 200ms (アジア圏) |

### 容量目標
| ID | 要件 | 根拠 | 目標値 |
|---|---|---|---|
| **CAP-U1-01** | 同時アクティブユーザー数 | NFR-PERF-03 | 100 ユーザー (ハッカソンデモ規模) |
| **CAP-U1-02** | ピーク時 API リクエスト | 推定 | 200 req/min (1 ユーザー = 平均 2 req/min) |
| **CAP-U1-03** | 永続化レコード予測 (1 ヶ月) | 推定 | decisions 50,000 件 / personas 1,000 件 / preference_profiles 100 件 |

---

## 2. Scalability Requirements

| ID | 要件 | 根拠 | 設定値 |
|---|---|---|---|
| **SCL-U1-01** | ECS Fargate タスク数 オートスケール | NFR-AVAIL-01 | min=1, max=4, target CPU=70% / Memory=70% |
| **SCL-U1-02** | Aurora Serverless v2 ACU 範囲 | NFR-AVAIL-01 | min=0.5 ACU, max=2.0 ACU (ハッカソン規模) |
| **SCL-U1-03** | ALB 自動スケール | AWS デフォルト | ALB 標準スケール (制限不要) |
| **SCL-U1-04** | CloudFront グローバル配信 | AWS デフォルト | 無制限 (CDN) |
| **SCL-U1-05** | Cognito 同時認証 | AWS デフォルト | 標準クォータ範囲内 (デモ規模) |
| **SCL-U1-06** | EventBridge イベント配信 | AWS デフォルト | 標準クォータ (2,400 ev/sec/account) |

---

## 3. Security Requirements

### 3.1 ネットワーク分離
| ID | 要件 | 根拠 |
|---|---|---|
| **SEC-U1-01** | Aurora は **Private Subnet** に配置 (Internet 直接アクセス不可) | NFR-SEC-04 |
| **SEC-U1-02** | ECS Fargate も Private Subnet に配置、ALB のみ Public 経由 | NFR-SEC-03 |
| **SEC-U1-03** | ECS → 外部 (Bedrock / 外部 LLM / Cognito) は NAT Gateway 経由 | コスト的に共有 NAT Gateway 1 つで OK |
| **SEC-U1-04** | Security Group: Aurora は ECS Security Group からの 5432 のみ許可 | 最小権限 |
| **SEC-U1-05** | Security Group: ALB は 0.0.0.0/0 から 443 のみ許可 (HTTP は redirect) | TLS 強制 |

### 3.2 暗号化
| ID | 要件 | 根拠 |
|---|---|---|
| **SEC-U1-06** | ALB Listener は HTTPS (TLS 1.2+) のみ、ACM 証明書を AWS 発行 | NFR-SEC-04 |
| **SEC-U1-07** | Aurora 保存時暗号化: AWS KMS 管理キーで暗号化 | NFR-SEC-04 |
| **SEC-U1-08** | S3 バケット (Static) は SSE-S3 でデフォルト暗号化 | NFR-SEC-04 |
| **SEC-U1-09** | Secrets Manager: 自動ローテーション設定可能なリソースのみ (LLM API キーは手動更新 OK) | NFR-SEC-06 |

### 3.3 認証認可
| ID | 要件 | 根拠 |
|---|---|---|
| **SEC-U1-10** | Cognito User Pool: Email + Password (8 文字以上 / 大文字小文字数字混在 / オプション MFA TOTP) | NFR-SEC-02 |
| **SEC-U1-11** | ALB → ECS Listener Rule: Cognito 認証必須 (沈黙ドメインも含む全 API) | NFR-SEC-03 |
| **SEC-U1-12** | IAM Role: ECS Task Role に **Bedrock + Polly + Transcribe + Secrets Manager Read** のみ付与 (最小権限) | NFR-SEC-06 |
| **SEC-U1-13** | IAM Role: EventBridge → API Destinations は **専用 Role** を持ち、ECS Task Role と分離 | 最小権限 |

### 3.4 Guardrails
| ID | 要件 | 根拠 |
|---|---|---|
| **SEC-U1-14** | Bedrock Guardrails 設定リソースを CDK で定義 (本番のみ enable) | NFR-PRIV-04, FR-AI-06 |
| **SEC-U1-15** | Guardrails ブロック対象: 4 沈黙ドメイン (宗教/選挙/暴力/卑猥) のキーワード + topic policy | FR-DM-SILENT |

### 3.5 API レート/CORS
| ID | 要件 | 根拠 |
|---|---|---|
| **SEC-U1-16** | ALB / API Service レイヤーで Rate Limit (1 IP あたり 60 req/min) | NFR-SEC-07 |
| **SEC-U1-17** | CORS: CloudFront ドメインからのみ許可 (`Access-Control-Allow-Origin: <cf-domain>`) | NFR-SEC-07 |
| **SEC-U1-18** | CSRF: SameSite=Strict クッキー / 認証は Bearer Token | NFR-SEC-07 |

---

## 4. Availability Requirements

| ID | 要件 | 根拠 | 目標値 |
|---|---|---|---|
| **AVL-U1-01** | デモ期間中の可用性 | NFR-AVAIL-02 | ≥ 99% (うちハッカソン審査時間帯は ≥ 99.9% 努力目標) |
| **AVL-U1-02** | ECS Service Multi-AZ 配置 | NFR-AVAIL-01 | 2 AZ (ap-northeast-1a/c) に分散 |
| **AVL-U1-03** | Aurora Serverless v2 データ Multi-AZ レプリケーション (標準機能) + 単一インスタンス運用 | AWS 標準 | Serverless v2 はストレージレイヤーが Multi-AZ レプリケート (デフォルト)。Writer 単一インスタンス運用で AZ 障害時は AWS 側で自動回復。Reader インスタンスは追加コスト発生のためデモ規模では不採用 (COST-U1-03 と整合) |
| **AVL-U1-04** | ALB ヘルスチェック | 内部目標 | `/health` エンドポイント (**U2 / storage で実装** — DB 接続性確認含む。U1 は ALB Target Group の health check 設定を提供)、5 秒間隔、3 連続失敗で unhealthy |
| **AVL-U1-05** | ECS タスク異常時の自動再起動 | AWS 標準 | desired count 維持 |

> **マルチリージョン**: Out of Scope (`requirements.md` §9)

---

## 5. Cost Constraints (ハッカソン規模)

| ID | 制約 | 上限 (月額) | 備考 |
|---|---|---|---|
| **COST-U1-01** | 月額総予算 (デモ期間) | < $200 USD | 個人/組織アカウント想定 |
| **COST-U1-02** | NAT Gateway | < $35 (1 個 × 24h × 31 日) | 1 個共有 (multi-AZ NAT は不要) |
| **COST-U1-03** | Aurora Serverless v2 | < $50 | 最小 ACU=0.5 で 24h アイドル時のコスト最適化 |
| **COST-U1-04** | ECS Fargate | < $30 | 1 タスク (vCPU=0.5 / Memory=1GB) 24h 稼働想定 |
| **COST-U1-05** | Bedrock | < $40 | LiteLLM 経由でローカル LLM / CLI 系を主に使用 (Bedrock はフォールバック) |
| **COST-U1-06** | CloudFront / S3 | < $5 | 静的アセットのみ、リクエスト少 |
| **COST-U1-07** | ALB | < $20 | 24h 稼働 + 少量データ |
| **COST-U1-08** | Cognito | $0 | 月 50,000 MAU 以下無料枠内 |
| **COST-U1-09** | その他 (CloudWatch / X-Ray / EventBridge 等) | < $20 | ログ保持期間 7 日に設定 |

### コスト最適化施策
- ✅ Aurora min ACU = 0.5 (idle 時のコスト最小化)
- ✅ ECS タスクサイズ最小化 (vCPU=0.5 / Memory=1GB)
- ✅ NAT Gateway 1 個共有 (Multi-AZ NAT は採用しない)
- ✅ CloudWatch Logs 保持期間 = 7 日 (デモ後の長期保持不要)
- ✅ Bedrock は LiteLLM フォールバック用に温存 (主要はローカル LLM / CLI)
- ✅ Aurora は Reader 不採用 (Writer 単一インスタンス、データは Multi-AZ レプリケート標準)

### コスト超過防止 (実超過の阻止)
| ID | 要件 |
|---|---|
| **COST-U1-10** | **CloudWatch Billing Alarm**: AWS Budget で月額 $160 (= $200 × 80%) 超過時に SNS 通知。$200 (100%) 超過時にも別通知 |
| **COST-U1-11** | Bedrock 利用量モニタリング: CloudWatch カスタムメトリクスで Bedrock API 呼出数を記録、想定の 2 倍を超えた場合に Alarm 発火 (LLM 暴走対策) |

---

## 6. Observability Requirements

| ID | 要件 | 根拠 |
|---|---|---|
| **OBS-U1-01** | CloudWatch Log Group: ECS Task / ALB / Aurora Performance Insights / Bedrock 各 1 グループ | 標準 |
| **OBS-U1-02** | 構造化 JSON ログ (Python FastAPI → CloudWatch Logs) | 内部標準 |
| **OBS-U1-03** | X-Ray トレース有効 (ECS Task → Bedrock / Aurora / EventBridge を visible) | 内部標準 |
| **OBS-U1-04** | CloudWatch Metrics: `decision.requested` / `decision.yes` / `decision.no` / `silence.triggered` / `score.calculated` カスタムメトリクス | services.md §6 |
| **OBS-U1-05** | CloudWatch Alarm: ALB 5xx 率 > 1% で SNS 通知 | 運用 (ハッカソン中の障害検知) |
| **OBS-U1-06** | Log 保持期間 | 7 日 (コスト最適化) |

---

## 7. テスト方針 (PBT は N/A、代替戦略を採用)

NFR-TEST-01 で **Property-Based Testing 拡張**は有効。**ただし U1 は宣言的 IaC (CDK = AWS リソース定義) であり、generative testing で性質を検証するようなロジックが存在しないため、PBT は本ユニットに対しては N/A** とする。

代替として、CDK に最適な以下 3 つの検証戦略を採用する:

| ID | 要件 | カテゴリ |
|---|---|---|
| **TEST-U1-01** | CDK スナップショットテスト: 各 Stack の CloudFormation テンプレートを Jest snapshot で固定。意図しない変更を検知 | Example-based |
| **TEST-U1-02** | CDK assertions: VPC CIDR / Security Group ルール / IAM 権限 / Cognito 設定 等を `aws-cdk-lib/assertions` で検証 (Template.fromStack().hasResourceProperties()) | Assertion-based |
| **TEST-U1-03** | デプロイ前 diff チェック: PR 単位で `cdk diff` を CI で実行し、想定外の変更を阻止 | Diff-based |

**PBT 適用先**: U1 ではなく、U4 (decision: LLM レスポンス parsing) / U2 (storage: シリアライズ往復) / U7a (web-shell: スワイプ判定角度・距離) 等のロジックを持つユニットで NFR-TEST-02〜04 として実装する。

---

## 8. Backend 切替対応 — Docker / シミュレータで AWS なしで開発・テスト可能

**設計原則**: ✅ **開発者は AWS リソースを 1 つも触らずにフル機能を動作確認できる**。CI も AWS への接続なしで完結する。**FR-AUTH-05 (認証切替) / FR-HIST-04 (永続化切替) / FR-VOICE-01 (音声切替) / FR-AI-01〜03 (LLM プロバイダー切替)** の Strategy + DI を最大限活用し、本番/開発/CI の 3 環境を環境変数だけで切替える。

### 8.1 環境別バックエンド構成 (3 環境)

| 構成要素 | **本番** (`prod`、U1 が CDK で構築) | **開発** (`dev`、Docker Compose) | **CI** (`ci`、MOCK インメモリ) |
|---|---|---|---|
| **認証** | Amazon Cognito User Pool | [cognito-local](https://github.com/jagregory/cognito-local) (npm パッケージ、port 9229) | `MockAuthAdapter` (固定ユーザー自動ログイン) |
| **DB** | Aurora Serverless v2 (PostgreSQL 15+) | `postgres:16-alpine` Docker image (port 5432) | `MockProfileRepository` 等 (in-memory dict) |
| **マイグレーション** | Alembic → Aurora | Alembic → Docker PostgreSQL | スキップ (in-memory) |
| **音声 (TTS)** | Amazon Polly | ブラウザの **Web Speech API** (`SpeechSynthesisUtterance`) | `MockVoiceAdapter` (no-op) |
| **音声 (STT)** | Amazon Transcribe | ブラウザの **Web Speech API** (`SpeechRecognition`) | `MockVoiceAdapter` |
| **LLM** | Amazon Bedrock (Claude / Nova) | [Ollama](https://ollama.com) (local LLM、`http://localhost:11434`) または Codex CLI / Claude Code CLI / Gemini CLI (LiteLLM 経由) | `MockLLMAdapter` (固定レスポンス JSON) |
| **Guardrails** | Bedrock Guardrails | LLM プロンプト内自己判定のみ (Guardrails 無効) | スキップ |
| **シークレット** | AWS Secrets Manager | `.env.dev` ファイル (gitignore 済) | `.env.ci` または環境変数直書き |
| **EventBridge** | EventBridge Bus + API Destinations | **FastAPI 内同一プロセスへ直接 HTTP POST** (`http://localhost:8000/internal/events/decision-confirmed`) を採用 (本番との挙動一貫性を優先、`asyncio.create_task` 即時実行は HTTP セマンティクスを失うため不採用) | 同期処理に置換 (テストの予測可能性のため) |
| **CloudFront/S3** | CloudFront + S3 (Static) | Vite dev server (port 5173) | 静的アセット未使用 (テストのみ) |
| **ALB** | ALB + ACM HTTPS | FastAPI Uvicorn (port 8000) + Vite (port 5173) を別 port で起動。**dev 時は CORS 設定必須** (`5173 → 8000` の OPTIONS 含む) | テスト時 ASGI 直接呼び出し |
| **観測性** | CloudWatch + X-Ray | コンソール stdout (構造化 JSON) | コンソール stdout |
| **AWS リージョン依存** | ap-northeast-1 | **なし** (完全ローカル) | **なし** (完全ローカル) |
| **インターネット接続** | 必要 | LLM プロバイダーによる (Ollama ならローカル完結 / Codex CLI 等は OpenAI/Anthropic API 要) | **不要** (full mock) |

### 8.2 環境変数による切替

| 変数 | `prod` | `dev` | `ci` |
|---|---|---|---|
| `APP_ENV` | `prod` | `dev` | `ci` |
| `AUTH_BACKEND` | `cognito` | `cognito-local` | `mock` |
| `STORAGE_BACKEND` | `aurora` | `docker-postgres` | `mock` |
| `VOICE_BACKEND` | `aws` (Polly+Transcribe) | `web-speech-api` | `mock` |
| `LLM_PROVIDER` | `bedrock` (default) / `bedrock-fallback` | `ollama` / `codex-cli` / `claude-code-cli` / `gemini-cli` | `mock` |
| `LLM_FALLBACK_CHAIN` | `bedrock,openai,anthropic` | (任意) | — |
| `EVENT_BACKEND` | `eventbridge` | `inline-async` | `sync` |
| `DATABASE_URL` | (Secrets Manager 経由) | `postgresql://yesman:dev@localhost:5432/yesman` | `sqlite:///:memory:` (or in-memory dict) |
| `COGNITO_USER_POOL_ID` | (Secrets Manager 経由) | `local_test_pool` | — |

`AppConfig` (pydantic-settings) が起動時に `APP_ENV` を読み、対応する Adapter 実装を DI コンテナに注入する。

### 8.3 Docker Compose 構成 (`docker-compose.yml`)

開発開始のコマンドは **1 行のみ**:

```bash
docker-compose up -d
```

これで以下が起動する:

```yaml
# docker-compose.yml (構成イメージ、Code Generation で具体化)
services:
  postgres:
    image: postgres:16-alpine
    ports: ["5432:5432"]
    environment:
      POSTGRES_USER: yesman
      POSTGRES_PASSWORD: dev
      POSTGRES_DB: yesman
    volumes:
      - postgres-data:/var/lib/postgresql/data

  cognito-local:
    image: jagregory/cognito-local:latest
    ports: ["9229:9229"]
    volumes:
      - ./.cognito:/app/.cognito

  ollama:
    image: ollama/ollama:latest
    ports: ["11434:11434"]
    volumes:
      - ollama-data:/root/.ollama
    profiles: ["with-llm"]   # オプション (LLM_PROVIDER=ollama 時のみ起動)

volumes:
  postgres-data:
  ollama-data:
```

### 8.4 開発ワークフロー (期待値)

```bash
# 1) 一発起動 (Docker)
docker-compose up -d

# 2) DB マイグレーション
cd apps/api && alembic upgrade head

# 3) API 起動 (環境変数で dev 設定)
APP_ENV=dev uvicorn apps.api.main:app --reload --port 8000

# 4) Web 起動
cd apps/web && pnpm dev   # http://localhost:5173

# 5) テスト (CI と同等の MOCK で)
APP_ENV=ci pytest apps/api/tests
pnpm --filter web test
```

**期待される開発者体験**:
- ✅ AWS アカウント不要 (Codex/Claude/Gemini CLI 利用時はそれぞれの API キーのみ必要)
- ✅ インターネット不要 (Ollama 利用時)
- ✅ `docker-compose up` から **5 分以内** にフル機能の動作確認可能
- ✅ ホット リロード対応 (FastAPI `--reload` + Vite HMR)

### 8.5 CI 環境 (GitHub Actions / 同等)

```yaml
# .github/workflows/ci.yml (構成イメージ)
env:
  APP_ENV: ci
  AUTH_BACKEND: mock
  STORAGE_BACKEND: mock
  LLM_PROVIDER: mock
  VOICE_BACKEND: mock
  EVENT_BACKEND: sync

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      # Node 依存 (Web + CDK + monorepo root)
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile

      # Python 依存 (API)
      - uses: actions/setup-python@v5
        with: { python-version: '3.12', cache: 'pip' }
      - run: pip install -r apps/api/requirements.txt -r apps/api/requirements-dev.txt
        # poetry を採用する場合: poetry install --no-interaction --no-root

      # テスト実行
      - run: pytest apps/api/tests          # API テスト (全 mock)
      - run: pnpm --filter web test         # Web テスト
      - run: pnpm --filter infra test       # CDK snapshot test (AWS 認証不要)
```

CI は **AWS リソースに一切アクセスしない**。CDK の snapshot test は `cdk synth` のみで動作し、デプロイは行わない。Python 依存と Node 依存の両方をインストールする (monorepo に両言語混在のため)。

### 8.6 NFR-DEV-* (開発環境 NFR)

| ID | 要件 | 目標値 |
|---|---|---|
| **NFR-DEV-01** | `docker-compose up` から API 起動完了までの時間 | < 60 秒 (初回 Ollama モデル DL を除く) |
| **NFR-DEV-02** | 開発環境のメモリ使用量 (PostgreSQL + cognito-local + Ollama を除く) | < 1GB (API + Web 開発サーバー合計) |
| **NFR-DEV-03** | 開発環境のディスク使用量 (postgres-data + ollama-data 除く) | < 500MB (node_modules + Python venv) |
| **NFR-DEV-04** | 環境変数による切替操作で、コード変更ゼロで `dev` ↔ `ci` ↔ `prod` 切替可能 | 100% (Strategy + DI 設計の検証要件) |
| **NFR-DEV-05** | E2E 自動テスト (Playwright) を **開発環境構成 (Docker Compose)** で実行可能 | ✅ (Web 側は `APP_ENV=dev` で起動した API に対して走る) |
| **NFR-DEV-06** | ホット リロード (コード変更 → ブラウザ反映までの時間) | < 3 秒 (Vite HMR) / < 2 秒 (FastAPI --reload) |

### 8.7 U1 (CDK) との関係

U1 (本ユニット) は **本番環境のみ** を CDK で構築する。開発/CI 環境は以下で別途整備:
- **U-Test** で Docker Compose / Playwright / pytest 構成を整備
- **U7c (api-client)** + **U2 (storage)** の Strategy + DI で実装切替を実現
- **U3 (auth)** で `cognito-local` 連携の AuthAdapter 実装を提供

U1 は CDK スタックの中で、本番リソースのみを定義する (Docker Compose YAML やシミュレータ設定は U1 のスコープ外)。**ただし、本 NFR Requirements は U1 の構築方針が「開発/CI で AWS なしで完結できる前提を壊さない」ことを保証する。**

具体的には U1 で以下を守る:
- ❌ **NG**: CDK で構築するリソースが **環境変数を介さず直接参照される** ような結合 (例: アプリコード内に `arn:aws:cognito:...` をハードコード)
- ✅ **OK**: すべての AWS リソース ARN/URL/ID は Secrets Manager または環境変数経由で抽象化され、ローカル値で差替え可能

---

## 9. Construction フェーズ次ステージへの引き継ぎ

### → NFR Design (次ステージ)
- 各 NFR を AWS リソース設計パターンに落とし込む:
  - PERF: Aurora Serverless v2 ACU 動的調整 / ECS Service auto-scaling policy
  - SEC: KMS 鍵管理 / Secrets Manager rotation / Cognito advanced security
  - AVL: Health check 仕様 / ALB target group config
  - COST: Aurora pause/resume 不要 (Serverless v2 は対応せず)、CloudWatch alarm でコスト超過検知

### → Infrastructure Design (次々ステージ)
- 各 NFR/設計をベースに CDK Stack 構造を決定:
  - `NetworkStack` (VPC, Subnet, NAT)
  - `DataStack` (Aurora, Secrets Manager)
  - `AuthStack` (Cognito)
  - `EdgeStack` (CloudFront, S3)
  - `ApiStack` (ECR, ECS Cluster/Service, ALB, EventBridge)
  - `AiStack` (Bedrock Guardrails, IAM for Polly/Transcribe)
  - `MonitoringStack` (CloudWatch, X-Ray)

### → Code Generation (最終ステージ)
- CDK TypeScript コード生成 (`infra/lib/*.ts`)
- `cdk.json` / `package.json` / Jest snapshot test
- README に `cdk deploy` 手順 + 環境変数説明

---

## 10. Open Issues (Construction 後続で確定)

| Item | Resolution |
|---|---|
| **CloudFront Custom Domain** | 任意 (ハッカソンは `*.cloudfront.net` で可)。ACM 証明書要件: us-east-1 |
| **ALB Custom Domain** | 任意 (ハッカソンは `*.elb.amazonaws.com` で可)。Custom Domain にする場合 ACM 必要 (ap-northeast-1) |
| **Aurora バックアップ保持期間** | 1 日 (デモ規模) で十分 |
| **VPC CIDR** | `10.0.0.0/16` を仮置き (NFR Design で確定) |
| **AZ 構成** | `ap-northeast-1a` + `ap-northeast-1c` を仮置き |
| **Cognito Hosted UI Custom Domain** | デフォルト Cognito ドメインで OK |
| **ECR Image Pull 設定** | ECS タスク起動時の ECR pull 頻度・タグ更新ポリシー (`latest` vs immutable digest) は NFR Design で確定。タスク起動レイテンシ (≤ 30 秒目標) に影響 |
| **CloudFront/ALB Origin Connection** | dev 時の OriginShield 不要、本番時の有無は NFR Design で判断 |

---

## 11. 承認チェックリスト

- [x] U1 のスコープが明確に定義されている
- [x] Performance / Scalability / Security / Availability / Cost / Observability すべてに目標値あり
- [x] `requirements.md` の NFR-* ID と相互参照
- [x] PBT (Security Baseline + Property-Based Testing 拡張) に整合
- [x] FR-AUTH-05 / FR-HIST-04 / FR-VOICE-01 の Backend 切替方針に整合
- [x] **開発時は Docker / シミュレータで AWS なしに動作可能 (§8.1〜8.7、NFR-DEV-01〜06)**
- [x] **CI は AWS リソースに一切アクセスせず完結 (§8.5)**
- [x] **環境変数だけで `prod` ↔ `dev` ↔ `ci` 切替可能 (§8.2、NFR-DEV-04)**
- [x] 次ステージ (NFR Design) への引き継ぎ事項を明示
