# U2 / storage — Code Generation Plan (Part 1 of 2)

**ステージ**: Code Generation Part 1 (5/5 stages for U2)
**作成日**: 2026-05-10
**前提**: U2 Infrastructure Design 承認済 (2026-05-10T13:45:00Z)

---

## 1. 生成対象ファイル (24 files、Infra Design §5 と整合)

### Phase A: プロジェクト設定 (2)
- [ ] `apps/api/pyproject.toml`
- [ ] `apps/api/alembic.ini`

### Phase B: Domain + Application (2)
- [ ] `apps/api/src/domain/persistence/models.py` — 7 SQLModel テーブル
- [ ] `apps/api/src/application/persistence/protocols.py` — 6 Repository Protocol + DatabaseHealth + DecisionCountSummary TypedDict + custom exceptions

### Phase C: Infrastructure 実装 (5)
- [ ] `apps/api/src/infrastructure/config.py` — AppConfig (pydantic-settings)
- [ ] `apps/api/src/infrastructure/persistence/engine.py` — make_engine + session_factory
- [ ] `apps/api/src/infrastructure/persistence/factory.py` — RepositoryFactory
- [ ] `apps/api/src/infrastructure/persistence/sqlmodel_repositories.py` — 6 SqlModel*Repository + SqlModelDatabaseHealth
- [ ] `apps/api/src/infrastructure/persistence/mock_repositories.py` — MockStore + 6 Mock*Repository + MockDatabaseHealth

### Phase D: Interface + Main (3)
- [ ] `apps/api/src/interface/deps.py` — FastAPI Depends 統合 (get_factory, get_decision_repo 等)
- [ ] `apps/api/src/interface/http/health.py` — GET /health endpoint
- [ ] `apps/api/src/main.py` — FastAPI app

### Phase E: Alembic (4)
- [ ] `apps/api/alembic/env.py` — async runner with DATABASE_URL env loading
- [ ] `apps/api/alembic/script.py.mako` — テンプレ (Alembic default + 軽い custom)
- [ ] `apps/api/alembic/versions/0001_initial.py` — 7 tables + indexes + UNIQUE
- [ ] `apps/api/alembic/versions/0002_builtin_personas.py` — seed system user + 3 builtin personas

### Phase F: Tests (6)
- [ ] `apps/api/tests/conftest.py` — fixtures
- [ ] `apps/api/tests/unit/persistence/test_mock_repositories.py`
- [ ] `apps/api/tests/integration/persistence/test_sqlmodel_repositories.py`
- [ ] `apps/api/tests/integration/persistence/test_health.py`
- [ ] `apps/api/tests/contract/test_repository_protocol.py`
- [ ] `apps/api/tests/property/test_jsonb_roundtrip.py`

### Phase G: Documentation (1)
- [ ] `apps/api/RUNBOOK.md`

### 加えて (`__init__.py` 等)
- [ ] `apps/api/src/__init__.py` 〜 各層の `__init__.py` (空ファイル、5 個 ≈ 構造のため Phase A に含める)

**合計**: 24 file (主要) + 5 package marker (`__init__.py`)

## 2. 生成順序

```
Phase A: 設定 (pyproject.toml, alembic.ini, __init__.py × 5)
   ↓
Phase B: Domain Models + Protocols (models.py, protocols.py)
   ↓
Phase C: Infrastructure 実装 (engine, factory, sqlmodel_repositories, mock_repositories, health)
   ↓
Phase D: Interface + Main (deps, health endpoint, main)
   ↓
Phase E: Alembic (env, 0001, 0002)
   ↓
Phase F: Tests (conftest, unit/integration/contract/property)
   ↓
Phase G: Documentation (RUNBOOK)
```

## 3. Acceptance Criteria (Part 2 完了時)

- [ ] `pyproject.toml` で `pip install -e .[dev]` 可能
- [ ] `mypy src/` で型エラーなし
- [ ] `pytest tests/unit tests/contract` (MOCK ベース、PostgreSQL 不要) が CI で通る
- [ ] Docker PostgreSQL 起動して `alembic upgrade head` + `pytest tests/integration` が pass
- [ ] `pytest tests/property` で Hypothesis PBT が roundtrip 不変条件を検証 pass
- [ ] `apps/api/RUNBOOK.md` で Alembic 本番手順記載

## 4. 簡易レビュー方針

ユーザーから「レビュー軽く」の指示を受け、本セクションも軽量。Code Gen 各ファイル生成時の自己チェックは:
- 関数シグネチャが Protocol に整合
- SQL injection 対策 (パラメータバインディング)
- 型注釈と async/await の整合

Critical 級が発見されたら停止して報告。Improvement/Minor はそのまま反映。

---

## Post-CONSTRUCTION 改修注記 (2026-05-17 〜 2026-05-19)

本 plan 本体は 2026-05-10 承認時の Snapshot を保持。

**Phase A〜G (pyproject 1 + alembic 1 + 5 package marker / 7 SQLModel + 6 Protocol / engine/factory/sqlmodel/mock repos / interface deps + health / alembic env + 2 migration / test 6 種 / RUNBOOK) は全て継続有効**。

### Post-CONSTRUCTION で変更されたファイル
| ファイル | commit | 変更内容 |
|---|---|---|
| `apps/api/src/yesman_api/infrastructure/persistence/mock_repositories.py` | `2b08a75` | `MOCK_SEED_DEMO_DECISIONS=true` 環境変数 hook + 105 decision seed 機能 |
| `apps/api/src/yesman_api/infrastructure/config.py` | `2b08a75` | CORSMiddleware `allow_methods` += `PUT` |
| `apps/api/src/yesman_api/main.py` | `2b08a75` | Mock seed flag を起動時に評価 |

### Repository Protocol への影響なし
- `application/persistence/protocols.py` の signature 不変
- contract test (`apps/api/tests/contract/test_repository_protocol.py`) 全件 PASS

→ U2 Code Gen Plan は 24 主要ファイル構成を維持、3 ファイルへの後方互換変更のみ。
