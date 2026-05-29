# YesMan サービス設計書

> 「人間最後の仕事は、YES で承認すること。」
> 判断疲労を AI への意思決定委任で解消する、意思決定支援サービス YesMan の設計書。

AWS Summit Japan 2026 AI-DLC ハッカソン提出作品。本ディレクトリは、実装済みコードベース (`apps/`, `packages/`, `infra/`) を基に作成したサービス設計書です。

## ドキュメント構成

| # | ドキュメント | 内容 |
|---|---|---|
| 01 | [概要設計](./01-overview.md) | サービスコンセプト、主要機能、モノレポ構成、技術スタック、全体アーキテクチャ |
| 02 | [フロントエンド設計](./02-frontend-design.md) | apps/web + packages/{ui,api-client}。画面/ルーティング、状態管理、SSE合議、認証 |
| 03 | [バックエンド設計](./03-backend-design.md) | apps/api。DDD/ヘキサゴナル構成、API、合議エンジン、LLM抽象化、永続化、認証 |
| 04 | [インフラ設計](./04-infrastructure-design.md) | AWS CDK。実デプロイ構成 (CloudFront+S3+Lambda+Bedrock) と将来のフルスタック構成 |

## 2 層のアーキテクチャ観

本設計書を読む上で重要な前提として、YesMan には **2 つのアーキテクチャ層** が存在します。

1. **実デプロイ構成 (ハッカソン MVP)** — 現在 CloudFront `d28x9vimvrhs5w.cloudfront.net` で稼働。
   CloudFront + S3 + Lambda (FastAPI/Lambda Web Adapter) + Bedrock。認証・DB は mock (MockStore を S3 で永続化)。
2. **フルスタック構成 (設計上の完全版・未デプロイ)** — 7-Stack CDK (Network/Auth/Ai/Data/Api/Edge/Monitoring)。
   ECS Fargate + Aurora Serverless v2 + Cognito + EventBridge。

アプリケーションコードは **Strategy + DI** により、環境変数 (`STORAGE_BACKEND` / `AUTH_BACKEND` / `LLM_PROVIDER` / `VOICE_BACKEND` / `EVENT_BACKEND`) を切り替えるだけで、両構成・ローカル開発・テストのいずれでも動作します。この「差し替え可能性」が YesMan の設計の中核です。

## 関連資料

- [README.md](../../README.md) — プロジェクト概要
- [aidlc-docs/](../../aidlc-docs/) — AI-DLC の Inception / Construction 思考トレース
- [docs/presentation/](../presentation/) — プレゼン資料 (13 スライド)
- [docs/architecture/](../architecture/) — AWS アーキテクチャ図 (drawio)
- [infra/README.md](../../infra/README.md) / [infra/RUNBOOK.md](../../infra/RUNBOOK.md) — デプロイ手順
