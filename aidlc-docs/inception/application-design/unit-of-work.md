# Unit of Work - YesMan ユニット定義

**プロジェクト**: YesMan
**作成日**: 2026-05-09
**Phase**: Units Generation - Part 2

ユニット定義と責務、コード組織化戦略を示す。依存関係は [unit-of-work-dependency.md](unit-of-work-dependency.md)、ストーリーマッピングは [unit-of-work-story-map.md](unit-of-work-story-map.md) を参照。

---

## 1. デプロイメント方針

| 項目 | 採用 |
|---|---|
| **API** | **モジュラー・モノリス** (単一 FastAPI コンテナ on ECS Fargate) |
| **Frontend** | **単一 PWA** (apps/web)、内部は packages/ui + packages/api-client + features/ で構成 |
| **Worker** | **同コンテナ内**で `/internal/events/*` を受ける (専用 Worker なし) |
| **Infrastructure** | 単一 CDK アプリ (TypeScript) で全リソース管理 |
| **Tests** | 横断テストユニット (E2E + PBT 集約) |

→ デプロイ単位は **3 つ**: 「API コンテナ」「Web 静的アセット」「CDK インフラ」

---

## 2. コード組織化戦略 (Greenfield / Monorepo)

### 2.1 トップレベル

```
yesman/
├── apps/
│   ├── web/               # U7a Web Shell + U7d Feature Views
│   └── api/               # U2-U6 のモジュールを内包する FastAPI コンテナ
├── packages/
│   ├── ui/                # U7b UI Library
│   ├── api-client/        # U7c OpenAPI 自動生成 TS クライアント
│   ├── shared-types/      # フロント・バック横断の型 (TS)
│   └── eslint-config/     # 共通 lint 設定
├── infra/                 # U1 AWS CDK (TypeScript)
├── tests/                 # U-Test (E2E + PBT 横断)
├── docker-compose.yml     # ローカル: PostgreSQL + cognito-local など
├── pnpm-workspace.yaml
├── turbo.json
└── README.md
```

### 2.2 `apps/api/` (FastAPI コンテナ・DDD ライク)

```
apps/api/
├── src/
│   ├── domain/                # Entity / ValueObject (横断モジュール共通)
│   ├── application/           # Service / UseCase
│   │   ├── auth/              # U3
│   │   ├── decision/          # U4
│   │   ├── learning/          # U5
│   │   ├── storage/           # U2 (Repository インターフェース)
│   │   └── voice/             # U6
│   ├── infrastructure/        # Strategy 実装
│   │   ├── auth/              # CognitoAuthAdapter / MockAuthAdapter / CognitoLocalAuthAdapter
│   │   ├── persistence/       # AuroraXxxRepository / MockXxxRepository / DockerPostgresXxxRepository
│   │   ├── llm/               # LiteLLMProviderAdapter (Bedrock/OpenAI/CLI/local)
│   │   └── voice/             # PollyTranscribeAdapter / WebSpeechApiAdapter (no-op)
│   ├── interfaces/            # FastAPI Router / Pydantic DTO
│   │   ├── routes/
│   │   │   ├── profiles.py
│   │   │   ├── decisions.py
│   │   │   ├── scores.py
│   │   │   ├── preferences.py
│   │   │   ├── voice.py
│   │   │   └── internal_events.py   # /internal/events/decision-confirmed
│   │   └── dto/
│   ├── shared/                # 共通ユーティリティ・型
│   ├── di.py                  # DI コンテナ (起動時 Adapter 選択)
│   └── main.py                # FastAPI 起動
├── alembic/                   # マイグレーション
├── tests/                     # ユニット・モジュール単体テスト (U-Test とは別)
├── pyproject.toml
└── Dockerfile
```

### 2.3 `apps/web/` (React PWA)

```
apps/web/
├── src/
│   ├── app/                   # ルートコンポーネント・ルート定義 (TanStack Router)
│   ├── features/              # U7d Feature Views
│   │   ├── auth/              # ログイン後遷移・プロフィール初期入力
│   │   ├── onboarding/        # 起動時免責 (FR-NUDGE-04)
│   │   ├── decision/          # 入力・提案表示・スワイプ
│   │   ├── score/             # 主体性スコアダッシュボード
│   │   └── preferences/       # 嗜好プロファイル閲覧・修正
│   ├── shell/                 # U7a Web Shell (レイアウト・認証ガード)
│   ├── lib/                   # ユーティリティ・hooks
│   └── main.tsx
├── public/
│   ├── manifest.webmanifest   # PWA
│   └── service-worker.ts
├── index.html
├── vite.config.ts
└── package.json
```

### 2.4 `packages/`

| Package | 内容 |
|---|---|
| **`packages/ui/`** | U7b: ボタン / カード / スワイプコンテナ / トースト など共有 UI 部品 + Tailwind デザイントークン |
| **`packages/api-client/`** | U7c: OpenAPI スキーマから `openapi-typescript` で自動生成した型 + tRPC ライクなフェッチ wrapper |
| **`packages/shared-types/`** | ドメイン型のうちフロント・バックで概念共有が必要なもの (Enum など) |

### 2.5 `infra/` (AWS CDK)

```
infra/
├── bin/
│   └── yesman.ts              # CDK アプリエントリ
├── lib/
│   ├── network-stack.ts       # VPC / Subnet / NAT / SG
│   ├── data-stack.ts          # Aurora Serverless v2 / Secrets
│   ├── compute-stack.ts       # ECS Cluster / Task / Service / ALB / ECR
│   ├── auth-stack.ts          # Cognito User Pool / App Client
│   ├── ai-stack.ts            # Bedrock Guardrails / Voice (Polly/Transcribe IAM)
│   ├── async-stack.ts         # EventBridge Bus / API Destinations
│   ├── frontend-stack.ts      # CloudFront / S3 / OAC
│   └── observability-stack.ts # CloudWatch / X-Ray
├── cdk.json
├── tsconfig.json
└── package.json
```

### 2.6 `tests/` (U-Test)

```
tests/
├── e2e/                       # Playwright E2E テスト
│   ├── journey-a-onboarding.spec.ts
│   ├── journey-b-core-loop.spec.ts
│   ├── journey-c-no-burst.spec.ts
│   ├── journey-d-silence.spec.ts
│   ├── journey-e-learning.spec.ts
│   └── playwright.config.ts
├── pbt/                       # Property-Based Tests (Python + Hypothesis)
│   ├── test_score_calculation.py     # AutonomyScorer 不変条件
│   ├── test_swipe_gesture.py         # スワイプ判定境界
│   ├── test_consensus_parser.py      # ConsensusOrchestrator parse roundtrip
│   ├── test_repository_roundtrip.py  # Repository serialize/deserialize
│   └── conftest.py
├── fixtures/                  # E2E/PBT 共通フィクスチャ
└── README.md
```

---

## 3. ユニット一覧 (確定)

命名規約 = ユニット ID + ディレクトリ名（Q10=C）

| ID | ディレクトリ | 種別 | 責務 |
|---|---|---|---|
| **U1 / `infra`** | `infra/` | CDK | 全 AWS リソース定義 (VPC / ECS / Aurora / ALB / Cognito / Bedrock / EventBridge / Secrets / CloudWatch / X-Ray / ECR / CloudFront / S3) |
| **U2 / `storage`** | `apps/api/src/{application,infrastructure}/persistence` | API モジュール | Repository インターフェース + 実装 (Aurora / MOCK / Docker PostgreSQL) + SQLModel + Alembic |
| **U3 / `auth`** | `apps/api/src/{application,infrastructure}/auth` | API モジュール | AuthAdapter + Cognito 連携 + プロフィール管理 |
| **U4 / `decision`** | `apps/api/src/{application,infrastructure}/decision` | API モジュール | DecisionEngine / ConsensusOrchestrator / SilenceGuard / NudgeMessageGenerator / LLMProviderAdapter (LiteLLM) |
| **U5 / `learning`** | `apps/api/src/{application,infrastructure}/learning` | API モジュール | PreferenceProfileBuilder / EventBridge 購読 (`/internal/events/decision-confirmed`) |
| **U6 / `voice`** | `apps/api/src/{application,infrastructure}/voice` | API モジュール | VoiceAdapter (BE) + Polly + Transcribe + Web Speech API (no-op) |
| **U-Persona / `persona`** | `apps/api/src/{application,infrastructure}/persona` | API モジュール (新規) | PersonaCatalogService + PersonaModerator + PersonaRepository + PersonaReportRepository (FR-PERSONA-01〜12) |
| **U7a / `web-shell`** | `apps/web/src/shell`, `apps/web/src/app` | Frontend | ルーティング・認証ガード・グローバルレイアウト・PWA Shell |
| **U7b / `ui`** | `packages/ui/` | TS Package | 共有 UI コンポーネント + デザイントークン (Tailwind preset) |
| **U7c / `api-client`** | `packages/api-client/` | TS Package | OpenAPI 自動生成 TS クライアント |
| **U7d / `features`** | `apps/web/src/features/` | Frontend モジュール | 機能別ビュー (auth / onboarding / decision / score / preferences) |
| **U-Test / `tests`** | `tests/` | テスト Package | E2E (Playwright) + PBT (Hypothesis) の横断テスト |

合計 **12 ユニット** (元 11 + U-Persona 1 / デプロイ単位は 3: API コンテナ / Web 静的 / CDK)。U-Persona は FR-PERSONA 追加 (2026-05-09) に伴う新ユニット。U4 Decision に組込む案もあったが、関心の分離 (合議エンジン vs カタログ管理) のため独立化。

---

## 4. ユニットごとの主担当 (Q6=C 役割分担)

| ロール | 担当ユニット |
|---|---|
| **インフラ担当** | U1 (主担当) + U2 のスキーマ・マイグレーション支援 |
| **バック担当** | U2, U3, U4, U5, U6, **U-Persona** (主担当) |
| **フロント担当** | U7a, U7b, U7c, U7d (主担当) |
| **横断 / 共同** | U-Test (フロント + バック共同) |

> **越境ポリシー**: 主担当を越えてコミット可能。PR レビューで主担当のレビューを必須とする。

---

## 5. Journey F (設定切替) の解消マッピング

Journey F は独立ユニットを設けず、以下に解消される (Q7=A 採用):

| Story | 解消先 |
|---|---|
| F1 認証切替 | **U1** (Cognito User Pool 構築) + **U3** (AuthAdapter Strategy + DI) |
| F2 永続化切替 | **U1** (Aurora Serverless v2 + RDS Local) + **U2** (Repository Strategy + DI) |
| F3 LLM 切替 | **U1** (Secrets Manager + Bedrock IAM) + **U4** (LLMProviderAdapter Strategy + DI、LiteLLM 経由) |
| F4 音声切替 | **U1** (Polly/Transcribe IAM) + **U6** (VoiceAdapter Strategy + DI) |

---

## 6. 並列開発戦略

| 段階 | 並列性 |
|---|---|
| **0 日目** | U1 (インフラ) + U7b (UI Library) + U7c (API Client 仮スタブ) を並列で立ち上げ |
| **1 日目以降** | U2 → U3, U4, U5, U6 の順序で起動可能 (U2 完了後に並列展開) |
| **U7a / U7d** | U7c (API Client) のスタブで開発可能、Mock Server (Prism 等) を利用 |
| **U-Test** | 各ユニットの API/UI が固まり次第、E2E + PBT を追加 |

---

## 7. ユニット境界の検証

- **モジュール間の依存方向は単方向** (循環なし) — `unit-of-work-dependency.md` で確認
- **共有モデルは `packages/shared-types` または `apps/api/src/domain` に集約** (重複定義なし)
- **Strategy + DI で実装差し替え可能** (本番↔MOCK↔エミュレータ)
- **すべての Story がいずれかのユニットに割り当て済み** — `unit-of-work-story-map.md` で確認
