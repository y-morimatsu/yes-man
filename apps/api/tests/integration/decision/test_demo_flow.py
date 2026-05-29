"""Integration: demo mode (email=morimatsu) の合議 e2e.

DemoLLMAdapter + 妻/娘/ワンコ ペルソナで run_stream を回し、scripted な
合議台詞 / 外出着→Amazon Fashion / 深掘り / 沈黙 を end-to-end で検証する。
Mock backend (DB 不要)。
"""
from __future__ import annotations

from uuid import uuid4

import pytest

from yesman_api.domain.decision import demo_mode
from yesman_api.domain.decision.consensus import ConsensusOrchestrator
from yesman_api.domain.decision.engine import DecisionEngine
from yesman_api.domain.decision.models import DecisionRequest, SelectedPersonaRef
from yesman_api.domain.decision.silence_guard import SilenceGuard
from yesman_api.domain.persistence.models import Persona
from yesman_api.infrastructure.decision.llm_providers.demo_adapter import DemoLLMAdapter
from yesman_api.infrastructure.decision.llm_providers.mock_adapter import MockLLMProvider


# --- minimal stubs (DB 不要) ---
class _SilenceRepoStub:
    async def insert(self, log): return log
    async def list_by_user(self, user_id, limit=100): return []
    async def count_by_domain(self, user_id): return {}


class _ProfileRepoStub:
    async def get(self, user_id): return None
    async def upsert(self, profile): return profile


class _DemoPersonaRepoStub:
    """妻/娘/ワンコ の demo persona を返す persona repo."""

    async def get(self, persona_id):
        for dp in demo_mode.DEMO_PERSONAS:
            if dp.id == persona_id:
                return Persona(
                    id=dp.id,
                    owner_user_id=uuid4(),
                    name=dp.name,
                    description="demo",
                    prompt_text=dp.prompt_text,
                    is_shared=False,
                    is_builtin=False,
                )
        return None

    async def list_by_owner(self, owner_id, include_deleted=False): return []
    async def insert(self, persona): return persona


class _DecisionRepoStub:
    def __init__(self): self.decisions = {}
    async def insert(self, decision):
        self.decisions[decision.id] = decision
        return decision
    async def get(self, decision_id): return self.decisions.get(decision_id)
    async def count_no_by_user(self, user_id): return {"no_count": 0, "total": 0}
    async def list_by_user(self, **kwargs): return []


class _EventPubStub:
    backend_name = "sync"
    async def publish_decision_confirmed(self, **kwargs): pass
    async def aclose(self): pass


def _make_demo_engine():
    llm = DemoLLMAdapter(MockLLMProvider())
    return DecisionEngine(
        llm=llm,
        orchestrator=ConsensusOrchestrator(),
        silence_guard=SilenceGuard(llm=llm, salt="test-salt"),
        decision_repo=_DecisionRepoStub(),
        silence_repo=_SilenceRepoStub(),
        persona_repo=_DemoPersonaRepoStub(),
        profile_repo=_ProfileRepoStub(),
        event_publisher=_EventPubStub(),
    )


def _demo_request(user_input: str, chain=()):
    return DecisionRequest(
        user_id=uuid4(),
        user_input=user_input,
        selected_personas=tuple(
            SelectedPersonaRef(source="my", id=pid) for pid in demo_mode.DEMO_PERSONA_IDS
        ),
        chain_context=tuple(chain),
    )


async def _collect(engine, request):
    return [e async for e in engine.run_stream(decision_id=uuid4(), request=request)]


# ============================================================
# 02 合議「外出着」 (root)
# ============================================================
@pytest.mark.asyncio
@pytest.mark.integration
async def test_outfit_consensus_personas_and_lines():
    engine = _make_demo_engine()
    events = await _collect(engine, _demo_request("外出着は何にすべき?"))

    personas_ev = next(e for e in events if e.type == "personas")
    names = {p["name"] for p in personas_ev.data["personas"]}
    assert names == {"妻", "娘", "ワンコ"}

    utt = {e.data["persona_name"]: e.data["text"] for e in events if e.type == "utterance"}
    assert "襟付き" in utt["妻"] or "パーカー" in utt["妻"]
    assert "去年" in utt["娘"]
    assert utt["ワンコ"] == "ワン!"


@pytest.mark.asyncio
@pytest.mark.integration
async def test_outfit_root_proposal_soft_with_fashion_service():
    engine = _make_demo_engine()
    events = await _collect(engine, _demo_request("外出着は何にすべき?"))
    prop = next(e for e in events if e.type == "proposal")
    assert "シャツ" in prop.data["proposal_text"]
    assert prop.data["is_final"] is False  # root は drill-down 起点
    assert prop.data["service"] is not None
    assert prop.data["service"]["category"] == "fashion"
    assert "Amazon" in prop.data["service"]["name"]


@pytest.mark.asyncio
@pytest.mark.integration
async def test_outfit_drilled_proposal_final_amazon():
    """Yes 連鎖 (chain_context あり) で final 化 + Amazon Fashion CTA."""
    engine = _make_demo_engine()
    events = await _collect(engine, _demo_request("外出着は何にすべき?", chain=("襟付きシャツ",)))
    prop = next(e for e in events if e.type == "proposal")
    assert "開きますか" in prop.data["proposal_text"]
    assert prop.data["is_final"] is True
    assert prop.data["service"]["category"] == "fashion"


# ============================================================
# 05 深掘り「最近の俺、どう?」
# ============================================================
@pytest.mark.asyncio
@pytest.mark.integration
async def test_deep_dive_proposal():
    engine = _make_demo_engine()
    events = await _collect(engine, _demo_request("最近の俺、どう?"))
    prop = next(e for e in events if e.type == "proposal")
    assert "委任度 73%" in prop.data["proposal_text"]


# ============================================================
# 04 沈黙「宗教」
# ============================================================
@pytest.mark.asyncio
@pytest.mark.integration
async def test_silence_on_religion():
    engine = _make_demo_engine()
    events = await _collect(engine, _demo_request("宗教って入った方がいい?"))
    types = [e.type for e in events]
    assert "silence" in types
    assert "proposal" not in types
