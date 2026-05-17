"""DecisionEngine — 沈黙パス / 通常パス / Yes/No 採択 / EventPublisher 発火 / no_attempt_count."""
from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid4

import pytest

from tests.fixtures.decision import builtin_personas, decision_request_factory, mock_llm_provider_factory
from yesman_api.domain.decision.consensus import ConsensusOrchestrator
from yesman_api.domain.decision.engine import DecisionEngine
from yesman_api.domain.decision.silence_guard import SilenceGuard


class _FakeRepo:
    """最小限の Mock Repository (decision_repo / silence_repo / persona_repo / profile_repo 用)."""

    def __init__(self):
        self.decisions: dict[UUID, object] = {}
        self.silence_logs = []
        self.profile = None
        self._no_count = 0
        self._total = 0

    # DecisionRepository
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
        return {"no_count": self._no_count, "total": self._total}

    async def list_by_user(self, **kwargs):
        return []

    async def search_by_input_hash(self, **kwargs):
        return []

    # SilenceLogRepository
    async def insert_silence(self, log):
        self.silence_logs.append(log)
        return log

    # PersonaRepository
    async def list_by_owner(self, owner_id, include_deleted=False):
        return builtin_personas()

    async def persona_get(self, persona_id):
        for p in builtin_personas():
            if p.id == persona_id:
                return p
        return None

    # ProfileRepository
    async def profile_get(self, user_id):
        return self.profile


class _SilenceRepoStub:
    def __init__(self):
        self.logs = []

    async def insert(self, log):
        self.logs.append(log)
        return log

    async def list_by_user(self, user_id, limit=100):
        return []

    async def count_by_domain(self, user_id):
        return {}


class _ProfileRepoStub:
    async def get(self, user_id):
        return None

    async def upsert(self, profile):
        return profile

    async def delete(self, user_id):
        pass


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


class _EventPubStub:
    backend_name = "sync"

    def __init__(self):
        self.published = []

    async def publish_decision_confirmed(self, **kwargs):
        self.published.append(kwargs)

    async def aclose(self):
        pass


def _make_engine(*, llm=None, decision_repo=None):
    llm = llm or mock_llm_provider_factory()
    decision_repo = decision_repo or _FakeRepo()
    return DecisionEngine(
        llm=llm,
        orchestrator=ConsensusOrchestrator(),
        silence_guard=SilenceGuard(llm=llm, salt="x"),
        decision_repo=decision_repo,
        silence_repo=_SilenceRepoStub(),
        persona_repo=_PersonaRepoStub(),
        profile_repo=_ProfileRepoStub(),
        event_publisher=_EventPubStub(),
    )


@pytest.mark.asyncio
async def test_silence_path_skips_decision_persist():
    repo = _FakeRepo()
    engine = _make_engine(decision_repo=repo)
    req = decision_request_factory(user_input="宗教について")
    decision_id, consensus, no_count = await engine.run(req)
    assert consensus.domain_classification == "silenced"
    assert decision_id not in repo.decisions  # Decision は永続化されない


@pytest.mark.asyncio
async def test_normal_path_persists_decision():
    repo = _FakeRepo()
    engine = _make_engine(decision_repo=repo)
    req = decision_request_factory(user_input="今日のランチ")
    decision_id, consensus, _ = await engine.run(req)
    assert decision_id in repo.decisions
    assert consensus.proposal_text


@pytest.mark.asyncio
async def test_apply_choice_yes_publishes_event():
    repo = _FakeRepo()
    pub = _EventPubStub()
    engine = DecisionEngine(
        llm=mock_llm_provider_factory(),
        orchestrator=ConsensusOrchestrator(),
        silence_guard=SilenceGuard(llm=mock_llm_provider_factory(), salt="x"),
        decision_repo=repo,
        silence_repo=_SilenceRepoStub(),
        persona_repo=_PersonaRepoStub(),
        profile_repo=_ProfileRepoStub(),
        event_publisher=pub,
    )
    user_id = uuid4()
    req = decision_request_factory(user_id=user_id, user_input="ランチ")
    decision_id, _, _ = await engine.run(req)
    _, no_count = await engine.apply_choice(
        decision_id=decision_id, user_id=user_id, choice="yes"
    )
    assert len(pub.published) == 1
    assert pub.published[0]["choice"] == "yes"
