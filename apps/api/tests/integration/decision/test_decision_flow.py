"""Integration: DecisionEngine.run_stream — parallel persona consensus の event 順序検証.

spec 2026-05-21 parallel-persona-consensus §11.3 に準拠:
- domain event は廃止 (spec §4.2)
- utterance event は完了順 (非決定性) → set 比較
- start (handler 側) → utterance × N → proposal → complete の構造のみ verify

Mock LLM + Mock Repository で DB 不要。
"""
from __future__ import annotations

from uuid import uuid4

import pytest

from tests.fixtures.decision import (
    builtin_personas,
    decision_request_factory,
    mock_llm_provider_factory,
)
from yesman_api.domain.decision.consensus import ConsensusOrchestrator
from yesman_api.domain.decision.engine import DecisionEngine
from yesman_api.domain.decision.silence_guard import SilenceGuard
from yesman_api.infrastructure.decision.llm_providers.mock_adapter import MockLLMProvider


# ---------------------------------------------------------------------------
# Minimal stubs (DB 不要)
# ---------------------------------------------------------------------------

class _SilenceRepoStub:
    async def insert(self, log): return log
    async def list_by_user(self, user_id, limit=100): return []
    async def count_by_domain(self, user_id): return {}


class _ProfileRepoStub:
    async def get(self, user_id): return None
    async def upsert(self, profile): return profile
    async def delete(self, user_id): pass


class _PersonaRepoStub:
    async def list_by_owner(self, owner_id, include_deleted=False):
        return builtin_personas()

    async def get(self, persona_id):
        for p in builtin_personas():
            if p.id == persona_id:
                return p
        return None

    async def insert(self, persona): return persona
    async def update(self, persona): return persona
    async def soft_delete(self, persona_id): pass
    async def list_shared(self, **kwargs): return []
    async def record_usage(self, persona_id, was_yes): pass
    async def block(self, persona_id): pass


class _DecisionRepoStub:
    def __init__(self):
        self.decisions: dict = {}

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

    async def list_by_user(self, **kwargs): return []
    async def search_by_input_hash(self, **kwargs): return []


class _EventPubStub:
    backend_name = "sync"
    def __init__(self): self.published = []
    async def publish_decision_confirmed(self, **kwargs): self.published.append(kwargs)
    async def aclose(self): pass


def _make_engine(*, llm=None, decision_repo=None):
    llm = llm or mock_llm_provider_factory()
    decision_repo = decision_repo or _DecisionRepoStub()
    return DecisionEngine(
        llm=llm,
        orchestrator=ConsensusOrchestrator(),
        silence_guard=SilenceGuard(llm=llm, salt="test-salt"),
        decision_repo=decision_repo,
        silence_repo=_SilenceRepoStub(),
        persona_repo=_PersonaRepoStub(),
        profile_repo=_ProfileRepoStub(),
        event_publisher=_EventPubStub(),
    )


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
@pytest.mark.integration
async def test_run_stream_event_sequence_no_domain():
    """spec §11.3: utterance × 3 + proposal + complete が yield、domain event は出ない."""
    engine = _make_engine()
    request = decision_request_factory(user_input="今日のランチを決めて")
    decision_id = uuid4()

    events = [e async for e in engine.run_stream(decision_id=decision_id, request=request)]
    types = [e.type for e in events]

    # domain event は廃止 (spec §4.2)
    assert "domain" not in types, f"domain event should not be emitted, got: {types}"

    # utterance × 3 (set 比較 — 並列完了順は非決定性)
    utterance_events = [e for e in events if e.type == "utterance"]
    utterance_personas = {e.data["persona_name"] for e in utterance_events}
    assert utterance_personas == {"慎重派", "楽観派", "効率派"}, (
        f"Expected 3 persona utterances, got: {utterance_personas}"
    )

    # proposal × 1
    assert types.count("proposal") == 1, f"Expected 1 proposal event, got: {types}"

    # complete は最後
    assert types[-1] == "complete", f"Last event should be 'complete', got: {types[-1]}"


@pytest.mark.asyncio
@pytest.mark.integration
async def test_run_stream_utterance_data_fields():
    """各 utterance event が persona_id / persona_name / text を持つ."""
    engine = _make_engine()
    request = decision_request_factory(user_input="明日の予定を決めて")
    decision_id = uuid4()

    events = [e async for e in engine.run_stream(decision_id=decision_id, request=request)]
    utterance_events = [e for e in events if e.type == "utterance"]

    assert len(utterance_events) == 3
    for e in utterance_events:
        assert "persona_id" in e.data
        assert "persona_name" in e.data
        assert "text" in e.data
        assert e.data["text"]  # non-empty


@pytest.mark.asyncio
@pytest.mark.integration
async def test_run_stream_proposal_after_all_utterances():
    """proposal event は全 utterance event の後に来る."""
    engine = _make_engine()
    request = decision_request_factory(user_input="週末の旅行先を決めて")
    decision_id = uuid4()

    events = [e async for e in engine.run_stream(decision_id=decision_id, request=request)]
    types = [e.type for e in events]

    # proposal index は utterance の最後より後にある
    utterance_indices = [i for i, t in enumerate(types) if t == "utterance"]
    proposal_indices = [i for i, t in enumerate(types) if t == "proposal"]
    assert proposal_indices, "proposal event must be present"
    assert max(utterance_indices) < min(proposal_indices), (
        f"proposal must come after all utterances. types={types}"
    )


@pytest.mark.asyncio
@pytest.mark.integration
async def test_run_stream_all_personas_failed_yields_error():
    """全 persona が失敗 (timeout) → error event (reason=all_personas_failed) のみ."""
    from yesman_api.infrastructure.config import AppConfig

    llm = MockLLMProvider(persona_delays={"慎重派": 5.0, "楽観派": 5.0, "効率派": 5.0})
    config = AppConfig(decision_llm_per_persona_timeout_seconds=0.05)
    engine = _make_engine(llm=llm)
    # AppConfig を直接注入できないため engine を再構築
    engine2 = DecisionEngine(
        llm=llm,
        orchestrator=ConsensusOrchestrator(),
        silence_guard=SilenceGuard(llm=llm, salt="test-salt"),
        decision_repo=_DecisionRepoStub(),
        silence_repo=_SilenceRepoStub(),
        persona_repo=_PersonaRepoStub(),
        profile_repo=_ProfileRepoStub(),
        event_publisher=_EventPubStub(),
        config=config,
    )
    request = decision_request_factory(user_input="test")
    decision_id = uuid4()

    events = [e async for e in engine2.run_stream(decision_id=decision_id, request=request)]
    error_events = [e for e in events if e.type == "error"]

    assert len(error_events) == 1, f"Expected 1 error event, got: {[e.type for e in events]}"
    assert error_events[0].data["reason"] == "all_personas_failed"
    assert sum(1 for e in events if e.type == "proposal") == 0
    assert sum(1 for e in events if e.type == "complete") == 0
