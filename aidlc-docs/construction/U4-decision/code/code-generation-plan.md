# U4 / decision — Code Generation Plan (Part 1)

**Unit**: U4 / decision
**Phase**: CONSTRUCTION — Code Generation Part 1 (Planning)
**Created**: 2026-05-16
**Status**: 🟡 IN REVIEW
**Upstream**: FD (13 fixes) + NFR Req (12 fixes) + NFR Design (11 fixes) + Infra Design (9 fixes)

---

## 0. 位置付け

Infrastructure Design §11 で確定した Phase A.0 → A〜I の 10 段階を **チェックボックス付き詳細タスクリスト** として展開。U3 で確立した品質基準・動作確認パターンを継承。

---

## 1. 全体方針

### 1.1 ファイル集計

| カテゴリ | 数 |
|---|---|
| **新規 Python (本体)** | 23 |
| **変更 Python (本体)** | 3 (config / deps / main) |
| **新規 shared / constants** | 2 (pii_filter, persistence/constants) |
| **新規テスト** | **18 + fixture 1** (Unit 9 + Integration 3 + Contract 2 + PBT 4、ultrathink I4 反映 2026-05-16: 集計訂正) |
| **新規 / 変更 ドキュメント** | 2 (.env.example 更新、RUNBOOK §8 追記) |
| **変更 pyproject.toml** | 1 |
| **変更 CDK** | 1 (api-stack.ts) |
| **U2 patch (条件付き)** | 0-2 (count_no_by_user pending 除外) |
| **合計** | **約 47-49 ファイル** |

### 1.2 順序 (線形)
Phase A.0 → A → B → C → D → E → F → G → H → I の **線形順序**。

### 1.3 品質基準 (各 Phase 完了時)
- ✅ AST parse OK
- ✅ import 解決
- ✅ U2/U3 既存テスト回帰なし
- ✅ 該当 Phase の新規テスト pass
- ✅ ruff check 通過

### 1.4 ロールバック方針
- Phase 単位で破綻したら全ファイル破棄して再着手

---

## 2. Phase A.0: U2 遡及確認 + 条件付き patch (Infra Design I3 反映)

**目的**: U2 `count_no_by_user` が pending を除外しているか確認、必要なら U2 を patch。

### Phase A.0 タスク

- [ ] **A.0.1** SQL 実装確認:
  ```bash
  grep -n "count_no_by_user" apps/api/src/yesman_api/infrastructure/persistence/sqlmodel_repositories.py
  ```
  期待: `WHERE user_choice IN ('yes', 'no')` または `WHERE user_choice != 'pending'` 相当の SQL
- [ ] **A.0.2** Mock 実装確認:
  ```bash
  grep -n "count_no_by_user" apps/api/src/yesman_api/infrastructure/persistence/mock_repositories.py
  ```
  期待: dict filter で `user_choice in {"yes", "no"}` または等価ロジック
- [ ] **A.0.3** **patch 条件分岐**:
  - 両方の確認で pending 除外あり → A.0 完了、Phase A に進む
  - **いずれかが pending 含む実装** → 以下の patch を Phase A.0 に追加:
    - SQL: `count_no_by_user` の SQL に `.filter(Decision.user_choice.in_(['yes', 'no']))` 追加
    - Mock: `[d for d in self.decisions.values() if d.user_id == user_id and d.user_choice in ('yes', 'no')]`
    - 既存 U2 unit test (test_mock_repositories) に 1 ケース追加: pending Decision が total に算入されないことを assertion

### Phase A.0 完了基準
- [ ] 確認結果が audit.md に記録 (pass / patched どちらか)

---

## 3. Phase A: 基盤 (`shared/pii_filter.py` + constants + config 拡張)

**目的**: U4 全体で利用される基盤ヘルパー + 定数 + 設定拡張。

### Phase A タスク

- [ ] **A.1** `apps/api/src/yesman_api/domain/persistence/constants.py` を新規作成
  - `from uuid import UUID`
  - `SYSTEM_USER_ID: Final[UUID] = UUID("00000000-0000-0000-0000-000000000001")` (U2 Alembic 0002 で確定済の値、Infra Design I1 反映)
  - docstring で「Alembic migration と値の一致で整合確保、import 不要 (Alembic は SQL 直接実行)」と明示
- [ ] **A.2** `apps/api/src/yesman_api/shared/pii_filter.py` を新規作成 (NFR Design §6 + I6 反映)
  - `EMAIL_RE` / `PHONE_JP_RE` / `PHONE_US_RE` / `CC_CANDIDATE_RE` regex
  - `_luhn_valid(digits_only)` Luhn checksum 関数
  - `_mask_cc(text, mask)` Luhn 検証付き CC マスク
  - `mask_pii(text, *, mask="***")` メインエントリ
- [ ] **A.3** `apps/api/src/yesman_api/infrastructure/config.py` を変更
  - U4 環境変数 12 個追加 (NFR Design §9 通り):
    - `bedrock_region: str = "ap-northeast-1"`
    - `bedrock_model_id: str = "anthropic.claude-3-haiku-20240307-v1:0"`
    - `bedrock_guardrail_id: str = ""`
    - `bedrock_guardrail_version: str = "DRAFT"`
    - `decision_llm_timeout_seconds: float = 30.0`
    - `decision_llm_stream_initial_timeout_seconds: float = 5.0`
    - `decision_llm_stream_total_timeout_seconds: float = 120.0`
    - `decision_llm_retry_count: int = 1`
    - `nudge_generation_enabled: bool = True`
    - `nudge_cache_ttl_seconds: float = 600.0`
    - `event_bus_name: str = ""`
    - `silence_hash_salt: str = ""`
  - `validate_runtime` に 3 段追加:
    - Mock LLM は dev/ci 限定
    - prod は SILENCE_HASH_SALT 必須
    - EVENT_BACKEND=eventbridge は EVENT_BUS_NAME 必須

### Phase A 完了基準 (ultrathink I1 反映 2026-05-16)
- [ ] AST parse OK (3 ファイル変更 + 2 新規)
- [ ] `python3 -c "from yesman_api.shared.pii_filter import mask_pii; from yesman_api.domain.persistence.constants import SYSTEM_USER_ID; from yesman_api.infrastructure.config import AppConfig; cfg = AppConfig(); print(cfg.bedrock_model_id)"` で **AppConfig 初期化のみ確認** (`validate_runtime()` の動作確認は **Phase I で unit test に分離**: mock dev OK / cognito prod 必須 env / event-eventbridge with bus の 3 ケース)
- [ ] U2/U3 既存テスト回帰なし

---

## 4. Phase B: domain/decision モデル + application/decision Protocol (5 ファイル)

### Phase B タスク

- [ ] **B.1** `apps/api/src/yesman_api/domain/decision/__init__.py` (空)
- [ ] **B.2** `apps/api/src/yesman_api/domain/decision/models.py` を新規作成
  - `DecisionRequest` (frozen dataclass): user_id / user_input / selected_persona_ids / llm_provider
  - `PersonaUtterance` (frozen dataclass): persona_id / persona_name / text
  - `ConsensusOutput` (frozen dataclass): domain_classification / utterances / proposal_text
  - `SilenceVerdict` (frozen dataclass): is_silenced / domain (Literal) / response_text
  - `StreamEvent` (frozen dataclass): type (str) / data (dict)
- [ ] **B.3** `apps/api/src/yesman_api/domain/decision/errors.py` を新規作成
  - `class DecisionError(Exception)`: `reason: str`, `detail: str | None`
- [ ] **B.4** `apps/api/src/yesman_api/application/decision/__init__.py` (空)
- [ ] **B.5** `apps/api/src/yesman_api/application/decision/llm_provider.py` を新規作成 (ultrathink I3 反映 2026-05-16)
  - `@runtime_checkable class LLMProviderAdapter(Protocol)`: `complete` / `stream` / `aclose`
  - **`stream` メソッド本体に `if False: yield ""` を含める** — これは **Python typing 上 AsyncGenerator として認識させるための慣習** (Protocol で AsyncIterator 型を返すことを型チェッカーに伝える)。実装ミスを避けるためコメントで明記
- [ ] **B.6** `apps/api/src/yesman_api/application/decision/event_publisher.py` を新規作成
  - `@runtime_checkable class EventPublisher(Protocol)`: `publish_decision_confirmed` / `aclose`

### Phase B 完了基準
- [ ] AST parse OK (6 ファイル)
- [ ] `python3 -c "from yesman_api.domain.decision.models import *; from yesman_api.application.decision.llm_provider import LLMProviderAdapter; from yesman_api.application.decision.event_publisher import EventPublisher"` 通る

---

## 5. Phase C: LLMProvider 実装 + Factory (4 ファイル)

### Phase C タスク

- [ ] **C.1** `infrastructure/decision/__init__.py` + `llm_providers/__init__.py` (空 × 2)
- [ ] **C.2** `infrastructure/decision/llm_providers/bedrock_adapter.py`
  - `BedrockLLMAdapter` (NFR Design §2.2 + I2 反映)
  - `complete` + `stream` + `_guardrail_kwargs` (LiteLLM 1.55+ パターン)
  - retry 1 回 (200ms backoff)、`litellm.exceptions.Timeout` → `DecisionError("llm_timeout")`
- [ ] **C.3** `infrastructure/decision/llm_providers/mock_adapter.py`
  - `MockLLMProvider` (NFR Design §2.3 + I4 反映)
  - `DEFAULT_OUTPUT` XML, `SILENCE_OUTPUT`, `stream_delay_seconds=0.0`, `chunk_size=10` 可変
- [ ] **C.4** `infrastructure/decision/llm_providers/factory.py`
  - `LLMProviderFactory(config)` — config.llm_provider dispatch、create + dispose

### Phase C 完了基準
- [ ] AST parse OK (4 ファイル)
- [ ] `LLMProviderFactory(config)` で MockLLMProvider が取得できる (Bedrock は AWS 認証なしでテスト不能、Phase H で test)

---

## 6. Phase D: EventPublisher 実装 + Factory (4 ファイル)

### Phase D タスク

- [ ] **D.1** `infrastructure/decision/event_publishers/__init__.py` (空)
- [ ] **D.2** `event_publishers/eventbridge_publisher.py`
  - `EventBridgePublisher` (NFR Design §7.2 + Imp2 反映)
  - `boto3.session.Session(region_name=...)` で独立 Session
  - `asyncio.to_thread(self._client.put_events, ...)` で非同期化
- [ ] **D.3** `event_publishers/inline_async_publisher.py`
  - `InlineAsyncPublisher` — async コールバックを直接実行 (U5 が同一プロセスにいる dev/test 用)
  - 実装シンプル: `__init__(self, handler: Callable[..., Awaitable[None]] | None = None)`、handler 無ければ log のみ
- [ ] **D.4** `event_publishers/sync_publisher.py`
  - `SyncPublisher` — no-op (MVP / Mock backend)、structured log で「dispatched=sync」記録のみ
- [ ] **D.5** `event_publishers/factory.py`
  - `EventPublisherFactory(config)` — config.event_backend dispatch

### Phase D 完了基準
- [ ] AST parse OK (5 ファイル)
- [ ] 3 backend 全て instantiate 可能 (EventBridge は boto3 init のみ、実 API 呼ばない)

---

## 7. Phase E: SilenceGuard + ConsensusOrchestrator + tee_chunks (3 ファイル)

### Phase E タスク

- [ ] **E.1** `domain/decision/silence_guard.py`
  - `SILENCE_KEYWORDS` (4 ドメイン × 15 語、計 60 語)
  - `class SilenceGuard(*, llm, salt)`: regex fast path + LLM 自己判定 fail-closed (I1 反映)
  - `_silence_response()` 固定文 + `compute_input_hash(*, user_id, user_input)` sha256
- [ ] **E.2** `domain/decision/consensus.py`
  - `PROMPT_TEMPLATE` + `USER_INPUT_TEMPLATE` 区切りトークン (SEC-U4-12)
  - `class ConsensusOrchestrator`:
    - `build_prompt(*, personas, profile_yaml)` + `_escape_persona_name` (Imp1 反映)
    - `parse(llm_output, *, personas) -> ConsensusOutput` (regex + 部分抽出)
    - `stream_parse(chunks, *, personas) -> AsyncIterator[StreamEvent]` (state 3 分離、C1 反映)
  - `tee_chunks(source, *, n=2, max_buffer=256)` (NFR Design §8.3 + I3 反映)

### Phase E 完了基準
- [ ] AST parse OK (2 ファイル)
- [ ] `SilenceGuard` + `MockLLMProvider` で `evaluate("宗教について")` が `is_silenced=True` を返す (regex 直撃確認)
- [ ] `ConsensusOrchestrator.parse(MockLLMProvider.DEFAULT_OUTPUT, personas=[builtin 3 種])` が `ConsensusOutput(utterances 3 個 + proposal)` を返す

---

## 8. Phase F: DecisionEngine + Nudge + Scorer (3 ファイル)

### Phase F タスク

- [ ] **F.1** `domain/decision/engine.py`
  - `class DecisionEngine(*, llm, orchestrator, silence_guard, decision_repo, silence_repo, persona_repo, profile_repo, event_publisher, config)`:
    - `run(request)` — 非ストリーミング (SilenceGuard → Persona → Profile → orchestrator → LLM → parse → DecisionRepository.insert)
    - `run_stream(*, decision_id, ...)` — ストリーミング (tee_chunks + asyncio.create_task で background 永続化)
    - `apply_choice(*, decision_id, user_id, choice)` — Yes/No 採択 + count_no_by_user 取得 + update_choice + EventPublisher.publish_decision_confirmed (Yes/No 両方発火、I6 反映) + 内部で No 再合議は触らない (再合議は別 API call)
- [ ] **F.2** `domain/decision/nudge.py`
  - `CachedNudge` dataclass + `class NudgeCache(*, ttl)` (MAX_ENTRIES 1000 + `_maybe_evict`、I5 反映)
  - `class NudgeMessageGenerator(*, llm, cache)`:
    - `generate(*, decision_id, proposal_text, choice, no_streak)` — BackgroundTasks 起動、PII フィルタ済プロンプト
- [ ] **F.3** `domain/decision/scorer.py`
  - `class AutonomyScorer(*, decision_repo)`:
    - `compute(user_id)` → ScoreSummary (no_count / total / ratio / message)
    - `total == 0` → ratio=null、`> 0` → round(no_count/total, 3)

### Phase F 完了基準
- [ ] AST parse OK (3 ファイル)
- [ ] `DecisionEngine.run(request)` を MockLLMProvider + Mock Repo で実行 → `ConsensusOutput` 返却 + Decision 永続化を確認 (Phase H で test)

---

## 9. Phase G: interface (4 ファイル) + deps 拡張

### Phase G タスク

- [ ] **G.1** `interface/http/dto/decision.py` を新規作成
  - `DecisionRequestDTO`: `user_input: str = Field(max_length=100_000)` (NFR Req I2 反映、Imp5 113 reject) + `selected_persona_ids: list[UUID] | None = None`
  - `DecisionResponse`: `decision_id` / `domain` / `utterances` / `proposal_text` / `nudge_url` / `no_attempt_count`
  - `ChoiceRequest`: `choice: Literal["yes", "no"]`
  - `ChoiceResponse`: `decision_id` / `nudge_url` / `no_attempt_count`
  - `NudgeResponse`: `status: Literal["pending", "ready", "failed"]` / `message: str | None`
  - `ScoreResponse`: `no_count` / `total` / `ratio: float | None` / `message: str`
- [ ] **G.2** `interface/http/decisions.py` を新規作成
  - 4 endpoint: `POST /v1/decisions/request` / `request/stream` / `{id}/choice` / GET `{id}/nudge`
  - 各エンドポイントで PII フィルタ + 所有者検証 (SEC-U4-09)
  - SSE は `StreamingResponse` + `_sse(event, data)` helper
  - Nudge ready は `200` / pending は `202` / TTL 切れは **`410` Gone** (Imp3 反映)
- [ ] **G.3** `interface/http/scores.py` を新規作成
  - GET `/v1/scores/me`
- [ ] **G.4** `interface/deps.py` を変更
  - 追加: `get_decision_engine` / `get_llm_provider` / `get_event_publisher` / `get_nudge_cache` / `get_nudge_generator` / `get_silence_guard` / `get_consensus_orchestrator` / `get_autonomy_scorer`
  - 各々 `request.app.state.*` から取得

### Phase G 完了基準
- [ ] AST parse OK (3 新規 + 1 変更)
- [ ] router を import して `len(decisions_router.routes) == 4` and `len(scores_router.routes) == 1` を確認

---

## 10. Phase H: main.py 完成版 (1 ファイル)

### Phase H タスク

- [ ] **H.1** `apps/api/src/yesman_api/main.py` を変更
  - lifespan で **6 factory + cache** 初期化:
    - RepositoryFactory (U2)
    - AuthBackendFactory (U3)
    - LLMProviderFactory (U4 新規)
    - EventPublisherFactory (U4 新規)
    - SilenceGuard インスタンス (LLMProviderFactory.create() + config.silence_hash_salt から)
    - ConsensusOrchestrator インスタンス (stateless)
    - DecisionEngine インスタンス (全依存 inject)
    - NudgeCache インスタンス (config.nudge_cache_ttl_seconds)
    - NudgeMessageGenerator インスタンス (llm + cache)
    - AutonomyScorer インスタンス (decision_repo は per-request、Scorer 自体は stateless)
  - shutdown で 4 factory + LLM/Event の aclose
  - middleware order (CORS 外側 / Auth 内側、U3 確立済) 維持
  - `app.include_router(decisions_router)` + `app.include_router(scores_router)` 追加

### Phase H 完了基準 (ultrathink I2 反映 2026-05-16: nudge polling は最大 3 秒 retry)
- [ ] AST parse OK
- [ ] `uvicorn yesman_api.main:app --port 8000` で起動 (Mock backend、AUTH_BACKEND=mock + LLM_PROVIDER=mock)
- [ ] 動作確認 7 curl パターン (Infra Design §9.1):
  - `/health` 200
  - `POST /v1/decisions/request` 200 + decision_id
  - `POST /v1/decisions/request/stream` SSE event stream
  - `POST /v1/decisions/{id}/choice {yes}` 200 + nudge_url 即時返却
  - **`GET /v1/decisions/{id}/nudge` を最大 3 回 retry (各 1 秒空け、合計 3 秒)** で `status: ready` 200 (1 回目で 202 pending の場合は retry)
  - `GET /v1/scores/me` 200
  - 沈黙ガード: `POST /v1/decisions/request {"宗教について"}` 200 + silenced
- [ ] Integration テスト (Phase I で詳細) では `pytest-asyncio` + `asyncio.sleep(0)` で BackgroundTasks 完了を非ブロッキング待ち

---

## 11. Phase I: テスト + ドキュメント + pyproject + CDK (新規 17 + 変更 4)

### Phase I.1: テストフィクスチャ + Unit (10 ファイル、ultrathink I4 + Imp2 反映)

- [ ] **I.1.1** `tests/fixtures/decision.py` を新規作成 — **具体的 fixture 5 種**:
  - `decision_request_factory(user_input, selected_persona_ids=[]) -> DecisionRequest`
  - `consensus_output_factory(domain="daily", proposal="...", utterances=[]) -> ConsensusOutput`
  - `silence_verdict_factory(is_silenced=False, domain=None) -> SilenceVerdict`
  - `mock_llm_provider_factory(override=None, stream_delay=0.0) -> MockLLMProvider`
  - `builtin_personas` fixture — 3 種の Persona dataclass を直接構築 (DB アクセス不要、Mock store と整合)
- [ ] **I.1.2** `tests/unit/decision/__init__.py`
- [ ] **I.1.3** `tests/unit/decision/test_silence_guard.py` (regex 4 ドメイン + LLM 自己判定 + fail-closed + hash)
- [ ] **I.1.4** `tests/unit/decision/test_consensus.py` (TestParse + TestStreamParse 2 クラス、I2 反映)
- [ ] **I.1.5** `tests/unit/decision/test_mock_llm.py` (complete / stream / delay 可変)
- [ ] **I.1.6** `tests/unit/decision/test_engine.py` (沈黙パス / 通常パス / No 再合議 / no_attempt_count)
- [ ] **I.1.7** `tests/unit/decision/test_nudge.py` (Yes/No streak / cache pending/ready/failed / TTL + evict)
- [ ] **I.1.8** `tests/unit/decision/test_scorer.py` (total=0 null / pending 除外 / 通常 ratio)
- [ ] **I.1.9** `tests/unit/decision/test_event_publisher.py` (3 backend + Yes/No 両方発火)
- [ ] **I.1.10** `tests/unit/decision/test_llm_timeout.py` (complete / stream initial / stream total)
- [ ] **I.1.11** `tests/unit/shared/test_pii_filter.py` (email / phone JP / phone US / CC Luhn / passthrough)

### Phase I.2: Integration (3 ファイル)

- [ ] **I.2.1** `tests/integration/decision/__init__.py`
- [ ] **I.2.2** `tests/integration/decision/test_decision_flow.py` (Mock LLM + Mock Repo E2E)
- [ ] **I.2.3** `tests/integration/decision/test_sse_stream.py` (SSE chunk 順序 + start decision_id 事前確定)
- [ ] **I.2.4** `tests/integration/decision/test_sse_disconnect.py` (切断後 DecisionRepository.get 永続化確認)

### Phase I.3: Contract + PBT (5 ファイル)

- [ ] **I.3.1** `tests/contract/test_llm_provider_protocol.py` (Bedrock + Mock の isinstance)
- [ ] **I.3.2** `tests/contract/test_event_publisher_protocol.py` (3 backend の isinstance)
- [ ] **I.3.3** `tests/property/test_parser_robustness.py` (任意文字列 → ConsensusOutput)
- [ ] **I.3.4** `tests/property/test_silence_guard_input.py` (任意 input → SilenceVerdict)
- [ ] **I.3.5** `tests/property/test_silence_guard_llm_output.py` (Mock LLM 任意出力)
- [ ] **I.3.6** `tests/property/test_prompt_size_bound.py` (100k 文字超は API 入口 413)

### Phase I.4: ドキュメント + pyproject + CDK (4 ファイル)

- [ ] **I.4.1** `apps/api/pyproject.toml` に `litellm>=1.55,<2.0` 追加 (Infra Design Imp4 反映)
- [ ] **I.4.2** `apps/api/.env.example` に U4 12 環境変数追加 (Infra Design §7 + I4 反映 secret 注釈)
- [ ] **I.4.3** `apps/api/RUNBOOK.md` に **§8 U4 / decision** 章追記 (U3 が §7、U4 が §8 で順序整合、ultrathink Imp1 反映)
  - 認証 backend + LLM backend 切替表
  - **7 curl パターン** (Phase H 完了基準と整合)
  - SSE 動作確認手順
  - Bedrock IAM 設定確認手順
  - Nudge polling の retry 戦略 (最大 3 秒)
- [ ] **I.4.4** `infra/lib/stacks/api-stack.ts` を変更 (Infra Design §4 + I1 反映)
  - SilenceHashSaltSecret を ApiStack 内で生成
  - environment +12 個追加
  - secrets ブロックに `SILENCE_HASH_SALT` 追加
  - IAM `events:PutEvents` 権限を eventBusArn に限定で追加
- [ ] **I.4.5** `infra/test/api-stack.test.ts` を更新 (ultrathink Imp4 反映: diff 確認項目具体化)
  - `cd infra && pnpm test -- --updateSnapshot` で snapshot 更新
  - **diff 確認項目** (commit 前のレビュー):
    - environment: 新規 **12 項目** (`LOG_LEVEL` を含む既存 U3 拡張 + `BEDROCK_*` × 4 + `DECISION_LLM_*` × 4 + `NUDGE_*` × 2 + `EVENT_BACKEND` / `BEDROCK_REGION` 等を整理)
    - secrets: 新規 **1 項目** (`SILENCE_HASH_SALT` — Secrets Manager `yesman/{env}/silence-hash-salt`)
    - IAM Policy: 新規 **1 項目** (`events:PutEvents` on `eventBusArn` のみ、最小権限)
    - Secrets Manager resource: 新規 **1 個** (`SilenceHashSaltSecret`)

### Phase I 完了基準
- [ ] `pytest apps/api/tests/unit/decision tests/unit/shared/test_pii_filter.py` 全 pass
- [ ] `pytest apps/api/tests/integration/decision tests/contract tests/property` 全 pass (PG 必要、Mock 経路では Integration skip 可)
- [ ] `cd infra && pnpm test -- --updateSnapshot && cdk synth` 成功

---

## 12. 動作確認 (Phase H/I 完了後の最終確認)

```bash
# 1. 依存解決
cd apps/api && pip install -e ".[dev]"

# 2. Mock backend 起動
cp .env.example .env  # LLM_PROVIDER=mock / EVENT_BACKEND=sync / AUTH_BACKEND=mock
uvicorn yesman_api.main:app --port 8000

# 3. 6 curl 動作確認 (Infra Design §9.1)
HEADERS=(-H "Authorization: Bearer anything" -H "Content-Type: application/json")

curl -i http://localhost:8000/health
curl -i -X POST "${HEADERS[@]}" -d '{"user_input": "今日のランチを決めて"}' http://localhost:8000/v1/decisions/request
curl -N -X POST "${HEADERS[@]}" -d '{"user_input": "今日のランチを決めて"}' http://localhost:8000/v1/decisions/request/stream

# decision_id を最後のレスポンスから取得
DECISION_ID=...
curl -i -X POST "${HEADERS[@]}" -d '{"choice": "yes"}' http://localhost:8000/v1/decisions/$DECISION_ID/choice
sleep 2
curl -i -H "Authorization: Bearer anything" http://localhost:8000/v1/decisions/$DECISION_ID/nudge
curl -i -H "Authorization: Bearer anything" http://localhost:8000/v1/scores/me

# 沈黙ガード確認
curl -i -X POST "${HEADERS[@]}" -d '{"user_input": "宗教について教えて"}' http://localhost:8000/v1/decisions/request

# 4. テスト一括実行
pytest apps/api/tests/

# 5. CDK synth (SSM ブートストラップ済前提)
cd infra && pnpm test -- --updateSnapshot && cdk synth
```

---

## 13. リスク

| リスク | 影響 | 対応 |
|---|---|---|
| LiteLLM 1.55+ で Bedrock Guardrails 引数形式が変更 | BedrockLLMAdapter 動作不能 | NFR Design §2.2 で 3 候補列挙 (`extra_body` / `bedrock_runtime_kwargs` / boto3 直接)、実装時に動作確認 |
| Bedrock Haiku が ap-northeast-1 で未対応 (古い AWS account) | LLM 呼び出し失敗 | `BEDROCK_REGION=us-east-1` への切替で対応、RUNBOOK §8 に注記 |
| U2 `count_no_by_user` が pending を含む実装 | AutonomyScorer の ratio が不正確 | Phase A.0 で確認 + 条件付き patch (確認結果次第で +2 ファイル) |
| SSE 切断時の background task が detach されない (asyncio runtime 依存) | FR-CV-09 (切断後永続化) 失敗 | **AVAIL-U4-07 で best-effort 宣言済** (process 内生存中のみ、ECS 終了で喪失)。本番 SLO として **CloudWatch metric `decision.background_persist_success`** で計測、95%+ 目標。ultrathink I5 反映 |
| Bedrock IAM Role が未設定で起動 | 本番起動失敗 | U1 CDK で IAM Role 付与済、validate_runtime で `LLM_PROVIDER=bedrock` 時の region/model 必須化 |

---

## 14. 承認チェックリスト

- [x] Phase A.0〜I の 10 段階タスクが checkbox 形式で列挙
- [x] 各 Phase の完了基準が明示 (AST parse / import / curl / pytest)
- [x] U2 遡及 patch 計画 (Phase A.0、条件付き)
- [x] U1 CDK 修正計画 (api-stack 単独、Infra Design I1 反映)
- [x] 動作確認手順 5 ステップ + 7 curl パターン + **Nudge 最大 3 秒 retry**
- [x] リスク 5 項目 + 緩和策 + **CloudWatch metric 計測項目**
- [x] 全ファイル集計: 新規 23 + 変更 3 + shared/constants 2 + **テスト 18 + fixture 1** + ドキュメント 2 + pyproject 1 + CDK 1 = **約 48 ファイル** (U2 patch 条件付き +0-2)
- [x] ultrathink 全反映の引き継ぎ (FD 13 + NFR Req 12 + NFR Design 11 + Infra Design 9 + Code Gen Plan 9 = 計 **54 件**)

### ultrathink レビュー (2026-05-16) 反映済 9 件
- **Important 5**:
  - I1: Phase A 完了基準を AppConfig() 初期化のみに、validate_runtime 動作確認は Phase I に分離
  - I2: Phase H Nudge polling を最大 3 秒 retry 明示、pytest-asyncio で BackgroundTasks 完了を非ブロッキング待ち
  - I3: Phase B.5 LLMProviderAdapter Protocol の `if False: yield ""` を Python typing 慣習として明記
  - I4: テスト集計を 17 → 18 (Unit 9 + Integration 3 + Contract 2 + PBT 4) に統一
  - I5: §13 SSE detach リスクを AVAIL-U4-07 best-effort 既定 + CloudWatch metric 計測項目明示
- **Improvements 4**:
  - Imp1: RUNBOOK §8 ラベル明確化 (U3 §7 / U4 §8 順序)
  - Imp2: tests/fixtures/decision.py の具体 5 fixture 列挙
  - Imp3: pii_filter テストは tests/unit/shared/ 配下 (確認のみ、修正不要)
  - Imp4: snapshot diff 確認項目を 4 種に具体化 (environment 12 + secrets 1 + IAM 1 + Secret resource 1)
