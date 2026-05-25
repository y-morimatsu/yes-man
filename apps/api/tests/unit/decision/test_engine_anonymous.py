"""DecisionEngine — v3-γ anonymous-strangers path (Task 2).

検証項目:
- anonymous source 時、self + 2 sampled = 3 personas が emit される
- fixture spec は LLM 呼ばずに hardcoded utterance を直接 emit (FR-3 hybrid)
- self_spec (LLM 経路) は plain text 日本語を utterance.text に乗せる
- token streaming (utterance_delta) は emit されない (FR-3 / NFR-2)
- pool=None → "anonymous_pool_unavailable" error event
- 永続化: selected_persona_ids=[] + persona_outputs.source="anonymous"

2026-05-24: 「原文を表示」機能 + 口グセ削除に伴い、original/translation_ja JSON は廃止.
LLM は plain text 日本語を返す前提に変更.
"""
from __future__ import annotations

from uuid import UUID, uuid4

import pytest

from yesman_api.domain.decision.consensus import ConsensusOrchestrator
from yesman_api.domain.decision.engine import DecisionEngine
from yesman_api.domain.decision.models import DecisionRequest, StreamEvent
from yesman_api.domain.decision.silence_guard import SilenceGuard
from yesman_api.domain.persistence.models import PreferenceProfile
from yesman_api.fixtures.anonymous_pool_seed import FIXTURE_POOL
from yesman_api.infrastructure.persistence.mock_pool_repository import (
    MockPoolRepository,
)


# ============================================================
# Test doubles
# ============================================================
class _FakeAnonymousLLM:
    """anonymous persona prompt 専用 mock — plain text 日本語応答を override 可能.

    呼び出し回数を計測 (fixture path で LLM 呼ばれない検証用).
    2026-05-24: 原文表示機能削除に伴い、JSON ではなく plain text を返す.
    """

    provider_name = "mock-anon"

    def __init__(
        self,
        *,
        anonymous_text: str | None = None,
        proposal_text: str = "それで決めましょう。",
        silence_response: str = '{"is_silenced": false}',
    ) -> None:
        self._anonymous_text = anonymous_text or "EN でのテスト発話。"
        self._proposal_text = proposal_text
        self._silence_response = silence_response
        self.calls: list[dict] = []  # call log

    async def complete(self, *, system, messages, temperature=0.7):
        self.calls.append({"system": system, "messages": messages})
        # SilenceGuard 用 prompt (沈黙 domain 判定): JSON 返す
        if "is_silenced" in system or "沈黙" in system or "silence" in system.lower():
            return self._silence_response
        # proposal prompt
        if "最終的な助言" in system or "最終助言" in system:
            return self._proposal_text
        # anonymous persona prompt (plain text 期待)
        if "あなたは" in system and "価値観" in system:
            return self._anonymous_text
        return "default-mock-response"

    async def stream(self, **kwargs):
        # anonymous 経路では呼ばれない想定だが、Protocol 要件
        if False:
            yield ""

    async def aclose(self):
        pass


class _DecisionRepoStub:
    def __init__(self):
        self.decisions: dict[UUID, object] = {}
        self._no_count = 0
        self._total = 0

    async def insert(self, decision):
        self.decisions[decision.id] = decision
        return decision

    async def update_choice(self, decision_id, choice, no_count):
        d = self.decisions[decision_id]
        d.user_choice = choice
        d.no_attempt_count = no_count
        return d

    async def get(self, decision_id):
        return self.decisions.get(decision_id)

    async def count_no_by_user(self, user_id):
        return {"no_count": 0, "total": 0}

    async def list_by_user(self, **kwargs):
        return []

    async def search_by_input_hash(self, **kwargs):
        return []


class _SilenceRepoStub:
    async def insert(self, log):
        return log

    async def list_by_user(self, user_id, limit=100):
        return []

    async def count_by_domain(self, user_id):
        return {}


class _PersonaRepoStub:
    async def list_by_owner(self, owner_id, include_deleted=False):
        return []

    async def get(self, persona_id):
        return None

    async def insert(self, persona):
        return persona

    async def update(self, persona):
        return persona

    async def soft_delete(self, persona_id):
        pass

    async def list_shared(self, **kwargs):
        return []

    async def record_usage(self, persona_id, was_yes):
        pass

    async def block(self, persona_id):
        pass


class _ProfileRepoStub:
    async def get(self, user_id):
        return None

    async def upsert(self, profile):
        return profile

    async def delete(self, user_id):
        pass


class _PreferenceRepoStub:
    """preference を返さない (= self_spec は空 value_tags)."""

    async def get(self, user_id):
        return None

    async def upsert(self, profile):
        return profile

    async def delete(self, user_id):
        pass


class _EventPubStub:
    backend_name = "sync"

    def __init__(self):
        self.published = []

    async def publish_decision_confirmed(self, **kwargs):
        self.published.append(kwargs)

    async def aclose(self):
        pass


_SENTINEL = object()


def _make_engine(
    *,
    llm: _FakeAnonymousLLM | None = None,
    pool_repo=_SENTINEL,  # 明示的に None を渡すと pool 無し engine ができる
    decision_repo: _DecisionRepoStub | None = None,
    preference_repo: _PreferenceRepoStub | None = None,
) -> DecisionEngine:
    llm = llm or _FakeAnonymousLLM()
    if pool_repo is _SENTINEL:
        pool_repo = MockPoolRepository(seed_fixtures=True)
    return DecisionEngine(
        llm=llm,
        orchestrator=ConsensusOrchestrator(),
        # SilenceGuard も同じ LLM stub を使う (is_silenced=false を返す)
        silence_guard=SilenceGuard(llm=llm, salt="test-salt"),
        decision_repo=decision_repo or _DecisionRepoStub(),
        silence_repo=_SilenceRepoStub(),
        persona_repo=_PersonaRepoStub(),
        profile_repo=_ProfileRepoStub(),
        event_publisher=_EventPubStub(),
        preference_repo=preference_repo,
        pool_repo=pool_repo,
    )


def _anonymous_request(user_id: UUID | None = None) -> DecisionRequest:
    return DecisionRequest(
        user_id=user_id or uuid4(),
        user_input="今日のランチを決めて",
        persona_source="anonymous",
    )


async def _collect(engine, *, decision_id, request) -> list[StreamEvent]:
    return [e async for e in engine.run_stream(decision_id=decision_id, request=request)]


# ============================================================
# pool=None → error
# ============================================================
@pytest.mark.asyncio
async def test_anonymous_pool_none_yields_error():
    engine = _make_engine(pool_repo=None)
    events = await _collect(engine, decision_id=uuid4(), request=_anonymous_request())
    assert len(events) == 1
    assert events[0].type == "error"
    assert events[0].data["reason"] == "anonymous_pool_unavailable"


# ============================================================
# Normal anonymous path
# ============================================================
@pytest.mark.asyncio
async def test_anonymous_path_yields_3_personas():
    """self (1) + sampled (2) = 3 personas が emit される."""
    engine = _make_engine()
    events = await _collect(engine, decision_id=uuid4(), request=_anonymous_request())
    personas_events = [e for e in events if e.type == "personas"]
    assert len(personas_events) == 1
    personas = personas_events[0].data["personas"]
    assert len(personas) == 3
    assert personas[0]["name"] == "あなたの声"
    assert personas[1]["name"] == "世界の誰か #1"
    assert personas[2]["name"] == "世界の誰か #2"


@pytest.mark.asyncio
async def test_no_utterance_delta_emitted_in_anonymous_path():
    """FR-3 / NFR-2: anonymous 経路では token streaming (utterance_delta) は emit されない."""
    engine = _make_engine()
    events = await _collect(engine, decision_id=uuid4(), request=_anonymous_request())
    delta_events = [e for e in events if e.type == "utterance_delta"]
    assert delta_events == []


@pytest.mark.asyncio
async def test_anonymous_utterance_carries_metadata():
    """utterance event payload に primary_language / formality 含む (2026-05-24: original 廃止)."""
    engine = _make_engine()
    events = await _collect(engine, decision_id=uuid4(), request=_anonymous_request())
    utterance_events = [e for e in events if e.type == "utterance"]
    assert len(utterance_events) == 3
    for ue in utterance_events:
        data = ue.data
        # 2026-05-24: original 廃止
        assert "original" not in data
        assert "primary_language" in data
        assert "formality" in data
        assert data["primary_language"] in {"ja", "en", "fr", "ar", "zh"}
        assert data["formality"] in {"polite", "casual", "blunt"}


@pytest.mark.asyncio
async def test_fixture_personas_do_not_invoke_llm():
    """fixture spec は LLM 呼ばずに hardcoded を使う (call count で検証)."""
    llm = _FakeAnonymousLLM()
    # pool に fixture 5 のみ → sample で必ず fixture から 2 件 sampled
    engine = _make_engine(llm=llm)
    await _collect(engine, decision_id=uuid4(), request=_anonymous_request())

    # LLM 呼び出しの分類: self_spec (1) + proposal (1) + SilenceGuard (1) = 3 max
    # fixture spec 2 は呼ばれない (= 4 件目以降の anonymous prompt は 0)
    anonymous_prompt_calls = [
        c for c in llm.calls if "あなたは" in c["system"] and "価値観" in c["system"]
    ]
    # self_spec の 1 件のみ (sampled 2 は fixture)
    assert len(anonymous_prompt_calls) == 1, (
        f"expected 1 anonymous prompt (self only), got {len(anonymous_prompt_calls)}"
    )


@pytest.mark.asyncio
async def test_fixture_personas_emit_hardcoded_utterance():
    """fixture spec の utterance text が anonymous_pool_seed.fixture_utterances() と一致."""
    engine = _make_engine()
    events = await _collect(engine, decision_id=uuid4(), request=_anonymous_request())
    utterance_events = [e for e in events if e.type == "utterance"]
    fixture_texts = {fix.utterance_sample.text for fix in FIXTURE_POOL}
    matched = [
        ue for ue in utterance_events if ue.data.get("text") in fixture_texts
    ]
    assert len(matched) >= 1, "no utterance matched any fixture sample"


# ============================================================
# LLM plain text 経路 (2026-05-24: JSON 廃止)
# ============================================================
@pytest.mark.asyncio
async def test_llm_plain_text_response_lands_in_text_field():
    """LLM の plain text 応答が utterance.text にそのまま乗る."""
    llm = _FakeAnonymousLLM(anonymous_text="こんにちは世界")
    engine = _make_engine(llm=llm)
    events = await _collect(engine, decision_id=uuid4(), request=_anonymous_request())
    self_utterance = next(
        (e for e in events if e.type == "utterance" and e.data["persona_name"] == "あなたの声"),
        None,
    )
    assert self_utterance is not None
    assert self_utterance.data["text"] == "こんにちは世界"


@pytest.mark.asyncio
async def test_llm_code_fence_is_stripped():
    """```...``` 囲みは strip される (LLM の典型出力)."""
    llm = _FakeAnonymousLLM(anonymous_text="```\nやあ\n```")
    engine = _make_engine(llm=llm)
    events = await _collect(engine, decision_id=uuid4(), request=_anonymous_request())
    self_utterance = next(
        (e for e in events if e.type == "utterance" and e.data["persona_name"] == "あなたの声"),
        None,
    )
    assert self_utterance is not None
    assert self_utterance.data["text"] == "やあ"


@pytest.mark.asyncio
async def test_llm_legacy_json_format_still_extracts_translation_ja():
    """旧 JSON 形式 (LLM の癖で稀に発生) も translation_ja を抽出して text に乗せる (後方互換)."""
    llm = _FakeAnonymousLLM(
        anonymous_text='{"original": "Hello", "translation_ja": "こんにちは"}'
    )
    engine = _make_engine(llm=llm)
    events = await _collect(engine, decision_id=uuid4(), request=_anonymous_request())
    self_utterance = next(
        (e for e in events if e.type == "utterance" and e.data["persona_name"] == "あなたの声"),
        None,
    )
    assert self_utterance is not None
    assert self_utterance.data["text"] == "こんにちは"


# ============================================================
# Proposal + persistence
# ============================================================
@pytest.mark.asyncio
async def test_anonymous_emits_proposal_and_complete():
    engine = _make_engine()
    events = await _collect(engine, decision_id=uuid4(), request=_anonymous_request())
    types = [e.type for e in events]
    assert "proposal" in types
    assert types[-1] == "complete"
    proposal = next(e for e in events if e.type == "proposal")
    assert "proposal_text" in proposal.data
    assert "is_final" in proposal.data
    assert "depth" in proposal.data


@pytest.mark.asyncio
async def test_anonymous_persists_with_empty_selected_persona_ids():
    """anonymous 経路で永続化される Decision は selected_persona_ids=[] かつ persona_outputs.source='anonymous'."""
    repo = _DecisionRepoStub()
    engine = _make_engine(decision_repo=repo)
    decision_id = uuid4()
    await _collect(engine, decision_id=decision_id, request=_anonymous_request())
    persisted = repo.decisions.get(decision_id)
    assert persisted is not None
    assert persisted.selected_persona_ids == []
    assert persisted.persona_outputs.get("source") == "anonymous"
    # utterances field も入っている
    assert "utterances" in persisted.persona_outputs


# ============================================================
# I-4: chain_context が anonymous prompt に inject される
# ============================================================
@pytest.mark.asyncio
async def test_chain_context_injected_into_anonymous_prompt():
    """drill-down chain_context が self_spec の LLM prompt に取り込まれる (I-4 fix)."""
    llm = _FakeAnonymousLLM()
    engine = _make_engine(llm=llm)
    request = DecisionRequest(
        user_id=uuid4(),
        user_input="映画を見たい",
        persona_source="anonymous",
        chain_context=("映画を見る", "ホラー映画にする"),
    )
    await _collect(engine, decision_id=uuid4(), request=request)
    # self_spec の LLM call (anonymous prompt) を探す
    anonymous_calls = [
        c for c in llm.calls if "あなたは" in c["system"] and "価値観" in c["system"]
    ]
    assert len(anonymous_calls) == 1
    prompt = anonymous_calls[0]["system"]
    # chain_context が prompt に含まれる
    assert "映画を見る" in prompt
    assert "ホラー映画にする" in prompt
    assert "これまでの絞り込み" in prompt
    # depth=2 ガイド: subtype 絞り込み or 次段階の指示
    assert "subtype" in prompt or "絞り込み" in prompt or "instance" in prompt


@pytest.mark.asyncio
async def test_no_chain_context_no_drill_down_guide_in_prompt():
    """chain_context 空ならガイド文言は出ない (regression check)."""
    llm = _FakeAnonymousLLM()
    engine = _make_engine(llm=llm)
    await _collect(engine, decision_id=uuid4(), request=_anonymous_request())
    anonymous_calls = [
        c for c in llm.calls if "あなたは" in c["system"] and "価値観" in c["system"]
    ]
    assert len(anonymous_calls) == 1
    prompt = anonymous_calls[0]["system"]
    assert "これまでの絞り込み" not in prompt


# ============================================================
# I-5: 空 preference user の self_spec が default fallback される
# ============================================================
@pytest.mark.asyncio
async def test_empty_preference_self_spec_uses_fallback():
    """signal_total=0 の self_spec は default value_tags でハイドレートされる (I-5 fix).

    LLM prompt が「(未設定)」だらけになるのを防ぎ、blank persona UX 崩れを抑止.
    2026-05-24: 口グセ仕様削除に伴い、default 値は value_tags のみ.
    """
    llm = _FakeAnonymousLLM()
    engine = _make_engine(llm=llm)  # _PreferenceRepoStub は preference 返さない = empty
    await _collect(engine, decision_id=uuid4(), request=_anonymous_request())
    anonymous_calls = [
        c for c in llm.calls if "あなたは" in c["system"] and "価値観" in c["system"]
    ]
    assert len(anonymous_calls) == 1
    prompt = anonymous_calls[0]["system"]
    # default fallback の tags が prompt に含まれる
    assert "迷い中" in prompt or "新規" in prompt
    # 「(未設定)」placeholder は使われない
    assert "(未設定)" not in prompt


@pytest.mark.asyncio
async def test_builtin_path_unaffected_by_anonymous_changes():
    """default persona_source='builtin' は anonymous 関連 change の影響を受けない (regression check).

    PersonaRepoStub が builtin を返さないので DecisionError("no_personas") を raise するが、
    これは「builtin 経路に正しく分岐した」証拠 (anonymous branch なら error event を yield して
    raise しない). _resolve_personas を通過したという事実が regression check として機能する.
    """
    from yesman_api.domain.decision.errors import DecisionError

    llm = _FakeAnonymousLLM()
    engine = _make_engine(llm=llm)
    request = DecisionRequest(user_id=uuid4(), user_input="ランチ")  # default = "builtin"
    assert request.persona_source == "builtin"

    with pytest.raises(DecisionError) as excinfo:
        async for _ in engine.run_stream(decision_id=uuid4(), request=request):
            pass
    # builtin path は _resolve_personas → no builtin seeded → "no_personas" raise
    assert excinfo.value.reason == "no_personas"
