# U2 / storage — NFR Requirements

**ユニット**: U2 / storage
**ステージ**: NFR Requirements (2/5)
**作成日**: 2026-05-10
**前提**: U2 Functional Design 承認済 (2026-05-10T13:00:00Z)

---

## 1. Performance

| ID | 要件 | 目標値 | 根拠 |
|---|---|---|---|
| **PERF-U2-01** | 単純 SELECT (PK 指定) | p95 < 20ms | U1 NFR Req PERF-U1-05 (Aurora p95 < 50ms) の内訳 |
| **PERF-U2-02** | 単純 INSERT/UPDATE | p95 < 30ms | 同上 |
| **PERF-U2-03** | `decisions.list_by_user` (limit 100) | p95 < 100ms | history 画面の要求 |
| **PERF-U2-04** | `personas.list_shared` (page_size 20) | p95 < 150ms | 共有プール検索 |
| **PERF-U2-05** | `/health` ping | < 50ms (DB pool から SELECT 1) | ALB HC interval 5s 内に確実に応答 |
| **PERF-U2-06** | Connection pool: 最小 5 / 最大 20 connections per ECS task | — | 2 タスク × 20 = 40 connections、Aurora 2 ACU の max_connections (約 200) 内 |
| **PERF-U2-07** | Connection timeout / pool acquire timeout | 5s / 10s | health check の 3s timeout より長く、cascading failure 回避 |

## 2. Scalability

| ID | 要件 | 目標値 |
|---|---|---|
| **SCL-U2-01** | 同時 100 ユーザー時の DB 負荷 | Aurora ACU < 1.5 (Max 2.0 ACU の 75%) で運用 |
| **SCL-U2-02** | Decision 50,000 件で list_by_user (created_at DESC LIMIT 100) | index で < 100ms |
| **SCL-U2-03** | Persona 共有プール 1,000 件で list_shared | 複合 index で < 150ms |

## 3. Security

| ID | 要件 | 根拠 |
|---|---|---|
| **SEC-U2-01** | DB credentials は Secrets Manager から ECS Task 環境変数経由のみ取得、ハードコード禁止 | U1 NFR Req SEC-U1-09 |
| **SEC-U2-02** | DATABASE_URL に直接 password を含めない (username/host のみ環境変数、password は secrets) | best practice |
| **SEC-U2-03** | SQL Injection 対策: 全クエリは SQLModel/SQLAlchemy のパラメータバインディング経由、raw SQL 禁止 | OWASP A03 |
| **SEC-U2-04** | `silence_logs.user_input` は永続化禁止 (hash のみ) | NFR-PRIV-04 |
| **SEC-U2-05** | `decisions.user_input` は PII フィルタ後の text を受け取る (U4 担当) | NFR-SEC-05 |
| **SEC-U2-06** | Repository 層は user_id を必ず引数で受け取り、cross-user データアクセスを構造的に防ぐ | FR-CV-11 (本人のみ閲覧) |

## 4. Reliability

| ID | 要件 |
|---|---|
| **REL-U2-01** | DB 接続失敗時のリトライ: 接続プール再取得 3 回、各 1s sleep |
| **REL-U2-02** | トランザクション境界: Repository method 1 つ = 1 トランザクション原則。Service 層が複数 Repository をまたぐ場合は明示的に `async with session.begin()` |
| **REL-U2-03** | `/health` の DB 接続失敗時に 503 を返し、ALB が unhealthy 判定 → 自動再起動 |
| **REL-U2-04** | Aurora フェイルオーバー時の挙動: SQLAlchemy connection pool が新接続を取得、アプリ側で 5 秒以内に復旧 |

## 5. Backend Swap (NFR-EXT-05)

| ID | 要件 |
|---|---|
| **SWAP-U2-01** | `STORAGE_BACKEND=aurora|docker-postgres|mock` で実装切替、コード変更ゼロ |
| **SWAP-U2-02** | MOCK 実装は in-memory dict、process 内のみ。テスト終了で破棄 |
| **SWAP-U2-03** | Docker PostgreSQL 実装 = Aurora 実装と同一コード、`DATABASE_URL` のみで切替 |
| **SWAP-U2-04** | MOCK / SQLModel 双方で Repository Protocol 準拠コントラクトテスト pass |

## 6. PBT (NFR-TEST-02 適用)

| ID | 要件 |
|---|---|
| **TEST-U2-01** | PreferenceProfile JSONB シリアライズ・デシリアライズ roundtrip property: ∀ profile, deserialize(serialize(profile)) == profile |
| **TEST-U2-02** | Decision JSONB roundtrip: persona_outputs / selected_persona_ids の Unicode + 空dict を含むケース |
| **TEST-U2-03** | UserPersonaSelection.persona_ids の長さ ≤ 3 invariant (アプリ層検証の property test) |
| **TEST-U2-04** | personas.record_usage を N 回呼んだ後、yes_acceptance_rate = yes_count / usage_count の不変条件 |

## 7. Migration Safety

| ID | 要件 |
|---|---|
| **MIG-U2-01** | Alembic migration は順序実行のみ (downgrade はサポートしない、デモ規模) |
| **MIG-U2-02** | `0001_initial` 実行後、`0002_builtin_personas` で seed (冪等性確保) |
| **MIG-U2-03** | 本番 deploy 時は ECS タスク内で `alembic upgrade head` を 1 回手動実行 (CDK Lambda 自動化は将来検討) |
| **MIG-U2-04** | dev / ci 環境はテスト前に `alembic upgrade head` (Docker PostgreSQL のみ、MOCK は migration 不要) |

## 8. Observability

| ID | 要件 |
|---|---|
| **OBS-U2-01** | Slow query log: Aurora Performance Insights で発見可能 (Aurora 側設定、U1 で有効化済) |
| **OBS-U2-02** | Repository methods は CloudWatch カスタムメトリクスを発行: `db.query.count`, `db.query.latency.ms` (X-Ray subsegment) |
| **OBS-U2-03** | 失敗クエリ (例外発生) は構造化 JSON で stdout に出力、CloudWatch Logs で検索可能 |

## 9. 引き継ぎ

### → NFR Design
- Connection pool size (5-20) の確定値 (NFR-PERF-02 と整合)
- SQL クエリパターンの最適化 (`/decisions/{id}/discussion` の JSONB read 高速化)
- Alembic migration の本番デプロイ自動化方針

### → Code Generation
- SQLModel / Pydantic / asyncpg / Alembic 依存関係
- pytest + Hypothesis テスト framework
- `apps/api/` ディレクトリ構造

## 10. 承認チェックリスト

- [x] Performance / Scalability / Security / Reliability / Backend Swap / PBT / Migration / Observability 全カテゴリで NFR ID 定義
- [x] U1 NFR (PERF-U1-05, SEC-U1-09, NFR-PRIV-04, NFR-TEST-02 等) と相互参照
- [x] FR-CV-11 (本人のみ閲覧) の構造的担保 (SEC-U2-06)
- [x] Strategy + DI / Backend Swap で NFR-DEV-04 達成
