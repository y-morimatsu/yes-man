# ScorePage Decision History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/score` ページに「📜 最近の Yes 採択 (最大 20 件)」セクションを追加し、各 item に質問・採用提案・相対時刻・採用回数 (`attempt_count` = 同 user_input_hash 内の試行順) を表示する。

**Architecture:** API は既存 `DecisionRepository.list_by_user` をそのまま使い、application 層 (endpoint) で `user_input_hash` group + `created_at` 順 1-indexed の `attempt_count` を計算。Web は ScorePage 配下に独立した hook + component + 2 utilities を追加。Mock seed に 20% の regenerate session を仕込んで demo で attempt_count バリエーションが見える状態にする。

**Tech Stack:** FastAPI + Python 3.12 (uv) / Pydantic v2 / React 18 + TypeScript + Tailwind / Vitest + msw / pytest-asyncio + FastAPI TestClient

**Spec:** [../specs/2026-05-22-score-decision-history-design.md](../specs/2026-05-22-score-decision-history-design.md)
**drawio:** [../specs/diagrams/2026-05-22-score-decision-history-screens.drawio](../specs/diagrams/2026-05-22-score-decision-history-screens.drawio)

**Branch:** `feature/web-score-decision-history` (develop から派生済、spec commit `ff12842` + 修正 commit `1477245` あり)

---

## File Structure

| ファイル | 種別 | 責務 |
|---------|------|------|
| `apps/api/src/yesman_api/interface/http/dto/decision.py` | 修正 | `DecisionHistoryItemDTO`, `DecisionHistoryResponse` を追記 (既存 DTO と同居) |
| `apps/api/src/yesman_api/interface/http/decisions.py` | 修正 | router に `@router.get("")` で list endpoint を追加。hash grouping を application 層で実施 |
| `apps/api/src/yesman_api/infrastructure/persistence/mock_repositories.py` | 修正 | `seed_demo_decisions` 内で 20% を regenerate session (2-5 attempts) に変更 |
| `apps/api/tests/integration/decision/test_list_decisions_endpoint.py` | 新規 | TestClient + mock auth + mock repo で endpoint を end-to-end 検証 (既存 `test_profile_lifecycle.py` パターン踏襲) |
| `apps/api/tests/unit/persistence/test_seed_regenerate_sessions.py` | 新規 | mock seed の regenerate session 生成を検証 |
| `packages/api-client/src/modules/decisions.ts` | 修正 | `DecisionsModule.history({ limit, choice })` を追加 |
| `apps/web/src/features/score/formatRelativeTime.ts` | 新規 | 相対時刻フォーマット (5 段階) |
| `apps/web/src/features/score/truncate.ts` | 新規 | surrogate pair 対応 truncate |
| `apps/web/src/features/score/useDecisionHistory.ts` | 新規 | React Query hook |
| `apps/web/src/features/score/DecisionHistoryList.tsx` | 新規 | リスト UI (loading / error / empty / data) |
| `apps/web/src/features/score/ScorePage.tsx` | 修正 | 末尾に `<DecisionHistoryList />` を挿入 |
| `apps/web/tests/features/score/formatRelativeTime.test.ts` | 新規 | 5 段階フォーマット境界値 |
| `apps/web/tests/features/score/truncate.test.ts` | 新規 | 短文 / 長文 / 絵文字 surrogate pair |
| `apps/web/tests/features/score/DecisionHistoryList.test.tsx` | 新規 | 表示・空状態・error |

---

## Pre-Flight

- [ ] **Step 0.1: ブランチと作業ディレクトリ確認**

Run:
```bash
cd /Users/morimatsu/lab/ai-dlc-hackathon && git branch --show-current && git log --oneline -3
```

Expected: `feature/web-score-decision-history` ブランチ、HEAD は `1477245 docs(specs): ScorePage history spec を ultrathink review に基づき修正` の上

- [ ] **Step 0.2: ベースライン test 確認**

Run:
```bash
cd /Users/morimatsu/lab/ai-dlc-hackathon/apps/api && uv run pytest tests/unit/decision/ -v 2>&1 | tail -15
```

Expected: 既存 unit テスト全 PASS (Task 1 の修正前なので、新規追加分は無)

Run:
```bash
pnpm -F @yesman/web test 2>&1 | tail -5
```

Expected: 既存 Web tests 全 PASS

---

## Task 1: API endpoint (DTO + hash grouping + integration test)

**Files:**
- Modify: `apps/api/src/yesman_api/interface/http/dto/decision.py` (末尾に DTO 2 件追加)
- Modify: `apps/api/src/yesman_api/interface/http/decisions.py` (末尾に endpoint 追加 + import 追加)
- Create: `apps/api/tests/integration/decision/test_list_decisions_endpoint.py`

> **Note on test location**: spec I4 で「unit + stub repo」と書いたが、実態として既存の HTTP endpoint test は `tests/integration/auth/test_profile_lifecycle.py` で TestClient を使うパターン。本 endpoint は routing + auth + hash 計算の全部を end-to-end で確認したいので integration 配置に変更。

### Step 1.1: 既存 DTO ファイルを Read して末尾を把握

Run:
```bash
tail -15 /Users/morimatsu/lab/ai-dlc-hackathon/apps/api/src/yesman_api/interface/http/dto/decision.py
```

Confirm: ファイルが `__all__ = [...]` で終わっていること

### Step 1.2: DTO 2 件を追記

Edit `apps/api/src/yesman_api/interface/http/dto/decision.py` —

`__all__ = [` ブロックの直前 (= 既存 `ScoreResponse` の下) に以下を追加:

```python
class DecisionHistoryItemDTO(BaseModel):
    """履歴 1 件の表示用 DTO (FR-HIST-01)."""

    id: str  # UUID 文字列
    user_input: str  # 質問 (生、本人にしか返さない)
    proposal_text: str  # AI 提案
    user_choice: Literal["yes", "no", "pending"]
    attempt_count: int = Field(
        ge=1,
        description="同一 user_input_hash 内での created_at 順 1-indexed (何回目の提案で採用したか)",
    )
    created_at: datetime


class DecisionHistoryResponse(BaseModel):
    items: list[DecisionHistoryItemDTO]
    limit: int
```

ファイル冒頭の import に `datetime` を追加 (Pydantic v2 用):

```python
from datetime import datetime
```

`__all__` リストの末尾に追加:

```python
    "DecisionHistoryItemDTO",
    "DecisionHistoryResponse",
```

### Step 1.3: 失敗する integration test を新規作成

Create `apps/api/tests/integration/decision/test_list_decisions_endpoint.py`:

```python
"""GET /v1/decisions — 履歴 endpoint (attempt_count + filter + limit).

Mock backend + TestClient で middleware + router + Mock Repository を統合検証。
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from yesman_api.domain.persistence.models import Decision
from yesman_api.infrastructure.auth.mock_adapter import MockAuthAdapter
from yesman_api.infrastructure.config import AppConfig
from yesman_api.infrastructure.persistence.factory import RepositoryFactory
from yesman_api.interface.http.decisions import router as decisions_router

_MOCK_SUB = UUID("11111111-1111-1111-1111-111111111111")


def _make_decision(
    *,
    user_id: UUID,
    user_input_hash: str,
    user_choice: str,
    created_at: datetime,
    user_input: str = "test input",
    proposal_text: str = "test proposal",
) -> Decision:
    return Decision(
        id=uuid4(),
        user_id=user_id,
        domain_classification="daily",
        user_input=user_input,
        user_input_hash=user_input_hash,
        proposal_text=proposal_text,
        persona_outputs={},
        user_choice=user_choice,
        no_attempt_count=0,
        llm_provider="mock",
        selected_persona_ids=[],
        created_at=created_at,
    )


@pytest.fixture
def app_with_mock(monkeypatch):
    """TestClient 用に decisions router を mock auth/repo と一緒に組む。"""
    config = AppConfig(
        app_env="dev",
        auth_backend="mock",
        storage_backend="mock",
        mock_user_sub=_MOCK_SUB,
        mock_user_email="test@example.com",
    )
    repo_factory = RepositoryFactory(config)
    adapter = MockAuthAdapter(mock_sub=_MOCK_SUB, mock_email="test@example.com")

    app = FastAPI()
    app.state.repo_factory = repo_factory
    app.state.auth_adapter = adapter
    app.state.config = config

    @app.middleware("http")
    async def auth_dispatch(request, call_next):
        auth_header = request.headers.get("authorization", "")
        if not auth_header.lower().startswith("bearer "):
            from fastapi.responses import JSONResponse
            return JSONResponse({"detail": "missing"}, status_code=401)
        user = await adapter.verify_token(auth_header[7:])
        request.state.user = user
        return await call_next(request)

    app.include_router(decisions_router)
    return app, repo_factory


def test_returns_empty_when_no_decisions(app_with_mock):
    app, _ = app_with_mock
    client = TestClient(app)
    resp = client.get("/v1/decisions", headers={"Authorization": "Bearer x"})
    assert resp.status_code == 200
    body = resp.json()
    assert body == {"items": [], "limit": 20}


def test_filter_choice_yes_only(app_with_mock):
    app, repo_factory = app_with_mock
    repo = repo_factory.mock_store
    now = datetime.now(timezone.utc)
    repo.decisions[uuid4()] = _make_decision(
        user_id=_MOCK_SUB, user_input_hash="h1",
        user_choice="yes", created_at=now - timedelta(minutes=1),
    )
    repo.decisions[uuid4()] = _make_decision(
        user_id=_MOCK_SUB, user_input_hash="h2",
        user_choice="no", created_at=now - timedelta(minutes=2),
    )
    repo.decisions[uuid4()] = _make_decision(
        user_id=_MOCK_SUB, user_input_hash="h3",
        user_choice="pending", created_at=now - timedelta(minutes=3),
    )
    client = TestClient(app)
    resp = client.get("/v1/decisions?choice=yes", headers={"Authorization": "Bearer x"})
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert len(items) == 1
    assert items[0]["user_choice"] == "yes"


def test_attempt_count_grouped_by_hash(app_with_mock):
    """同一 user_input_hash 内で created_at 順 1-indexed の attempt_count が付く。"""
    app, repo_factory = app_with_mock
    repo = repo_factory.mock_store
    now = datetime.now(timezone.utc)
    # session A: 3 attempts (2 no → yes)
    for i, choice in enumerate(["no", "no", "yes"]):
        repo.decisions[uuid4()] = _make_decision(
            user_id=_MOCK_SUB, user_input_hash="session-a",
            user_choice=choice, created_at=now - timedelta(seconds=10 - i),
        )
    # session B: single attempt (yes)
    repo.decisions[uuid4()] = _make_decision(
        user_id=_MOCK_SUB, user_input_hash="session-b",
        user_choice="yes", created_at=now,
    )
    client = TestClient(app)
    resp = client.get("/v1/decisions?choice=yes", headers={"Authorization": "Bearer x"})
    assert resp.status_code == 200
    items = resp.json()["items"]
    # 新しい順: session-b (attempt 1) → session-a yes (attempt 3)
    assert len(items) == 2
    assert items[0]["attempt_count"] == 1  # session-b
    assert items[1]["attempt_count"] == 3  # session-a, 3rd attempt


def test_limit_caps_returned_items(app_with_mock):
    app, repo_factory = app_with_mock
    repo = repo_factory.mock_store
    now = datetime.now(timezone.utc)
    for i in range(10):
        repo.decisions[uuid4()] = _make_decision(
            user_id=_MOCK_SUB, user_input_hash=f"h-{i}",
            user_choice="yes", created_at=now - timedelta(minutes=i),
        )
    client = TestClient(app)
    resp = client.get("/v1/decisions?limit=5", headers={"Authorization": "Bearer x"})
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert len(items) == 5
    assert resp.json()["limit"] == 5


def test_unauthenticated_returns_401(app_with_mock):
    app, _ = app_with_mock
    client = TestClient(app)
    resp = client.get("/v1/decisions")  # no Authorization header
    assert resp.status_code == 401
```

### Step 1.4: テストを実行して FAIL することを確認

Run:
```bash
cd /Users/morimatsu/lab/ai-dlc-hackathon/apps/api && uv run pytest tests/integration/decision/test_list_decisions_endpoint.py -v
```

Expected: 5 件すべて FAIL (endpoint が無いので 404 / 405)

### Step 1.5: endpoint を実装

Edit `apps/api/src/yesman_api/interface/http/decisions.py` —

冒頭の import を以下に追加:

```python
from collections import defaultdict
from typing import Literal

from fastapi import Query
```

`Query` は既存 import の `from fastapi import ...` 行に追加 (重複しないよう注意)。

import block (L26-33) の DTO import に以下を追加:

```python
from yesman_api.interface.http.dto.decision import (
    ChoiceRequest,
    ChoiceResponse,
    DecisionRequestDTO,
    DecisionResponse,
    DecisionHistoryItemDTO,
    DecisionHistoryResponse,
    NudgeResponse,
    UtteranceDTO,
)
```

(既存 import block に `DecisionHistoryItemDTO`, `DecisionHistoryResponse` を追加)

ファイル末尾 (= `_json_response` ヘルパーの後) に以下の endpoint を追加:

```python
RAW_CAP_FOR_ATTEMPT_COUNT = 1000


@router.get("", response_model=DecisionHistoryResponse)
async def list_decisions(
    user: AuthenticatedUser = Depends(get_current_user),
    repo: DecisionRepository = Depends(get_decision_repo),
    limit: int = Query(default=20, ge=1, le=100),
    choice: Literal["yes", "no", "all"] = Query(default="yes"),
) -> DecisionHistoryResponse:
    """Yes 採択履歴 (デフォルト 20 件) + attempt_count (同 user_input_hash 内の試行順)."""
    user_id = UUID(user.sub)

    # Step 1: 全 decision を created_at 昇順で fetch (cap 1000 件)
    all_raw = await repo.list_by_user(
        user_id, limit=RAW_CAP_FOR_ATTEMPT_COUNT, order_by="created_at_asc",
    )

    # Step 2: user_input_hash で group して attempt_count を 1-indexed で計算
    attempt_idx: dict[str, int] = defaultdict(int)
    enriched: list[tuple[object, int]] = []
    for d in all_raw:
        attempt_idx[d.user_input_hash] += 1
        enriched.append((d, attempt_idx[d.user_input_hash]))

    # Step 3: choice filter + created_at 降順
    filtered = [
        (d, idx) for d, idx in enriched
        if choice == "all" or d.user_choice == choice
    ]
    filtered.sort(key=lambda x: x[0].created_at, reverse=True)

    # Step 4: limit 件 → DTO
    items = [
        DecisionHistoryItemDTO(
            id=str(d.id),
            user_input=d.user_input,
            proposal_text=d.proposal_text,
            user_choice=d.user_choice,
            attempt_count=idx,
            created_at=d.created_at,
        )
        for d, idx in filtered[:limit]
    ]
    return DecisionHistoryResponse(items=items, limit=limit)
```

### Step 1.6: テストを再実行して PASS を確認

Run:
```bash
cd /Users/morimatsu/lab/ai-dlc-hackathon/apps/api && uv run pytest tests/integration/decision/test_list_decisions_endpoint.py -v
```

Expected: 5 件すべて PASS

### Step 1.7: 周辺テストへの影響確認

Run:
```bash
cd /Users/morimatsu/lab/ai-dlc-hackathon/apps/api && uv run pytest tests/ -k "decision" -v 2>&1 | tail -20
```

Expected: decision 関連の既存テストすべて PASS (回帰なし)

### Step 1.8: Commit

```bash
cd /Users/morimatsu/lab/ai-dlc-hackathon
git add apps/api/src/yesman_api/interface/http/dto/decision.py apps/api/src/yesman_api/interface/http/decisions.py apps/api/tests/integration/decision/test_list_decisions_endpoint.py
git commit -m "$(cat <<'EOF'
feat(api): GET /v1/decisions 履歴 endpoint (attempt_count 計算込)

ScorePage decision history (spec 2026-05-22) Task 1:
- DecisionHistoryItemDTO / DecisionHistoryResponse 追加
- @router.get("") で list_decisions を新設、user_input_hash で
  group して attempt_count を 1-indexed で算出
- choice filter (yes/no/all)、limit 1-100
- integration test 5 件 (empty / filter / attempt_count / limit / 401)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Mock seed に regenerate session を追加

**Files:**
- Modify: `apps/api/src/yesman_api/infrastructure/persistence/mock_repositories.py:155-189`
- Create: `apps/api/tests/unit/persistence/test_seed_regenerate_sessions.py`

### Step 2.1: テストを先に書く (FAIL する)

Create `apps/api/tests/unit/persistence/test_seed_regenerate_sessions.py`:

```python
"""seed_demo_decisions の regenerate session 生成を検証.

修正後の seed は 20% の input に対して 2-5 attempts の session を作る。
"""
from __future__ import annotations

from collections import Counter
from uuid import UUID

import pytest

from yesman_api.infrastructure.persistence.mock_repositories import MockRepositoryStore


def test_seed_produces_regenerate_sessions():
    """少なくとも 1 件は同じ user_input_hash を持つ複数 decision (= session) が存在する."""
    store = MockRepositoryStore()
    user_id = UUID("11111111-1111-1111-1111-111111111111")
    seeded = store.seed_demo_decisions(user_id=user_id, days=30)
    assert seeded > 0

    hash_counts = Counter(d.user_input_hash for d in store.decisions.values())
    multi_attempt_hashes = [h for h, c in hash_counts.items() if c > 1]
    # seed=42 固定なので、20% × ~3.5 input/day × 30 days ≈ 21 session 期待
    # 最低 1 件あれば regenerate session 機能は動作している
    assert len(multi_attempt_hashes) >= 1, \
        f"No multi-attempt sessions found (hash_counts={hash_counts})"


def test_seed_session_ends_with_yes_or_no():
    """session 内では、最後の attempt のみ yes/no どちらも可、それ以外は必ず no."""
    store = MockRepositoryStore()
    user_id = UUID("11111111-1111-1111-1111-111111111111")
    store.seed_demo_decisions(user_id=user_id, days=30)

    # hash 別 group + created_at 順 sort
    from collections import defaultdict
    hash_groups: dict[str, list] = defaultdict(list)
    for d in store.decisions.values():
        hash_groups[d.user_input_hash].append(d)

    for hash_, items in hash_groups.items():
        if len(items) < 2:
            continue  # single attempt session は対象外
        items.sort(key=lambda d: d.created_at)
        # 最後以外はすべて "no"
        for d in items[:-1]:
            assert d.user_choice == "no", \
                f"Non-last attempt in session {hash_} should be 'no', got {d.user_choice}"


def test_seed_is_idempotent():
    """同じ user_id で 2 度呼んでも duplicate しない."""
    store = MockRepositoryStore()
    user_id = UUID("11111111-1111-1111-1111-111111111111")
    first = store.seed_demo_decisions(user_id=user_id, days=30)
    second = store.seed_demo_decisions(user_id=user_id, days=30)
    assert first > 0
    assert second == 0  # 2 回目は skip
```

### Step 2.2: テストを実行して FAIL することを確認

Run:
```bash
cd /Users/morimatsu/lab/ai-dlc-hackathon/apps/api && uv run pytest tests/unit/persistence/test_seed_regenerate_sessions.py -v
```

Expected: `test_seed_produces_regenerate_sessions` FAIL (現状 seed は unique hash なので multi-attempt が 0 件)
`test_seed_session_ends_with_yes_or_no` は trivially PASS (single attempt しか無いので skip される)
`test_seed_is_idempotent` PASS (既存挙動)

### Step 2.3: seed_demo_decisions を更新

Edit `apps/api/src/yesman_api/infrastructure/persistence/mock_repositories.py` —

`for i in range(days):` 〜 `seeded_decisions.append(decision)` の二重 for ブロック (L155-190 付近) を以下に置換:

```python
        for i in range(days):
            day_offset = days - 1 - i  # 0 = 古い、days-1 = 今日
            # Yes 比率を 0.30 → 0.95 へ漸進的に上昇 (右肩上がりトレンド)
            target_yes_ratio = 0.30 + (i / max(days - 1, 1)) * 0.65
            n_inputs = rng.randint(2, 5)
            for j in range(n_inputs):
                domain, input_text = rng.choice(domain_inputs)
                shared_hash = f"demo-seed-{i}-{j:02d}"
                # 20% は regenerate session (2-5 attempts)、80% は single attempt
                session_length = rng.randint(2, 5) if rng.random() < 0.2 else 1
                base_created_at = now - timedelta(
                    days=day_offset,
                    hours=rng.randint(8, 22),
                    minutes=rng.randint(0, 59),
                )
                for attempt in range(session_length):
                    is_last = (attempt == session_length - 1)
                    # session 最後のみ yes 可能性あり、それ以外は必ず no
                    if is_last:
                        choice = "yes" if rng.random() < target_yes_ratio else "no"
                    else:
                        choice = "no"
                    utterances = [
                        {"persona_name": name, "text": text}
                        for name, text in persona_specs
                    ]
                    decision = Decision(
                        id=uuid4(),
                        user_id=user_id,
                        domain_classification=domain,
                        user_input=input_text,
                        user_input_hash=shared_hash,  # session 内で共有
                        proposal_text="（デモ用の合議結論）",
                        persona_outputs={"utterances": utterances},
                        user_choice=choice,
                        no_attempt_count=0,  # 本フィールドは履歴 UI では使わない
                        llm_provider="mock",
                        selected_persona_ids=[],
                        created_at=base_created_at + timedelta(seconds=attempt * 30),
                    )
                    self.decisions[decision.id] = decision
                    seeded_decisions.append(decision)
```

### Step 2.4: テストを再実行して PASS を確認

Run:
```bash
cd /Users/morimatsu/lab/ai-dlc-hackathon/apps/api && uv run pytest tests/unit/persistence/test_seed_regenerate_sessions.py -v
```

Expected: 3 件すべて PASS

### Step 2.5: 既存 seed テストへの影響確認

Run:
```bash
cd /Users/morimatsu/lab/ai-dlc-hackathon/apps/api && uv run pytest tests/ -k "seed" -v 2>&1 | tail -20
```

Expected: 既存 seed 関連テストすべて PASS (= 既存は Yes 比率漸進の検証なので、session 化しても期待値の趣旨は保たれる)

もし既存テストで Yes 比率の境界値で失敗する場合は、テスト側を season pattern 許容に微調整 (実装は変えない)。

### Step 2.6: Commit

```bash
cd /Users/morimatsu/lab/ai-dlc-hackathon
git add apps/api/src/yesman_api/infrastructure/persistence/mock_repositories.py apps/api/tests/unit/persistence/test_seed_regenerate_sessions.py
git commit -m "$(cat <<'EOF'
feat(api): mock seed_demo_decisions に regenerate session を追加

ScorePage decision history (spec 2026-05-22) Task 2:
- 20% の input を 2-5 attempts の session 化 (全 no → 最後 yes/no)
- session 内では同じ user_input_hash を共有 (= attempt_count 計算対象)
- session 内 attempt は 30 秒間隔の created_at で並ぶ
- 3 件の unit test (session 存在 / session 内 last 以外は no / idempotent)

Demo 環境で「🌟 1 回目」「🔄 2-5 回目で採用」のバリエーションが視認可能.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: api-client `DecisionsModule.history()`

**Files:**
- Modify: `packages/api-client/src/modules/decisions.ts` (history method + type 追加)

### Step 3.1: history method を追加

Edit `packages/api-client/src/modules/decisions.ts` —

`export type` block の末尾に追加:

```typescript
export type DecisionHistoryItem = {
  id: string;
  user_input: string;
  proposal_text: string;
  user_choice: "yes" | "no" | "pending";
  attempt_count: number;
  created_at: string;
};

export type DecisionHistoryResponse = {
  items: DecisionHistoryItem[];
  limit: number;
};
```

> **Note**: 本来は `components["schemas"]["DecisionHistoryResponse"]` から自動生成されるべきだが、本リポジトリには openapi-gen の自動 commit がないので、当面は手動 type 定義で進める。schema 同期は別 issue で扱う。

`DecisionsModule` class 内 (`getNudge` の後) に `history` method を追加:

```typescript
  async history(opts?: {
    limit?: number;
    choice?: "yes" | "no" | "all";
  }): Promise<DecisionHistoryResponse> {
    const params = new URLSearchParams();
    if (opts?.limit !== undefined) params.set("limit", String(opts.limit));
    if (opts?.choice !== undefined) params.set("choice", opts.choice);
    const query = params.toString();
    return request<DecisionHistoryResponse>(
      this.client,
      `/v1/decisions${query ? `?${query}` : ""}`,
    );
  }
```

### Step 3.2: TypeScript build を確認

Run:
```bash
cd /Users/morimatsu/lab/ai-dlc-hackathon && pnpm -F @yesman/api-client build
```

Expected: build 成功、型エラーなし

### Step 3.3: Commit

```bash
cd /Users/morimatsu/lab/ai-dlc-hackathon
git add packages/api-client/src/modules/decisions.ts
git commit -m "$(cat <<'EOF'
feat(api-client): DecisionsModule.history() を追加

ScorePage decision history (spec 2026-05-22) Task 3:
- DecisionHistoryItem / DecisionHistoryResponse 型を手動定義
  (openapi-gen 自動化は別 issue)
- history({ limit?, choice? }) method で GET /v1/decisions を叩く

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Web utilities (formatRelativeTime / truncate)

**Files:**
- Create: `apps/web/src/features/score/formatRelativeTime.ts`
- Create: `apps/web/src/features/score/truncate.ts`
- Create: `apps/web/tests/features/score/formatRelativeTime.test.ts`
- Create: `apps/web/tests/features/score/truncate.test.ts`

### Step 4.1: formatRelativeTime test を新規作成

Create `apps/web/tests/features/score/formatRelativeTime.test.ts`:

```typescript
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { formatRelativeTime } from "../../../src/features/score/formatRelativeTime";

describe("formatRelativeTime", () => {
  const NOW = new Date("2026-05-22T12:00:00Z").getTime();
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 'たった今' for < 1 minute", () => {
    expect(formatRelativeTime("2026-05-22T11:59:30Z")).toBe("たった今");
  });

  it("returns 'N 分前' for < 60 minutes", () => {
    expect(formatRelativeTime("2026-05-22T11:55:00Z")).toBe("5 分前");
  });

  it("returns 'N 時間前' for < 24 hours", () => {
    expect(formatRelativeTime("2026-05-22T09:00:00Z")).toBe("3 時間前");
  });

  it("returns '昨日' for 1 day ago", () => {
    expect(formatRelativeTime("2026-05-21T12:00:00Z")).toBe("昨日");
  });

  it("returns 'N 日前' for 2-6 days", () => {
    expect(formatRelativeTime("2026-05-19T12:00:00Z")).toBe("3 日前");
  });

  it("returns YYYY-MM-DD for >= 7 days", () => {
    expect(formatRelativeTime("2026-05-10T12:00:00Z")).toBe("2026-05-10");
  });

  it("returns 'たった今' for future dates (defensive)", () => {
    expect(formatRelativeTime("2026-05-22T12:01:00Z")).toBe("たった今");
  });
});
```

### Step 4.2: truncate test を新規作成

Create `apps/web/tests/features/score/truncate.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { truncate } from "../../../src/features/score/truncate";

describe("truncate", () => {
  it("returns string unchanged when length <= n", () => {
    expect(truncate("hello", 10)).toBe("hello");
    expect(truncate("hello", 5)).toBe("hello");
  });

  it("truncates and appends ellipsis when length > n", () => {
    expect(truncate("abcdefghij", 5)).toBe("abcde…");
  });

  it("handles Japanese (single code unit chars)", () => {
    expect(truncate("今日のランチを決めて", 5)).toBe("今日のラン…");
  });

  it("handles emoji surrogate pairs as single chars", () => {
    // 🎉 is 2 code units but 1 char via [...]
    expect(truncate("🎉🎉🎉🎉🎉🎉🎉", 3)).toBe("🎉🎉🎉…");
  });

  it("returns empty string unchanged", () => {
    expect(truncate("", 10)).toBe("");
  });

  it("handles n=0 (edge case)", () => {
    expect(truncate("abc", 0)).toBe("…");
  });
});
```

### Step 4.3: テストを実行して FAIL することを確認

Run:
```bash
cd /Users/morimatsu/lab/ai-dlc-hackathon && pnpm -F @yesman/web test -- formatRelativeTime truncate
```

Expected: 全 13 件 FAIL (モジュールが無いため import error)

### Step 4.4: formatRelativeTime を実装

Create `apps/web/src/features/score/formatRelativeTime.ts`:

```typescript
/** 相対時刻 5 段階フォーマット (spec §7).
 *
 * < 1m  : 「たった今」
 * < 1h  : 「N 分前」
 * < 24h : 「N 時間前」
 * 1d    : 「昨日」
 * < 7d  : 「N 日前」
 * ≥ 7d  : 「YYYY-MM-DD」
 *
 * 未来時刻 (now < then) は防御的に「たった今」扱い。
 */
export function formatRelativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffMs = now - then;
  if (diffMs < 60_000) return "たった今";
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 60) return `${diffMin} 分前`;
  const diffHour = Math.floor(diffMs / 3_600_000);
  if (diffHour < 24) return `${diffHour} 時間前`;
  const diffDay = Math.floor(diffMs / 86_400_000);
  if (diffDay === 1) return "昨日";
  if (diffDay < 7) return `${diffDay} 日前`;
  return iso.slice(0, 10); // YYYY-MM-DD
}
```

### Step 4.5: truncate を実装

Create `apps/web/src/features/score/truncate.ts`:

```typescript
/** surrogate pair 対応の truncate.
 *
 * 文字列が n char (UnicodeScalar count) を超える場合、n char までで切り「…」を付与。
 * 絵文字などの surrogate pair は [...s] で 1 char として扱う。
 */
export function truncate(s: string, n: number): string {
  const chars = [...s];
  if (chars.length <= n) return s;
  return chars.slice(0, n).join("") + "…";
}
```

### Step 4.6: テストを再実行して PASS を確認

Run:
```bash
cd /Users/morimatsu/lab/ai-dlc-hackathon && pnpm -F @yesman/web test -- formatRelativeTime truncate
```

Expected: 13 件すべて PASS

### Step 4.7: Commit

```bash
cd /Users/morimatsu/lab/ai-dlc-hackathon
git add apps/web/src/features/score/formatRelativeTime.ts apps/web/src/features/score/truncate.ts apps/web/tests/features/score/formatRelativeTime.test.ts apps/web/tests/features/score/truncate.test.ts
git commit -m "$(cat <<'EOF'
feat(web): score 履歴用 time/truncate utility を追加

ScorePage decision history (spec 2026-05-22) Task 4:
- formatRelativeTime: 5 段階 (たった今/分/時間/昨日/日/YYYY-MM-DD)
- truncate: surrogate pair 対応 ([...s] で 1 char count)
- 13 件の unit test (境界値 + emoji + 防御的 future time)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: useDecisionHistory hook + DecisionHistoryList component

**Files:**
- Create: `apps/web/src/features/score/useDecisionHistory.ts`
- Create: `apps/web/src/features/score/DecisionHistoryList.tsx`
- Create: `apps/web/tests/features/score/DecisionHistoryList.test.tsx`

### Step 5.1: DecisionHistoryList test を新規作成 (FAIL する)

Create `apps/web/tests/features/score/DecisionHistoryList.test.tsx`:

```tsx
import { describe, expect, it, afterAll, afterEach, beforeAll } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiProvider } from "../../../src/shell/ApiProvider";
import { AuthProvider } from "../../../src/shell/AuthProvider";
import { DecisionHistoryList } from "../../../src/features/score/DecisionHistoryList";

const server = setupServer();

type HistoryItem = {
  id: string;
  user_input: string;
  proposal_text: string;
  user_choice: "yes" | "no" | "pending";
  attempt_count: number;
  created_at: string;
};

function setup(items: HistoryItem[]) {
  server.use(
    http.get("http://localhost:8000/v1/decisions", () =>
      HttpResponse.json({ items, limit: 20 }),
    ),
  );
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <AuthProvider>
        <ApiProvider>
          <QueryClientProvider client={qc}>
            <DecisionHistoryList />
          </QueryClientProvider>
        </ApiProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe("DecisionHistoryList", () => {
  beforeAll(() => server.listen({ onUnhandledRequest: "warn" }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  it("renders 3 items with question, proposal, and adoption count", async () => {
    setup([
      {
        id: "1",
        user_input: "今日のランチどうしよう？",
        proposal_text: "コンビニのサラダチキン定食",
        user_choice: "yes",
        attempt_count: 1,
        created_at: new Date(Date.now() - 5 * 60_000).toISOString(),
      },
      {
        id: "2",
        user_input: "今夜の映画 何見よう？",
        proposal_text: "Dune: Part Two",
        user_choice: "yes",
        attempt_count: 3,
        created_at: new Date(Date.now() - 24 * 3_600_000).toISOString(),
      },
      {
        id: "3",
        user_input: "週末の家族旅行どこ行く？",
        proposal_text: "箱根 1 泊温泉プラン",
        user_choice: "yes",
        attempt_count: 5,
        created_at: new Date(Date.now() - 3 * 86_400_000).toISOString(),
      },
    ]);
    await waitFor(() => {
      expect(screen.getByText(/今日のランチどうしよう/)).toBeInTheDocument();
    });
    expect(screen.getByText(/コンビニのサラダチキン定食/)).toBeInTheDocument();
    expect(screen.getByText(/🌟 1 回目で採用/)).toBeInTheDocument();
    expect(screen.getByText(/🔄 3 回目で採用/)).toBeInTheDocument();
    expect(screen.getByText(/🔄 5 回目で採用/)).toBeInTheDocument();
  });

  it("renders section heading", async () => {
    setup([
      {
        id: "1",
        user_input: "Q",
        proposal_text: "P",
        user_choice: "yes",
        attempt_count: 1,
        created_at: new Date().toISOString(),
      },
    ]);
    await waitFor(() => {
      expect(screen.getByText(/📜 最近の Yes 採択/)).toBeInTheDocument();
    });
    expect(screen.getByText(/最大 20 件/)).toBeInTheDocument();
  });

  it("renders empty state when no items", async () => {
    setup([]);
    await waitFor(() => {
      expect(screen.getByText(/まだ Yes 採択の履歴がありません/)).toBeInTheDocument();
    });
  });

  it("does not render component when API errors (silent fail)", async () => {
    server.use(
      http.get("http://localhost:8000/v1/decisions", () =>
        HttpResponse.error(),
      ),
    );
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(
      <MemoryRouter>
        <AuthProvider>
          <ApiProvider>
            <QueryClientProvider client={qc}>
              <DecisionHistoryList />
            </QueryClientProvider>
          </ApiProvider>
        </AuthProvider>
      </MemoryRouter>,
    );
    await waitFor(() => {
      // section heading が無いことで silent fail を確認
      expect(screen.queryByText(/最近の Yes 採択/)).not.toBeInTheDocument();
    });
    // 容器は空 (or close to empty)
    expect(container.textContent).not.toContain("最近の Yes 採択");
  });
});
```

### Step 5.2: テストを実行して FAIL することを確認

Run:
```bash
cd /Users/morimatsu/lab/ai-dlc-hackathon && pnpm -F @yesman/web test -- DecisionHistoryList
```

Expected: 4 件すべて FAIL (モジュール無し)

### Step 5.3: useDecisionHistory hook を実装

Create `apps/web/src/features/score/useDecisionHistory.ts`:

```typescript
/** useDecisionHistory — React Query hook for /v1/decisions (Yes 採択履歴 + attempt_count). */
import { useQuery } from "@tanstack/react-query";
import { useApi } from "../../shell/ApiProvider";

export function useDecisionHistory(opts?: { limit?: number }) {
  const api = useApi();
  const limit = opts?.limit ?? 20;
  return useQuery({
    queryKey: ["decisions", "history", "yes", limit],
    queryFn: () => api.decisions.history({ limit, choice: "yes" }),
    staleTime: 30_000,
  });
}
```

### Step 5.4: DecisionHistoryList component を実装

Create `apps/web/src/features/score/DecisionHistoryList.tsx`:

```tsx
/**
 * DecisionHistoryList — ScorePage 下部に最近の Yes 採択を 20 件表示.
 * spec 2026-05-22-score-decision-history-design.md §6 準拠.
 *
 * - No (棄却) は表示しない (Score 計算には引き続き利用)
 * - 各 item: ✓ + 質問 + → 提案 + 🕒 相対時刻 ・ 採用回数 (🌟 1 / 🔄 N)
 * - 空状態: ダッシュ枠 + 📭 + 文言
 * - エラー時: silent fail (null 返す、ScorePage は崩さない)
 */
import { useDecisionHistory } from "./useDecisionHistory";
import { formatRelativeTime } from "./formatRelativeTime";
import { truncate } from "./truncate";

function renderAdoptionCount(attemptCount: number): string {
  if (attemptCount === 1) return `🌟 1 回目で採用`;
  return `🔄 ${attemptCount} 回目で採用`;
}

export function DecisionHistoryList(): JSX.Element | null {
  const { data, isPending, isError } = useDecisionHistory();

  if (isPending) {
    // skeleton 3 件
    return (
      <section className="mt-6">
        <h2 className="font-serif font-semibold text-base text-brand-700 px-3 mb-2">
          📜 最近の Yes 採択
        </h2>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="rounded-xl border border-neutral-200 bg-white p-3 mb-2 h-20 animate-pulse motion-reduce:animate-none"
            aria-hidden
          />
        ))}
      </section>
    );
  }

  if (isError || !data) {
    return null; // silent fail
  }

  return (
    <section className="mt-6" aria-label="最近の Yes 採択履歴">
      <h2 className="font-serif font-semibold text-base text-brand-700 px-3 mb-2">
        📜 最近の Yes 採択
        <span className="text-xs text-neutral-500 font-normal ml-2">
          (最大 {data.limit} 件)
        </span>
      </h2>
      {data.items.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-neutral-300 p-6 text-center">
          <div className="text-2xl mb-2" aria-hidden>📭</div>
          <p className="text-sm italic text-neutral-500">
            まだ Yes 採択の履歴がありません
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {data.items.map((item) => (
            <li key={item.id}>
              <article className="rounded-xl border border-neutral-200 bg-white p-3 flex gap-2">
                <span
                  className="text-success font-bold text-base flex-shrink-0"
                  aria-hidden
                >
                  ✓
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-serif italic text-sm text-neutral-800 truncate">
                    「{truncate(item.user_input, 60)}」
                  </p>
                  <p className="text-sm text-neutral-700 truncate">
                    → {truncate(item.proposal_text, 60)}
                  </p>
                  <p className="text-xs text-neutral-500 mt-1">
                    🕒 {formatRelativeTime(item.created_at)}
                    <span className="mx-1">・</span>
                    {renderAdoptionCount(item.attempt_count)}
                  </p>
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
```

### Step 5.5: テストを再実行して PASS を確認

Run:
```bash
cd /Users/morimatsu/lab/ai-dlc-hackathon && pnpm -F @yesman/web test -- DecisionHistoryList
```

Expected: 4 件すべて PASS

### Step 5.6: lint + build を確認

Run:
```bash
pnpm -F @yesman/web lint && pnpm -F @yesman/web build
```

Expected: エラーなし、size-limit OK

### Step 5.7: Commit

```bash
cd /Users/morimatsu/lab/ai-dlc-hackathon
git add apps/web/src/features/score/useDecisionHistory.ts apps/web/src/features/score/DecisionHistoryList.tsx apps/web/tests/features/score/DecisionHistoryList.test.tsx
git commit -m "$(cat <<'EOF'
feat(web): DecisionHistoryList コンポーネント新規

ScorePage decision history (spec 2026-05-22) Task 5:
- useDecisionHistory hook (React Query, staleTime 30s)
- DecisionHistoryList:
  * Section header「📜 最近の Yes 採択 (最大 20 件)」
  * 各 item = ✓ + 質問 + → 提案 + 🕒 相対時刻 ・ 採用回数
  * 採用回数 = 🌟 1 回目 or 🔄 N 回目で採用 (attempt_count ベース)
  * 空状態 (📭 + 文言) / loading (skeleton) / error (silent fail null)
- 4 件の component test (render / heading / empty / error)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: ScorePage に DecisionHistoryList を組込む

**Files:**
- Modify: `apps/web/src/features/score/ScorePage.tsx`

### Step 6.1: 既存 ScorePage 末尾を確認

Run:
```bash
tail -20 /Users/morimatsu/lab/ai-dlc-hackathon/apps/web/src/features/score/ScorePage.tsx
```

Confirm: 解釈ガイドの `<p>` で終わっていること

### Step 6.2: ScorePage に DecisionHistoryList を挿入

Edit `apps/web/src/features/score/ScorePage.tsx` —

import 群 (既存 import の直後) に追加:

```tsx
import { DecisionHistoryList } from "./DecisionHistoryList";
```

return ブロック内の最後の `<p>` (= 解釈ガイド `{t("paradoxNote")}`) の直後、外側 `</div>` の直前に挿入:

```tsx
      {/* spec 2026-05-22-score-decision-history: Yes 採択履歴 (最大 20 件) */}
      <DecisionHistoryList />
```

### Step 6.3: 既存 ScorePage テストへの回帰確認

Run:
```bash
cd /Users/morimatsu/lab/ai-dlc-hackathon && pnpm -F @yesman/web test -- ScorePage
```

Expected: 既存 `ScorePage.test.tsx` の 2 件すべて PASS (DecisionHistoryList の追加で破綻しない)。

> **Note**: ScorePage test の msw は `/v1/scores/me` のみ mock。`/v1/decisions` は handler 未登録だが、`onUnhandledRequest: "warn"` 設定 (setup.ts) のため warn は出るが test は通る。`DecisionHistoryList` 側は msw 未登録時 isPending または error になり、silent fail 含めて ScorePage の test 期待値 (radial / pink bubble) には影響しない。

### Step 6.4: lint + build を確認

Run:
```bash
pnpm -F @yesman/web lint && pnpm -F @yesman/web build
```

Expected: エラーなし、size-limit OK

### Step 6.5: Commit

```bash
cd /Users/morimatsu/lab/ai-dlc-hackathon
git add apps/web/src/features/score/ScorePage.tsx
git commit -m "$(cat <<'EOF'
feat(web): ScorePage に DecisionHistoryList を組込

ScorePage decision history (spec 2026-05-22) Task 6:
- 既存 Card + footnote + paradox note の下に追加
- 既存 ScorePage test に破綻なし (silent fail)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Post-Implementation Verification

- [ ] **Step 7.1: Web 全テスト**

Run:
```bash
cd /Users/morimatsu/lab/ai-dlc-hackathon && pnpm -F @yesman/web test
```

Expected: 既存 + 新規あわせて全 PASS (+13 utility + 4 component = +17 件)

- [ ] **Step 7.2: API 全テスト**

Run:
```bash
cd /Users/morimatsu/lab/ai-dlc-hackathon/apps/api && uv run pytest tests/ -v 2>&1 | tail -10
```

Expected: 全 PASS (+5 integration + 3 unit = +8 件)

- [ ] **Step 7.3: Web build + size-limit**

Run:
```bash
pnpm -F @yesman/web build && pnpm -F @yesman/web size
```

Expected: build 成功、size-limit 違反なし

- [ ] **Step 7.4: 手動デモシナリオ (Mock LLM + seed 環境)**

Run:
```bash
# Terminal 1: API
cd /Users/morimatsu/lab/ai-dlc-hackathon
MOCK_SEED_DEMO_DECISIONS=true LLM_PROVIDER=mock STORAGE_BACKEND=mock AUTH_BACKEND=mock VOICE_BACKEND=mock EVENT_BACKEND=sync MOCK_AUTO_USER=true LEARNING_CONSUMER_ENABLED=false SILENCE_HASH_SALT=local-salt PERSONA_ANONYMIZER_SALT=local-persona-salt CORS_ALLOWED_ORIGINS='["http://localhost:5173"]' pnpm --filter @yesman/api start

# Terminal 2: Web
VITE_API_BASE_URL=http://localhost:8000 VITE_AUTH_BYPASS=true VITE_MOCK_USER_SUB=11111111-1111-1111-1111-111111111111 VITE_MOCK_USER_EMAIL=test@example.com VITE_COGNITO_REGION=ap-northeast-1 VITE_COGNITO_USER_POOL_ID=ap-northeast-1_test VITE_COGNITO_APP_CLIENT_ID=test VITE_COGNITO_HOSTED_UI_URL=https://test.auth.example.com VITE_APP_VERSION=local pnpm --filter @yesman/web dev
```

ブラウザで `http://localhost:5173/score`:
- 既存 radial / pink bubble / line chart / stats が表示される (変更なし)
- 末尾に「📜 最近の Yes 採択 (最大 20 件)」セクションが表示される
- 複数 item に「🔄 2 回目」「🔄 3 回目」などのバリエーションがある (= seed の regenerate session が機能)
- 1 件以上は「🌟 1 回目で採用」

- [ ] **Step 7.5: e2e Playwright 全 PASS (オプション)**

Run:
```bash
pnpm -F @yesman/e2e test 2>&1 | tail -5
```

Expected: 100/100 PASS (既存 e2e に破壊なし)

- [ ] **Step 7.6: コミット履歴を確認**

Run:
```bash
git log --oneline 1477245..HEAD
```

Expected: 6 件の feat commit (Task 1〜6) が並ぶ

- [ ] **Step 7.7: PR 作成 (user が指示した場合のみ)**

```bash
gh pr create --base develop --title "feat(web,api): ScorePage に Yes 採択履歴 (DecisionHistoryList) を追加" --body "$(cat <<'EOF'
## Summary
- /score ページ末尾に「📜 最近の Yes 採択 (最大 20 件)」セクションを追加
- 各 item に質問 / 提案 / 相対時刻 / 採用回数 (🌟 1 回目 / 🔄 N 回目) を表示
- attempt_count は API で user_input_hash group + created_at 順 1-indexed 計算
- Mock seed に 20% の regenerate session を追加 (デモで採用回数バリエーション可視)
- 設計: docs/superpowers/specs/2026-05-22-score-decision-history-design.md
- 計画: docs/superpowers/plans/2026-05-22-score-decision-history.md

## Test plan
- [x] API integration test (5 件) + seed unit test (3 件) PASS
- [x] Web utility test (13 件) + component test (4 件) PASS
- [x] Web build + size-limit OK
- [x] 手動: /score 末尾に履歴セクション + 採用回数バリエーション確認
- [ ] CI e2e Playwright 全 PASS

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

> push と PR 作成は user が明示的に指示した場合のみ実行。本 plan の自動実行範囲外。

---

## Self-Review Results

**1. Spec coverage:**

| Spec 設計 | Task | Status |
|-----------|------|--------|
| §3 設計 1: API endpoint + hash grouping | Task 1 | ✓ |
| §3 Mock seed の更新 | Task 2 | ✓ |
| §4 設計 2: api-client `history()` | Task 3 | ✓ |
| §7 設計 5: utilities (formatRelativeTime / truncate) | Task 4 | ✓ |
| §5 設計 3: useDecisionHistory hook | Task 5 | ✓ |
| §6 設計 4: DecisionHistoryList component | Task 5 | ✓ |
| §8 設計 6: ScorePage 組込 | Task 6 | ✓ |
| §2 Gherkin 受入基準 (filter / attempt_count / 表示 / 空 / silent fail) | Task 1.3 + Task 5.1 | ✓ |
| §9 テスト戦略 (API 5 / 履歴 4 / utility 13 / seed 3) | 各 Task | ✓ |
| §10 実装順序 (6 commits) | Task 1 → 6 | ✓ |
| §12 DoD 6 項目 | Step 7.1〜7.5 | ✓ |

**2. Placeholder scan:** 全ステップに具体的なコード / コマンド / 期待出力あり。"TBD" / "TODO" / "実装する" 等の中身なしステップなし。

**3. Type consistency:**
- `attempt_count: int = Field(ge=1, ...)` (Task 1.2) と TypeScript `attempt_count: number` (Task 3.1) で field 名一致
- `user_choice: Literal["yes", "no", "pending"]` (Task 1.2) と TS `"yes" | "no" | "pending"` (Task 3.1) で一致
- `renderAdoptionCount(attemptCount: number)` (Task 5.4) は spec §6 と一致
- `useDecisionHistory(opts?: { limit?: number })` (Task 5.3) は呼び出し側 (Task 5.4 内 `useDecisionHistory()`) と一致 (引数省略可)

**4. Discovered gap fix:**
- spec I4 で「unit + stub repo」と書いたが、実態の既存 HTTP endpoint test は TestClient ベース。本 plan では Task 1 を `tests/integration/decision/` に配置し、その理由を Task 1 冒頭の Note で明記。
- spec §6 で「✓ チェック」を `text-success-700` と書いていたが (修正済 → `text-success`)、Task 5.4 で正しく `text-success` を使用。
- spec で `user.user_id` と書いていた箇所 (Section 3) を、実コードに合わせて `UUID(user.sub)` (Task 1.5) に修正。
