"""Integration: Decision Yes/No → PreferenceProfile 学習 (U-Test FD §3.1).

DecisionEngine.run + apply_choice 後、apply_yes/apply_no を経由した
PreferenceProfile への incremental update を verify.

MVP: SyncPublisher は no-op のため、本テストは builder を直接呼んで cross-unit
(U4 Decision → U5 PreferenceProfile) flow を検証する.
prod path (eventbridge → SQS → Consumer) は test_consumer_eventbridge_path.py で別途.
"""
from __future__ import annotations

from uuid import UUID

import pytest

from yesman_api.domain.decision.consensus import ConsensusOrchestrator
from yesman_api.domain.decision.engine import DecisionEngine
from yesman_api.domain.decision.models import DecisionRequest
from yesman_api.domain.decision.silence_guard import SilenceGuard
from yesman_api.domain.learning.builder import apply_no, apply_yes
from yesman_api.domain.persistence.constants import SYSTEM_USER_ID
from yesman_api.domain.persistence.models import Persona, PreferenceProfile
from yesman_api.infrastructure.decision.llm_providers.mock_adapter import MockLLMProvider


class _NullEventPublisher:
    backend_name = "test-null"

    async def publish_decision_confirmed(self, **kwargs) -> None:
        return None

    async def aclose(self) -> None:
        return None


async def _build_decision_with_yes(
    repo_bundle, user_id: UUID
) -> tuple[UUID, "Decision"]:  # type: ignore[name-defined]
    """Helper: builtin persona seed + DecisionEngine.run + apply_choice(yes)."""
    builtin = Persona(
        owner_user_id=SYSTEM_USER_ID,
        name="慎重派",
        description="慎重に判断",
        prompt_text="慎重に検討してください" * 2,
        is_shared=True,
        is_builtin=True,
    )
    await repo_bundle.persona.insert(builtin)

    llm = MockLLMProvider()
    silence_guard = SilenceGuard(llm=llm, salt="integration-salt")
    engine = DecisionEngine(
        llm=llm,
        orchestrator=ConsensusOrchestrator(),
        silence_guard=silence_guard,
        decision_repo=repo_bundle.decision,
        silence_repo=repo_bundle.silence,
        persona_repo=repo_bundle.persona,
        profile_repo=repo_bundle.profile,
        event_publisher=_NullEventPublisher(),
        preference_loader=None,
    )

    decision_id, _, _ = await engine.run(
        DecisionRequest(user_id=user_id, user_input="今日のお昼ご飯どうしようか")
    )
    updated, _ = await engine.apply_choice(
        decision_id=decision_id, user_id=user_id, choice="yes"
    )
    return decision_id, updated


@pytest.mark.asyncio
async def test_decision_yes_updates_preference_via_builder(repo_bundle, test_user_id: str):
    """Yes 採択 → apply_yes 経由で accepted_patterns + persona_style_preference が更新される."""
    user_id = UUID(test_user_id)
    _, decision = await _build_decision_with_yes(repo_bundle, user_id)
    assert decision.user_choice == "yes"

    # 初期 PreferenceProfile (空) → apply_yes
    initial = PreferenceProfile(user_id=user_id)
    updated = apply_yes(initial, decision)
    await repo_bundle.preference.upsert(updated)

    # 永続化検証
    persisted = await repo_bundle.preference.get(user_id)
    assert persisted is not None
    assert len(persisted.accepted_patterns) == 1
    pattern = persisted.accepted_patterns[0]
    assert pattern["domain"] == decision.domain_classification
    assert pattern["decision_id"] == str(decision.id)
    assert "慎重派" in pattern["persona_names"]

    # persona_style_preference: +0.1 (NFR Design §1.2 PERSONA_STYLE_YES_DELTA)
    assert persisted.persona_style_preference.get("慎重派") == pytest.approx(0.1)


@pytest.mark.asyncio
async def test_decision_no_updates_preference_rejected_only(
    repo_bundle, test_user_id: str
):
    """No 採択 → rejected_patterns に追加、accepted は変化しない、persona delta は -0.05."""
    user_id = UUID(test_user_id)

    # Decision を直接 insert (apply_choice の no path をテスト)
    builtin = Persona(
        owner_user_id=SYSTEM_USER_ID,
        name="楽観派",
        description="楽観的に判断",
        prompt_text="楽観的に検討してください" * 2,
        is_shared=True,
        is_builtin=True,
    )
    await repo_bundle.persona.insert(builtin)

    llm = MockLLMProvider()
    silence_guard = SilenceGuard(llm=llm, salt="integration-salt")
    engine = DecisionEngine(
        llm=llm,
        orchestrator=ConsensusOrchestrator(),
        silence_guard=silence_guard,
        decision_repo=repo_bundle.decision,
        silence_repo=repo_bundle.silence,
        persona_repo=repo_bundle.persona,
        profile_repo=repo_bundle.profile,
        event_publisher=_NullEventPublisher(),
        preference_loader=None,
    )
    decision_id, _, _ = await engine.run(
        DecisionRequest(user_id=user_id, user_input="この提案どうしようか")
    )
    decision, _ = await engine.apply_choice(
        decision_id=decision_id, user_id=user_id, choice="no"
    )

    # PreferenceProfile に apply_no を適用
    initial = PreferenceProfile(user_id=user_id)
    updated = apply_no(initial, decision)
    await repo_bundle.preference.upsert(updated)

    persisted = await repo_bundle.preference.get(user_id)
    assert persisted is not None
    assert len(persisted.rejected_patterns) == 1
    assert len(persisted.accepted_patterns) == 0  # No では accepted 更新しない
    assert persisted.rejected_patterns[0]["decision_id"] == str(decision_id)

    # persona_style_preference: -0.05 (NFR Design §1.2 PERSONA_STYLE_NO_DELTA)
    assert persisted.persona_style_preference.get("楽観派") == pytest.approx(-0.05)


@pytest.mark.asyncio
async def test_decision_yes_then_no_persona_style_aggregation(
    repo_bundle, test_user_id: str
):
    """同一 persona に Yes + No 連続 → persona_style_preference は +0.1 - 0.05 = +0.05."""
    user_id = UUID(test_user_id)
    _, first = await _build_decision_with_yes(repo_bundle, user_id)

    # 2 回目 Decision で No 採択
    llm = MockLLMProvider()
    silence_guard = SilenceGuard(llm=llm, salt="integration-salt")
    engine = DecisionEngine(
        llm=llm,
        orchestrator=ConsensusOrchestrator(),
        silence_guard=silence_guard,
        decision_repo=repo_bundle.decision,
        silence_repo=repo_bundle.silence,
        persona_repo=repo_bundle.persona,
        profile_repo=repo_bundle.profile,
        event_publisher=_NullEventPublisher(),
        preference_loader=None,
    )
    decision_id2, _, _ = await engine.run(
        DecisionRequest(user_id=user_id, user_input="次の判断はどうしよう")
    )
    second, _ = await engine.apply_choice(
        decision_id=decision_id2, user_id=user_id, choice="no"
    )

    # Yes 適用後 No 適用 (順次)
    profile = PreferenceProfile(user_id=user_id)
    profile = apply_yes(profile, first)
    profile = apply_no(profile, second)
    await repo_bundle.preference.upsert(profile)

    persisted = await repo_bundle.preference.get(user_id)
    assert persisted is not None
    assert len(persisted.accepted_patterns) == 1
    assert len(persisted.rejected_patterns) == 1
    # 同一 persona に +0.1 -0.05 → +0.05 (clip 範囲内)
    assert persisted.persona_style_preference.get("慎重派") == pytest.approx(0.05)
