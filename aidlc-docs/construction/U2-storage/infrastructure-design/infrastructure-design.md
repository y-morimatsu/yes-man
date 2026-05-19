# U2 / storage — Infrastructure Design

**ステージ**: Infrastructure Design (4/5)
**作成日**: 2026-05-10
**前提**: U2 NFR Design 承認済 (2026-05-10T13:30:00Z)

---

## 0. ユニットスコープ

U2 / storage は **アプリケーション層 (Python / FastAPI)** であり、新規 AWS リソースは作成しない。U1 / infra で構築済の Aurora Serverless v2 + Secrets Manager + KMS を使用する。

本ドキュメントは「**apps/api/ ディレクトリ構造 + 実装ファイル一覧 + 本番デプロイ補助手順**」を定義する。

## 1. apps/api/ ディレクトリ構造 (U2 担当範囲)

```
apps/api/                                  # FastAPI アプリ (U2-U7 共通ルート)
├── pyproject.toml                         # Python パッケージ定義、依存
├── alembic.ini                            # Alembic 設定
├── alembic/                               # マイグレーション
│   ├── env.py                             # async migration runner
│   ├── script.py.mako
│   └── versions/
│       ├── 0001_initial.py                # 7 テーブル + index + UNIQUE
│       └── 0002_builtin_personas.py       # seed 3 builtin personas + system user
├── src/
│   ├── __init__.py
│   ├── domain/                            # Domain layer (純粋ロジック)
│   │   └── persistence/
│   │       ├── __init__.py
│   │       └── models.py                  # 7 SQLModel テーブル (Profile / Decision / ...)
│   ├── application/                       # Application layer (use case)
│   │   └── persistence/
│   │       ├── __init__.py
│   │       └── protocols.py               # 6 Repository Protocol + DatabaseHealth Protocol
│   ├── infrastructure/                    # Infrastructure layer (実装)
│   │   ├── persistence/
│   │   │   ├── __init__.py
│   │   │   ├── engine.py                  # SQLAlchemy AsyncEngine (NFR Design §1.1)
│   │   │   ├── factory.py                 # RepositoryFactory (FD §5.2)
│   │   │   ├── sqlmodel_repositories.py   # SqlModel*Repository (6 個)
│   │   │   ├── mock_repositories.py       # Mock*Repository + MockStore (6 個)
│   │   │   └── health.py                  # SqlModelDatabaseHealth / MockDatabaseHealth
│   │   └── config.py                      # AppConfig (pydantic-settings)
│   ├── interface/                         # Interface layer (HTTP)
│   │   ├── http/
│   │   │   └── health.py                  # GET /health エンドポイント (U2 担当)
│   │   └── deps.py                        # FastAPI Depends 統合 (RepositoryFactory)
│   └── main.py                            # FastAPI app + Depends 統合
└── tests/                                 # pytest (U-Test と一部重複、U2 内テストはここ)
    ├── conftest.py                        # fixtures (in-memory store, async pg fixture)
    ├── unit/
    │   └── persistence/
    │       └── test_mock_repositories.py  # MOCK 実装単体
    ├── integration/
    │   └── persistence/
    │       ├── test_sqlmodel_repositories.py  # Docker PostgreSQL で実 DB
    │       └── test_health.py
    ├── contract/
    │   └── test_repository_protocol.py    # MOCK と SqlModel が同一 protocol 準拠
    └── property/
        └── test_jsonb_roundtrip.py        # Hypothesis PBT (NFR-TEST-02)
```

## 2. pyproject.toml (主要依存)

```toml
[project]
name = "yesman-api"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = [
    "fastapi>=0.110",
    "uvicorn[standard]>=0.27",
    "sqlmodel>=0.0.16",
    "sqlalchemy[asyncio]>=2.0.27",
    "asyncpg>=0.29",                     # PostgreSQL async driver
    "alembic>=1.13",
    "pydantic>=2.6",
    "pydantic-settings>=2.2",
    "httpx>=0.27",                       # internal HTTP (将来用)
    "aws-xray-sdk>=2.13",
    "boto3>=1.34",                       # AWS Secrets Manager 直接 read (起動時のみ)
]

[project.optional-dependencies]
dev = [
    "pytest>=8.0",
    "pytest-asyncio>=0.23",
    "hypothesis>=6.99",                  # PBT
    "ruff>=0.3",
    "mypy>=1.9",
]

[tool.pytest.ini_options]
asyncio_mode = "auto"
```

## 3. 環境変数 (apps/api 全体、U2 部分)

| 変数 | 用途 | 例 |
|---|---|---|
| `APP_ENV` | 環境名 | prod / dev / ci |
| `STORAGE_BACKEND` | DB バックエンド | aurora / docker-postgres / mock |
| `DATABASE_URL` | DB 接続先 (asyncpg URL) | `postgresql+asyncpg://yesman:dev@localhost:5432/yesman` (dev) |
| `DATABASE_PASSWORD` | DB password (ECS では Secrets Manager 経由、ローカルは .env) | (Secrets) |
| `AURORA_HOST` | Aurora endpoint (本番のみ環境変数で渡される) | xxx.cluster-xxx.ap-northeast-1.rds.amazonaws.com |
| `AURORA_PORT` | Aurora port | 5432 |
| `AURORA_DBNAME` | Aurora database name | yesman |
| `APP_VERSION` | アプリバージョン | git short sha 等 |

### 3.1 本番での DATABASE_URL 組み立て

ECS Task は以下のロジックで `DATABASE_URL` を組み立てる (起動時、`config.py`):

```python
if env.storage_backend == "aurora":
    database_url = f"postgresql+asyncpg://{env.aurora_username}:{quote(env.database_password)}@{env.aurora_host}:{env.aurora_port}/{env.aurora_dbname}"
elif env.storage_backend == "docker-postgres":
    database_url = env.database_url  # .env で完全指定
```

## 4. 本番マイグレーション実行手順 (U1 RUNBOOK 拡張)

`apps/api/RUNBOOK.md` (新規作成、U2 範囲) に以下を記載:

```markdown
## Alembic Migration on Production (Aurora)

1. ECS タスクが起動済であることを確認
2. ECS Exec で migration を 1 回手動実行:

```bash
TASK_ID=$(aws ecs list-tasks --cluster yesman-prod-cluster --service-name yesman-prod-api \
  --query 'taskArns[0]' --output text)

aws ecs execute-command \
  --cluster yesman-prod-cluster \
  --task $TASK_ID \
  --container api \
  --interactive \
  --command "alembic upgrade head"
```

3. 完了確認:
- ログに `INFO  [alembic.runtime.migration] Running upgrade -> 0001_initial` が出ること
- `0002_builtin_personas` も適用されること
- `personas` テーブルに 3 件 (慎重派/楽観派/効率派) があること:
  ```bash
  ... --command "psql -c 'SELECT name FROM personas WHERE is_builtin = true;'"
  ```
```

## 5. U2 が生成するファイル一覧 (Code Generation 対象)

| カテゴリ | ファイル数 | 主要パス |
|---|---|---|
| プロジェクト設定 | 2 | pyproject.toml / alembic.ini |
| ドメインモデル | 1 | src/domain/persistence/models.py (7 SQLModel) |
| アプリ層 Protocol | 1 | src/application/persistence/protocols.py (6 Protocol + DatabaseHealth) |
| インフラ実装 | 5 | src/infrastructure/persistence/{engine, factory, sqlmodel_repositories, mock_repositories, health}.py |
| Config / Interface | 3 | src/infrastructure/config.py + src/interface/http/health.py + src/interface/deps.py |
| Main | 1 | src/main.py |
| Alembic | 4 | alembic/env.py + script.py.mako + versions/0001_initial.py + 0002_builtin_personas.py |
| テスト | 6 | tests/conftest.py + tests/{unit,integration,contract,property}/persistence/test_*.py × 5 |
| ドキュメント | 1 | apps/api/RUNBOOK.md |
| **合計** | **24** | |

## 6. 引き継ぎ

### → Code Generation
- 上記 24 ファイルを Phase A (設定) → B (Domain+Protocol) → C (Infrastructure 実装) → D (Interface+Main) → E (Alembic) → F (Tests) → G (Docs) の順で生成
- 各 SqlModel*Repository は Protocol を 100% 実装、MOCK 実装も同様

### → U3 / auth, U4 / decision, U5 / learning
- U2 提供の Repository Protocol + RepositoryFactory + Health を DI で使う
- それぞれの Service 層で複数 Repository を組み合わせる
- 認証 middleware は U3 で実装、Repository 層からは `user_id: UUID` を受け取る (FR-CV-11 担保)

## 7. 承認チェックリスト
- [x] apps/api/ ディレクトリ構造 (U2 担当範囲) 確定
- [x] 主要依存ライブラリ確定 (SQLModel / asyncpg / Alembic / Hypothesis)
- [x] 環境変数仕様確定 + 本番 DATABASE_URL 組み立てロジック
- [x] 本番マイグレーション手順 (ECS Exec) 確定
- [x] 24 ファイルの生成計画 (Code Generation 入力)

---

## Post-CONSTRUCTION 改修注記 (2026-05-19)

本ドキュメント本体は 2026-05-10 承認時の Snapshot (light review approved) を保持。

**apps/api/ ディレクトリ構造 (DDD 4-layer) + pyproject 依存 + 24 ファイル生成計画は全て継続有効**。

### 軽微な infra-level 変更
- **`infrastructure/config.py`** (`2b08a75`): CORSMiddleware の `allow_methods` に `PUT` を追加 (既存の GET/POST/PATCH/DELETE/OPTIONS に加え 6 method 許可)
- **`infrastructure/persistence/mock_repositories.py`** (`2b08a75`): `MOCK_SEED_DEMO_DECISIONS=true` 環境変数で 30日 / 105 decisions の demo seed 機能を追加 (in-memory only、prod path には影響なし)
- **CDK 側 (U1-infra) には変更なし**: Aurora / DataStack / SecretsManager 等の AWS リソースは不変

→ U2 Infrastructure Design は基本構成不変、env-driven の Mock seed と CORS allow_methods 拡張のみ。
