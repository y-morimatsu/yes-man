# U2 / storage — NFR Design

**ステージ**: NFR Design (3/5)
**作成日**: 2026-05-10
**前提**: U2 NFR Requirements 承認済 (2026-05-10T13:15:00Z)

---

## 1. SQLAlchemy Engine / Connection Pool

### 1.1 Engine 設定 (asyncpg driver)

```python
# apps/api/src/infrastructure/persistence/engine.py
from sqlalchemy.ext.asyncio import create_async_engine

def make_engine(database_url: str) -> AsyncEngine:
    return create_async_engine(
        database_url,                          # postgresql+asyncpg://user:pass@host:5432/db
        pool_size=5,                           # PERF-U2-06 最小 5
        max_overflow=15,                       # 5 + 15 = max 20 connections per ECS task
        pool_timeout=10.0,                     # PERF-U2-07 pool acquire timeout 10s
        pool_pre_ping=True,                    # REL-U2-04 Aurora failover 復旧
        pool_recycle=3600,                     # 1h で再接続 (Aurora connection 1h 制限対策)
        connect_args={
            "timeout": 5.0,                    # PERF-U2-07 接続タイムアウト 5s
            "command_timeout": 30.0,           # クエリ実行タイムアウト 30s
            "server_settings": {
                "application_name": "yesman-api",
                "jit": "off",                  # 短いクエリで JIT overhead 回避
            },
        },
        echo=False,                            # 本番は SQL ログ出力なし (Performance Insights で代替)
    )
```

### 1.2 Session Factory

```python
async_session = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,                    # commit 後も object を使えるよう
)
```

## 2. SQL クエリパターン最適化

### 2.1 `decisions.list_by_user` (created_at DESC LIMIT 100)

```sql
-- index 利用: idx_decisions_user_id_created_at (user_id, created_at DESC)
SELECT * FROM decisions
WHERE user_id = $1
ORDER BY created_at DESC
LIMIT 100;
```

→ Alembic で複合インデックスを追加: `CREATE INDEX idx_decisions_user_id_created_at ON decisions (user_id, created_at DESC);`

### 2.2 `personas.list_shared` (共有プール)

```sql
-- index 利用: idx_personas_shared_pool (is_shared, is_blocked, is_deleted, usage_count DESC)
SELECT * FROM personas
WHERE is_shared = true AND is_blocked = false AND is_deleted = false
ORDER BY usage_count DESC
LIMIT 20 OFFSET $offset;
```

→ 部分インデックス推奨: `CREATE INDEX idx_personas_shared_pool ON personas (usage_count DESC) WHERE is_shared = true AND is_blocked = false AND is_deleted = false;`

### 2.3 `personas.record_usage` (atomic)

```sql
-- WAL-level atomic、並行 lost update なし
UPDATE personas
SET usage_count = usage_count + 1,
    yes_count = yes_count + $was_yes_int,
    updated_at = NOW()
WHERE id = $persona_id;
```

### 2.4 `persona_reports.insert` (重複報告防止)

UNIQUE 制約 `(persona_id, reporter_user_id)` で IntegrityError 検出 → Repository は明示的に catch して `DuplicateReportError` を発生させる。

### 2.5 `silence_logs.count_by_domain` (集計)

```sql
-- index idx_silence_logs_user_domain で高速
SELECT detected_domain, COUNT(*) as cnt
FROM silence_logs
WHERE user_id = $1
GROUP BY detected_domain;
```

→ 複合インデックス `(user_id, detected_domain)` 追加。

## 3. Alembic 設定詳細

### 3.1 `alembic.ini`
- `sqlalchemy.url` は環境変数 `DATABASE_URL` から `env.py` で読込 (ハードコード禁止、SEC-U2-02)
- `prepend_sys_path = .` でアプリ import 可能化

### 3.2 `env.py` 実装方針
```python
# Online migration (async ベース)
from sqlalchemy.ext.asyncio import async_engine_from_config
from alembic import context

async def run_migrations_online():
    connectable = async_engine_from_config(...)
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

# DATABASE_URL を環境変数から読込 (alembic.ini にハードコードしない)
```

### 3.3 `0001_initial.py` 主要構成
- 7 テーブル create (順序: profiles → preference_profiles / silence_logs / personas / user_persona_selections → decisions / persona_reports)
- 8 インデックス: PK 自動 + 上記カスタム 8 個 (decisions×2, personas×2, silence_logs×1, persona_reports×1, profiles UNIQUE×1, user_persona_selections PK×1)
- UNIQUE 制約: `persona_reports (persona_id, reporter_user_id)`

### 3.4 `0002_builtin_personas.py`
```python
def upgrade():
    op.bulk_insert(
        sa.table('profiles', ...),
        [{'user_id': '00000000-0000-0000-0000-000000000000', 'email': 'system@yesman.internal', ...}]
    )
    op.bulk_insert(
        sa.table('personas', ...),
        [
            {'id': '...01', 'owner_user_id': '...00', 'name': '慎重派', 'prompt_text': '...', 'is_builtin': True, 'is_shared': True},
            {'id': '...02', 'owner_user_id': '...00', 'name': '楽観派', ...},
            {'id': '...03', 'owner_user_id': '...00', 'name': '効率派', ...},
        ]
    )
    # ON CONFLICT DO NOTHING は Alembic op.bulk_insert に直接対応しない → text() で実装
```

## 4. デプロイ統合: 本番マイグレーション自動化

### 4.1 案 A (採用): ECS Task で 1 回 alembic 実行
```bash
# 初回 deploy 後、ECS Exec で migration 実行
aws ecs execute-command --cluster yesman-prod-cluster \
  --task <task-id> --container api \
  --interactive --command "alembic upgrade head"
```

### 4.2 案 B (将来): CDK 連携 Lambda
- CDK に CustomResource として migration Lambda を追加、deploy 毎に自動実行
- 本ハッカソンでは複雑度回避のため案 A 採用

### 4.3 案 C (補助): ECS startup script
- ECS Container の ENTRYPOINT で `alembic upgrade head` を実行してから uvicorn 起動
- 注意: 複数タスク同時起動時のレースコンディション (Alembic は advisory lock で保護されるが念のため)

## 5. Repository 実装パターン

### 5.1 SQLModel ベース実装 (Aurora / Docker PostgreSQL 共有)

```python
class SqlModelDecisionRepository:
    def __init__(self, session_factory: async_sessionmaker[AsyncSession]):
        self._sf = session_factory
    
    async def insert(self, decision: Decision) -> Decision:
        async with self._sf() as session, session.begin():
            session.add(decision)
            await session.flush()
            await session.refresh(decision)
            return decision
    
    async def list_by_user(self, user_id: UUID, limit: int = 100, ...) -> list[Decision]:
        async with self._sf() as session:
            stmt = (
                select(Decision)
                .where(Decision.user_id == user_id)
                .order_by(Decision.created_at.desc())
                .limit(limit)
            )
            result = await session.execute(stmt)
            return list(result.scalars().all())
    
    # 残メソッド省略
```

### 5.2 MOCK 実装パターン

```python
class MockStore:
    """全 MOCK Repository が共有する in-memory store"""
    def __init__(self):
        self.profiles: dict[UUID, Profile] = {}
        self.decisions: dict[UUID, Decision] = {}
        # ...

class MockDecisionRepository:
    def __init__(self, store: MockStore):
        self._store = store
    
    async def insert(self, decision: Decision) -> Decision:
        self._store.decisions[decision.id] = decision
        return decision
    
    async def list_by_user(self, user_id: UUID, limit: int = 100, ...) -> list[Decision]:
        items = [d for d in self._store.decisions.values() if d.user_id == user_id]
        items.sort(key=lambda d: d.created_at, reverse=True)
        return items[:limit]
```

## 6. Observability 詳細

### 6.1 X-Ray Subsegment
SQLAlchemy events で query 開始 / 終了に X-Ray subsegment を発行:

```python
@event.listens_for(engine.sync_engine, "before_cursor_execute")
def before_query(conn, cursor, statement, ...):
    xray_recorder.begin_subsegment("db.query")

@event.listens_for(engine.sync_engine, "after_cursor_execute")
def after_query(conn, cursor, statement, ...):
    xray_recorder.end_subsegment()
```

### 6.2 CloudWatch カスタムメトリクス
- `Yesman/Storage/QueryLatencyMs`: クエリレイテンシ (histogram)
- `Yesman/Storage/QueryErrors`: 失敗クエリ数

aws-embedded-metrics (EMF) で構造化ログ + CloudWatch カスタムメトリクスを同時出力。

## 7. 引き継ぎ

### → Infrastructure Design (次)
- U2 では新規 AWS リソースは作らない (U1 で Aurora 構築済)
- ただし Alembic の本番 migration 実行手順を Infrastructure Design に明記

### → Code Generation
- 7 SQLModel + 6 Repository × 2 実装 (SqlModel / Mock) + RepositoryFactory + Health + Alembic 2 migration
- pytest + Hypothesis + asyncpg + SQLModel 依存

## 8. 承認チェックリスト
- [x] Connection Pool / Engine 設定で PERF-U2-06/07 達成
- [x] 5 主要 SQL クエリの index + 最適化方針
- [x] Alembic 0001 + 0002 構成
- [x] 本番 migration 案 A (ECS Exec 手動) 採用
- [x] 2 種 Repository 実装パターン (SqlModel / Mock)
- [x] X-Ray + CloudWatch カスタムメトリクス
