# Application Design 計画 / Application Design Plan

**プロジェクト**: YesMan
**作成日**: 2026-05-09
**Phase**: Application Design - Part 1: Planning

> **📌 Post-Approval Update Notice (2026-05-09T05:15:00Z → 2026-05-10 更新)**
>
> 本計画書は Application Design Part 1 の Q&A スナップショットです。承認後、以下の変更が反映されています:
> - FR-PERSONA (3.11) 追加に伴い、**PersonaCatalogService / PersonaModerator** + Aurora に **3 新テーブル** が追加
> - FR-CV (3.12) 追加 (2026-05-10) に伴い、**DiscussionStreamer / DiscussionService / LiveDiscussionView / DiscussionHistoryView** + SSE エンドポイント (`/v1/decisions/request/stream` 等) が追加
> - 本気のサービスとしての方針整合化 (2026-05-10): 「罪悪感」「逆説的」等の satire 用語を「再考」「委任度」に統一
>
> 最新内容は [components.md / services.md / component-methods.md / application-design.md](../application-design/) を参照してください。本ファイルは Q&A の歴史的記録として保持されます。

---

## 0. 前提

- Requirements (`requirements.md`) 承認済 — 25 ストーリー、Security Baseline + PBT 拡張有効 (※ 計画作成時点。FR-PERSONA 追加後は 32 ストーリー)
- User Stories (`personas.md` / `stories.md`) 承認済
- Workflow Planning (`execution-plan.md`) 承認済 — Application Design 〜 Build and Test まで EXECUTE
- 推奨ユニット 7 つ (U1〜U7) は Units Generation で正式決定

---

## 1. アプリケーション設計方針への質問

以下に **`[Answer]:`** タグへ A/B/C... または自由記述で回答してください。

---

### Question 1: バックエンド構成（フレームワーク・言語）
Lambda 関数群の実装言語・フレームワークは？

A) **Python (FastAPI 系 / AWS Lambda Powertools)** — LiteLLM・LLM SDK との親和性が高い
B) **TypeScript (Node.js / Hono / NestJS)** — フロントエンドと言語統一、型共有が容易
C) **Python + TypeScript ハイブリッド** — AI/LLM 系ロジックは Python、API 雛形は TS
D) **Go (Lambda Web Adapter)** — 高速起動、低メモリ
X) Other (please describe after [Answer]: tag below)

[Answer]: Lmandaでなくコンテナにする

---

### Question 2: フロントエンド技術スタック
PWA フロントエンドの技術スタックは？

A) **React + Vite + TanStack Router + Tailwind**
B) **Next.js (App Router) + Tailwind**
C) **SvelteKit + Tailwind** — 軽量・スワイプ UX が美しい
D) **Vue 3 + Nuxt + Tailwind**
X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

### Question 3: API 様式
バックエンド API の様式は？

A) **REST (OpenAPI 仕様)** — シンプル、API Gateway 親和性高い
B) **GraphQL (AppSync or Lambda Resolver)** — クライアント主導、型安全
C) **tRPC (TS のみ可)** — エンドツーエンド型安全
D) **REST + WebSocket (合議のストリーミング表示用)** — UX に「考えている演出」を追加可能
X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

### Question 4: アーキテクチャスタイル
Lambda 関数の組織化は？

A) **Function-per-endpoint (細粒度 Lambda)** — 1 関数 = 1 エンドポイント
B) **Service-per-Lambda (機能群 Lambda)** — 1 関数 = 1 サービス、内部でルーティング
C) **Lambda Monolith (Lambdalith)** — 1 関数 = 全 API、Hono などで内部ルーティング
D) **Hybrid**: 重い処理 (合議生成) のみ独立、軽い CRUD は monolith
X) Other (please describe after [Answer]: tag below)

[Answer]: Lmandaでなくコンテナにする

---

### Question 5: バックエンド切替パターン
要件 FR-AUTH-05 / FR-HIST-04 / FR-VOICE-01 の「設定で本番↔MOCK↔エミュレータ切替」の実装パターンは？

A) **Strategy パターン + DI コンテナ** — 起動時に環境変数で実装を選択して注入
B) **Adapter パターン + 工場関数** — 軽量、DI 不要
C) **Hexagonal Architecture (Ports & Adapters)** — 全切替対象を Port として定義
X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

### Question 6: 永続化のデータモデル
DynamoDB のテーブル設計方針は？

A) **Single-Table Design** — すべてのエンティティを 1 テーブルに格納（DynamoDB のベストプラクティス、PK/SK 設計が必要）
B) **Multi-Table Design** — エンティティごとにテーブル（Profile / Decision / PreferenceProfile）
C) **Hybrid**: 主要エンティティは別テーブル、関連データは Single-Table
X) Other (please describe after [Answer]: tag below)

[Answer]: aws rds aurora(postgresql)にしたい


---

### Question 7: LLM 抽象化レイヤーの構造
LiteLLM 経由のプロバイダー切替・人格合議の構造は？

A) **LiteLLMRouter (薄いラッパ) + PromptTemplate モジュール** — 合議は完全にプロンプト内、コードは I/O のみ
B) **DecisionEngine (上位サービス) + 内部に Strategy パターン** — プロバイダー切替は Strategy、合議はテンプレ呼び出し
C) **Pipeline パターン** — 入力 → ドメイン分類 → 合議生成 → ガードレール → 出力 の各段を独立クラスに
X) Other (please describe after [Answer]: tag below)

[Answer]: B

---

### Question 8: 沈黙演出ガードの配置
沈黙演出ドメイン (宗教/選挙/暴力/卑猥) の二重ガードの配置は？

A) **第 1 段: プロンプト内の自己判定** + **第 2 段: Bedrock Guardrails (本番のみ)**
B) **第 1 段: 入力前のキーワード/分類器による事前フィルタ** + **第 2 段: プロンプト内の自己判定** + **第 3 段: Guardrails**
C) Guardrails のみ依存（最小実装）
X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

### Question 9: イベント駆動 vs 同期
非同期処理（嗜好プロファイル更新 FR-LEARN-07）の実装は？

A) **Lambda 同期内で Step Functions or 別 Lambda を invoke (asynchronous invocation)**
B) **EventBridge** で `DecisionConfirmed` イベントを発火、購読 Lambda が処理
C) **SQS** キューに enqueue、Worker Lambda が消費
D) **DynamoDB Streams** で決定履歴の更新をトリガに購読
X) Other (please describe after [Answer]: tag below)

[Answer]: B

---

### Question 10: 認証フロー
Cognito + フロントエンドの認証フローは？

A) **Cognito Hosted UI (リダイレクト型)** — 標準的、UI カスタマイズ制限あり
B) **AWS Amplify Auth (SDK 直叩き)** — フロント側でカスタム UI 実装
C) **OAuth2 PKCE フローを自前実装** (Cognito User Pool API 直接呼び出し)
X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

### Question 11: 共有モデル / 型定義
フロント・バック間の型・モデル定義の共有方針は？

A) **OpenAPI スキーマから両側のクライアント自動生成** (バック=Pydantic / フロント=TS)
B) **共有パッケージ** (`@yesman/shared-types`) を monorepo で管理
C) **手動同期** — シンプル、規模が小さい間は問題なし
X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

### Question 12: 観測性 (Observability)
ログ・メトリクス・トレースの方針は？

A) **CloudWatch Logs + Metrics + X-Ray** — AWS 標準のみ
B) **構造化ログ (JSON) + AWS Lambda Powertools (Logger/Tracer/Metrics)**
C) **OpenTelemetry** で外部 (Honeycomb / Datadog) にエクスポート可能な形に
D) ハッカソン用途のため最小限（CloudWatch Logs のみ）
X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

### Question 13: モノレポ構成
コードベースの構成は？

A) **モノレポ** (Turborepo / Nx / pnpm workspaces) — フロント + バック + IaC を 1 リポジトリ
B) **マルチリポ** — フロント / バック / IaC を別々のリポジトリ
C) **モノレポ + サブモジュール** — IaC のみ別リポジトリ
X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## 2. 実行ステップ (承認後に実行)

- [ ] `aidlc-docs/inception/application-design/components.md` を作成
  - 主要コンポーネント (フロントエンド / API Gateway / 各 Lambda / Cognito / DynamoDB / Bedrock + LiteLLM 抽象化 / Polly+Transcribe / Web Speech / Secrets Manager / CloudWatch) の責務と境界を定義
- [ ] `aidlc-docs/inception/application-design/component-methods.md` を作成
  - 各コンポーネントの主要メソッドのシグネチャ + 入出力型 (詳細ロジックは Functional Design で）
- [ ] `aidlc-docs/inception/application-design/services.md` を作成
  - サービス定義 (Auth / Decision / Learning / Voice / Storage / Notification など) と責務、オーケストレーションパターン
- [ ] `aidlc-docs/inception/application-design/component-dependency.md` を作成
  - 依存マトリクス、通信パターン、データフロー図 (Mermaid)
- [ ] `aidlc-docs/inception/application-design/application-design.md` を作成
  - 上記 4 ドキュメントを統合した俯瞰ドキュメント
- [ ] 各ドキュメント間の整合性チェック
- [ ] レビュー用サマリ提示

---

## 3. 完了したら

すべての `[Answer]:` を埋めたら「**完了**」「**done**」「**回答終わりました**」と教えてください。回答を分析し、矛盾・曖昧性があれば追加質問、なければ承認プロンプトを表示します。
