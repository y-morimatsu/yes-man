# Application Design - クラリフィケーション質問

回答ありがとうございます。**Q1/Q4 (コンテナ採用)** と **Q6 (Aurora PostgreSQL 採用)** は要件・インフラ方針の大きな転換になるため、関連項目を確定したいです。各質問の `[Answer]:` に A/B/C... または自由記述で回答してください。

---

> **📌 Post-Approval Update Notice (2026-05-10 整合化)**
>
> 本ファイルは Q&A snapshot として作成時点 (2026-05-09) の議論内容を保持する **歴史的記録**です。
> その後 INCEPTION 完了前に「本気のサービス」方針整合化 (2026-05-10) が行われ、本ファイル内に残る「罪悪感」「ナッジ受容」「ダークパターン」「アート/風刺」「何も実現しないことを実現する」等の satire 用語は、**最新の正規ドキュメント** ([requirements.md](../requirements/requirements.md) / [personas.md](../user-stories/personas.md) / [stories.md](../user-stories/stories.md) など) では「再考」「ガイダンス受容」「断定調 UX」「意思決定支援サービス」等の中立的表現に置換されています。
> 本ファイルの記述は当時の Q&A 議論の文脈で読み取ってください。最新の正規仕様は前述リンクを参照してください。

---


## ⚠️ 影響範囲の事前共有

これらの回答は以下にも反映が必要です（Application Design 完了後にまとめて反映します）：

- `requirements.md` Section 5 (AWS サービス構成: Lambda+DynamoDB → コンテナ+Aurora)
- `requirements.md` FR-HIST-04 (DynamoDB / MOCK / DynamoDB Local → Aurora / MOCK / ローカル PostgreSQL)
- `execution-plan.md` Section 1.4 / Section 8 (DynamoDB 前提の記述)
- `requirements.md` 受け入れ基準 #10 (永続化バックエンド表記)

---

## ⚠️ 確認 1: コンテナサービスの選択

Q1/Q4 で「Lambda でなくコンテナにする」と回答いただきました。AWS 上のコンテナ実行環境を確定したいです。

### Clarification Question 1
コンテナ実行プラットフォームは？

A) **AWS App Runner** — 最小構成、HTTPS エンドポイント自動、コンテナイメージから即デプロイ。ハッカソン向きの最も軽い選択
B) **ECS Fargate** — タスク定義の柔軟性、スケーリング設定可能、本番想定の標準
C) **ECS Fargate + Application Load Balancer (ALB)** — 複数サービス、パスベースルーティング
D) **EKS Fargate** — Kubernetes ベース（学習コスト高、ハッカソンでは過剰の可能性）
X) Other (please describe after [Answer]: tag below)

[Answer]: B


---

## ⚠️ 確認 2: コンテナバックエンドの言語・フレームワーク

Q1 をコンテナ前提で再確定したいです。

### Clarification Question 2
コンテナ内の API バックエンドの言語・フレームワークは？

A) **Python + FastAPI** — LiteLLM・LLM SDK と親和性高、OpenAPI 自動生成標準
B) **TypeScript + Hono / Fastify / NestJS** — フロントエンドと言語統一
C) **Python + FastAPI（API）と TypeScript（バッチ・Worker）のハイブリッド**
D) **Go + Echo / Gin** — 軽量・高速
X) Other (please describe after [Answer]: tag below)

[Answer]: A


---

## ⚠️ 確認 3: Aurora PostgreSQL の構成

Q6 で Aurora PostgreSQL を選択いただきました。コスト・運用方針を確定したいです。

### Clarification Question 3
Aurora PostgreSQL のデプロイ形態は？

A) **Aurora Serverless v2** — オートスケーリング、ハッカソン向き、最小 0.5 ACU から
B) **Aurora Provisioned (db.t4g.medium 等)** — 固定インスタンス、予測可能なコスト
C) **RDS for PostgreSQL (Aurora ではない)** — シンプル、最小コスト
X) Other (please describe after [Answer]: tag below)

[Answer]: A


---

## ⚠️ 確認 4: ローカル開発時の DB

FR-HIST-04 の「設定で MOCK / エミュレータに切替」は Aurora にも適用したいです。

### Clarification Question 4
ローカル開発・テスト時の DB は？

A) **Docker Compose の PostgreSQL コンテナ** + 同等スキーマで開発
B) **Testcontainers** — テスト時に PostgreSQL を一時起動
C) **SQLite** — 軽量、ただし PostgreSQL 機能（JSONB / FullText 等）は使えない
D) **A + B 両対応** (`docker-compose up` で常時起動 + テストでは Testcontainers)
X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## ⚠️ 確認 5: スキーマ管理・マイグレーション

Aurora を使う場合、スキーマ進化の管理方法を決めたいです。

### Clarification Question 5
DB スキーマ管理ツールは？

A) **Alembic** (Python + SQLAlchemy 系)
B) **Prisma** (Node.js / TypeScript 系)
C) **Drizzle** (TypeScript 系、軽量)
D) **Atlas** (言語非依存、宣言的スキーマ)
E) **Flyway** (SQL 直書き、言語非依存)
X) Other (please describe after [Answer]: tag below) — Q2 の言語選択と整合性のあるものを選んでください

[Answer]: A

---

## ⚠️ 確認 6: ORM / クエリレイヤー

Aurora アクセスの方法は？

### Clarification Question 6
ORM / クエリビルダーの方針は？

A) **Python の場合**: SQLAlchemy 2.x (ORM) + Pydantic
B) **Python の場合**: SQLModel (FastAPI 公式推奨、SQLAlchemy + Pydantic ラッパ)
C) **TypeScript の場合**: Prisma Client
D) **TypeScript の場合**: Drizzle ORM
E) **言語問わず**: 生 SQL + 型安全クエリビルダー (kysely / sqlc 等)
X) Other (please describe after [Answer]: tag below) — Q2/CQ5 と整合させてください

[Answer]: B

---

## ⚠️ 確認 7: 非同期 Worker (EventBridge 購読側) の実行環境

Q9 で EventBridge を選択いただきました。`DecisionConfirmed` イベントを購読する非同期処理の実行環境を確定したいです。

### Clarification Question 7
EventBridge ターゲット (Worker) は？

A) **同じコンテナ内で EventBridge → API Destinations → コンテナ HTTP エンドポイント** でハンドリング
B) **専用の Worker コンテナ** を別途デプロイし、SQS 経由でイベント購読 (EventBridge → SQS → Worker)
C) **Lambda を例外的に使う** (EventBridge → Lambda、Worker のみ Lambda にする)
D) **ECS Scheduled Task** で定期バッチ処理として実行
X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## ⚠️ 確認 8: ネットワーク構成 (VPC / DB アクセス)

Aurora は VPC 内に配置されるため、コンテナサービスとの接続方法を決めます。

### Clarification Question 8
ネットワーク構成は？

A) **新規 VPC を CDK で作成** (Public/Private サブネット、NAT Gateway 等)。コンテナ・Aurora ともに VPC 内
B) **デフォルト VPC を流用** — 構築簡略化、ハッカソン向け
C) **VPC + RDS Data API** — IAM 認証で SQL 実行、コネクションプーリング不要
X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## 完了したら

すべての `[Answer]:` を埋めたら「**完了**」「**done**」と教えてください。回答を踏まえて Application Design Plan を確定し、要件書・実行計画書への反映予定を提示してから承認プロンプトを表示します。
