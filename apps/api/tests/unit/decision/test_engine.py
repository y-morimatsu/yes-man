"""DecisionEngine — 沈黙パス / 通常パス / Yes/No 採択 / EventPublisher 発火 / no_attempt_count."""
from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid4

import pytest

from tests.fixtures.decision import builtin_personas, decision_request_factory, mock_llm_provider_factory
from yesman_api.domain.decision.consensus import ConsensusOrchestrator
from yesman_api.domain.decision.engine import DecisionEngine
from yesman_api.domain.decision.silence_guard import SilenceGuard
from yesman_api.infrastructure.config import AppConfig
from yesman_api.infrastructure.decision.llm_providers.mock_adapter import MockLLMProvider


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


def _make_engine(*, llm=None, decision_repo=None, config=None):
    llm = llm or mock_llm_provider_factory()
    decision_repo = decision_repo or _FakeRepo()
    kwargs = dict(
        llm=llm,
        orchestrator=ConsensusOrchestrator(),
        silence_guard=SilenceGuard(llm=llm, salt="x"),
        decision_repo=decision_repo,
        silence_repo=_SilenceRepoStub(),
        persona_repo=_PersonaRepoStub(),
        profile_repo=_ProfileRepoStub(),
        event_publisher=_EventPubStub(),
    )
    if config is not None:
        kwargs["config"] = config
    return DecisionEngine(**kwargs)


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
    """spec 2026-05-21: parallel consensus → utterance 3 件 + proposal が yield + DecisionRepository に insert される."""
    repo = _FakeRepo()
    engine = _make_engine(decision_repo=repo)
    req = decision_request_factory(user_input="今日のランチを決めて")
    decision_id = uuid4()
    events = [e async for e in engine.run_stream(decision_id=decision_id, request=req)]
    types = [e.type for e in events]
    assert types.count("utterance") == 3
    assert types.count("proposal") == 1
    assert types[-1] == "complete"
    assert decision_id in repo.decisions
    persisted = repo.decisions[decision_id]
    assert persisted.user_input == "今日のランチを決めて"
    assert persisted.proposal_text  # non-empty


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


class TestRunStreamParallel:
    """spec 2026-05-21 parallel-persona-consensus §11.2."""

    @pytest.mark.asyncio
    async def test_parallel_utterances_arrival(self):
        """3 persona 並列で utterance event 3 件 + proposal + complete が yield される (順序非依存、set 比較)."""
        repo = _FakeRepo()
        engine = _make_engine(decision_repo=repo)
        request = decision_request_factory(user_input="今日のランチを決めて")
        decision_id = uuid4()

        events = [e async for e in engine.run_stream(decision_id=decision_id, request=request)]
        types = [e.type for e in events]

        utterance_personas = {e.data["persona_name"] for e in events if e.type == "utterance"}
        assert utterance_personas == {"慎重派", "楽観派", "効率派"}
        assert types.count("proposal") == 1
        assert types.count("complete") == 1
        assert types[-1] == "complete"

    @pytest.mark.asyncio
    async def test_persona_arrival_order_with_delay(self):
        """deterministic delay で慎重派 → 楽観派 → 効率派 の順に utterance event."""
        llm = MockLLMProvider(persona_delays={"慎重派": 0.01, "楽観派": 0.05, "効率派": 0.10})
        engine = _make_engine(llm=llm)
        request = decision_request_factory(user_input="test")
        decision_id = uuid4()

        utterance_events = []
        async for e in engine.run_stream(decision_id=decision_id, request=request):
            if e.type == "utterance":
                utterance_events.append(e.data["persona_name"])

        assert utterance_events == ["慎重派", "楽観派", "効率派"]

    @pytest.mark.asyncio
    async def test_one_persona_timeout_degraded(self):
        """1 persona timeout → 残り 2 utterance + 1 proposal が yield される."""
        llm = MockLLMProvider(persona_delays={"慎重派": 5.0})
        config = AppConfig(decision_llm_per_persona_timeout_seconds=0.1)
        engine = _make_engine(llm=llm, config=config)
        request = decision_request_factory(user_input="test")
        decision_id = uuid4()

        events = [e async for e in engine.run_stream(decision_id=decision_id, request=request)]
        # Post-CONSTRUCTION v3 (2026-05-23): utterance event は失敗 persona も含めて 3 件 emit
        # (frontend bubble の「発言中…」状態解除のため)。本物の text を持つのは 2 件。
        utterance_events = [e for e in events if e.type == "utterance"]
        assert {e.data["persona_name"] for e in utterance_events} == {
            "慎重派", "楽観派", "効率派",
        }
        successful = [e for e in utterance_events if e.data["text"]]
        assert {e.data["persona_name"] for e in successful} == {"楽観派", "効率派"}
        assert sum(1 for e in events if e.type == "proposal") == 1
        assert sum(1 for e in events if e.type == "complete") == 1
        assert sum(1 for e in events if e.type == "error") == 0

    @pytest.mark.asyncio
    async def test_utterance_delta_events_emitted(self):
        """Post-CONSTRUCTION v3 (2026-05-23): token streaming.

        各 persona について utterance_delta event が 1 件以上、
        最後の delta の後に utterance event が yield される。
        delta を順に結合した raw text と utterance event の text (cleaned) が
        whitespace 差以外で一致する。
        """
        llm = MockLLMProvider(chunk_size=5)  # 短 chunk で複数 delta を強制
        engine = _make_engine(llm=llm)
        request = decision_request_factory(user_input="今日のランチを決めて")
        decision_id = uuid4()

        events = [
            e async for e in engine.run_stream(decision_id=decision_id, request=request)
        ]

        # utterance_delta が各 persona ごとに >= 1 件
        delta_by_persona: dict[str, list[str]] = {}
        for e in events:
            if e.type == "utterance_delta":
                delta_by_persona.setdefault(e.data["persona_name"], []).append(
                    e.data["text"]
                )
        assert set(delta_by_persona.keys()) == {"慎重派", "楽観派", "効率派"}
        for chunks in delta_by_persona.values():
            assert len(chunks) >= 2, "chunk_size=5 で複数 delta が emit されるはず"

        # 各 persona について最後の delta の後に utterance が来る
        for persona_name in delta_by_persona:
            indices = [
                i
                for i, e in enumerate(events)
                if (e.type == "utterance_delta" or e.type == "utterance")
                and e.data["persona_name"] == persona_name
            ]
            assert events[indices[-1]].type == "utterance", (
                f"{persona_name}: last event should be utterance (final), got "
                f"{events[indices[-1]].type}"
            )

        # final utterance の text と delta 結合結果 (raw) は cleaned 差を除き一致
        for e in events:
            if e.type != "utterance":
                continue
            raw = "".join(delta_by_persona[e.data["persona_name"]])
            # clean_utterance_output は prefix 除去 + strip + 200字制限のみ。
            # raw に含まれる「{name}の意見:」prefix を除去後、strip して一致するはず。
            from yesman_api.domain.decision.consensus import clean_utterance_output

            assert e.data["text"] == clean_utterance_output(raw)

    @pytest.mark.asyncio
    async def test_all_personas_timeout(self):
        """全 persona timeout → error event + no proposal + no complete."""
        llm = MockLLMProvider(persona_delays={"慎重派": 5.0, "楽観派": 5.0, "効率派": 5.0})
        config = AppConfig(decision_llm_per_persona_timeout_seconds=0.1)
        engine = _make_engine(llm=llm, config=config)
        request = decision_request_factory(user_input="test")
        decision_id = uuid4()

        events = [e async for e in engine.run_stream(decision_id=decision_id, request=request)]
        error_events = [e for e in events if e.type == "error"]
        assert len(error_events) == 1
        assert error_events[0].data["reason"] == "all_personas_failed"
        assert sum(1 for e in events if e.type == "proposal") == 0
        assert sum(1 for e in events if e.type == "complete") == 0
