"""SSE event 順序検証 — start → utterance × N → proposal → complete.

spec 2026-05-21 parallel-persona-consensus §11.3 / §4.2 に準拠:
- domain event は廃止 (spec §4.2 で廃止、Frontend の switch 文にも case 無し)
- utterance event は parallel 完了順 (非決定性) → set 比較で 3 件到着を verify
- start は handler 側が送出 (engine.run_stream の外)、ここでは engine 出力を検証

Mock LLM + Mock Repo で DB / 実 LLM 不要。
"""
from __future__ import annotations

import json
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


# ---------------------------------------------------------------------------
# Minimal stubs
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
    def __init__(self): self.decisions: dict = {}
    async def insert(self, decision):
        self.decisions[decision.id] = decision
        return decision
    async def update_choice(self, decision_id, choice, no_count):
        d = self.decisions[decision_id]
        d.user_choice = choice
        return d
    async def get(self, decision_id): return self.decisions.get(decision_id)
    async def count_no_by_user(self, user_id): return {"no_count": 0, "total": 0}
    async def list_by_user(self, **kwargs): return []
    async def search_by_input_hash(self, **kwargs): return []


class _EventPubStub:
    backend_name = "sync"
    def __init__(self): self.published = []
    async def publish_decision_confirmed(self, **kwargs): self.published.append(kwargs)
    async def aclose(self): pass


def _make_engine():
    llm = mock_llm_provider_factory()
    return DecisionEngine(
        llm=llm,
        orchestrator=ConsensusOrchestrator(),
        silence_guard=SilenceGuard(llm=llm, salt="test-salt"),
        decision_repo=_DecisionRepoStub(),
        silence_repo=_SilenceRepoStub(),
        persona_repo=_PersonaRepoStub(),
        profile_repo=_ProfileRepoStub(),
        event_publisher=_EventPubStub(),
    )


def _simulate_sse_format(events: list) -> list[dict]:
    """StreamEvent list を SSE 行形式に変換してパースする (handler の _sse() を模倣).

    実際の SSE handler は:
      yield f"event: {event.type}\\ndata: {json.dumps(event.data)}\\n\\n"
    これと同じ処理を simulate し、integration レベルで検証する。
    """
    parsed = []
    for e in events:
        raw = f"event: {e.type}\ndata: {json.dumps(e.data, ensure_ascii=False)}\n\n"
        lines = raw.strip().split("\n")
        event_type = None
        data_str = None
        for line in lines:
            if line.startswith("event: "):
                event_type = line[len("event: "):]
            elif line.startswith("data: "):
                data_str = line[len("data: "):]
        if event_type is not None:
            parsed.append({
                "type": event_type,
                "data": json.loads(data_str) if data_str else {},
            })
    return parsed


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
@pytest.mark.integration
async def test_sse_event_order_no_domain():
    """spec §4.2: domain event は廃止。utterance × 3 + proposal + complete が到着する。"""
    engine = _make_engine()
    request = decision_request_factory(user_input="今日のランチを決めて")
    decision_id = uuid4()

    # engine.run_stream の出力を収集 (handler の start event は engine 外で送出)
    events = [e async for e in engine.run_stream(decision_id=decision_id, request=request)]
    sse_events = _simulate_sse_format(events)
    types = [e["type"] for e in sse_events]

    # domain event は出ない (spec §4.2 で廃止)
    assert "domain" not in types, f"domain event must not appear. types={types}"

    # utterance × 3 — set 比較 (parallel 完了順は非決定性)
    utterance_names = {
        e["data"]["persona_name"]
        for e in sse_events
        if e["type"] == "utterance"
    }
    assert utterance_names == {"慎重派", "楽観派", "効率派"}, (
        f"Expected 3 persona utterances, got: {utterance_names}"
    )

    # proposal × 1
    assert sum(1 for e in sse_events if e["type"] == "proposal") == 1

    # complete は最後
    assert types[-1] == "complete", f"Last SSE event must be 'complete', got: {types[-1]}"


@pytest.mark.asyncio
@pytest.mark.integration
async def test_sse_utterance_count_equals_three():
    """utterance event はちょうど 3 件 (persona 3 体に対応)."""
    engine = _make_engine()
    request = decision_request_factory(user_input="週末の計画を決めて")
    decision_id = uuid4()

    events = [e async for e in engine.run_stream(decision_id=decision_id, request=request)]
    utterance_count = sum(1 for e in events if e.type == "utterance")

    assert utterance_count == 3, f"Expected 3 utterance events, got {utterance_count}"


@pytest.mark.asyncio
@pytest.mark.integration
async def test_sse_proposal_contains_text():
    """proposal event の proposal_text が非空."""
    engine = _make_engine()
    request = decision_request_factory(user_input="夕食のメニューを決めて")
    decision_id = uuid4()

    events = [e async for e in engine.run_stream(decision_id=decision_id, request=request)]
    proposal_events = [e for e in events if e.type == "proposal"]

    assert len(proposal_events) == 1
    assert proposal_events[0].data.get("proposal_text"), "proposal_text must be non-empty"
