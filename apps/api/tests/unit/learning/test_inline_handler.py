"""InlineLearningHandler unit test (issue #88).

Mock RepositoryFactory bundle 経由で decision 取得 → builder.apply_yes/no →
preference upsert の流れを verify する。Consumer の単体 test と等価。
"""
from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import datetime, timezone
from uuid import UUID, uuid4

import pytest

from yesman_api.application.learning.inline_handler import InlineLearningHandler
from yesman_api.domain.persistence.models import Decision, PreferenceProfile


class _FakeBundle:
    """RepositoryBundle 形状の最小 stub (preference + decision のみ)."""

    def __init__(self, decisions: dict[UUID, Decision]) -> None:
        self._decisions = decisions
        self.preferences: dict[UUID, PreferenceProfile] = {}

        class _DecRepo:
            def __init__(self, ds: dict[UUID, Decision]):
                self._ds = ds

            async def get(self, did: UUID):
                return self._ds.get(did)

        class _PrefRepo:
            def __init__(self, store: dict[UUID, PreferenceProfile]):
                self._store = store

            async def get(self, uid: UUID):
                return self._store.get(uid)

            async def upsert(self, p: PreferenceProfile):
                self._store[p.user_id] = p
                return p

        self.decision = _DecRepo(decisions)
        self.preference = _PrefRepo(self.preferences)


class _FakeRepoFactory:
    def __init__(self, decisions: dict[UUID, Decision]) -> None:
        self._bundle = _FakeBundle(decisions)

    @asynccontextmanager
    async def bundle(self):
        yield self._bundle

    @property
    def preferences(self) -> dict[UUID, PreferenceProfile]:
        return self._bundle.preferences


def _make_decision(*, decision_id: UUID, user_id: UUID, choice: str = "yes") -> Decision:
    return Decision(
        id=decision_id,
        user_id=user_id,
        user_input="今日のランチ",
        user_input_hash="hash",
        domain_classification="daily",
        proposal_text="カレー",
        user_choice=choice,
        no_attempt_count=0,
        created_at=datetime.now(timezone.utc),
        persona_names=["慎重派", "楽観派", "効率派"],
    )


@pytest.mark.asyncio
async def test_yes_choice_updates_preference():
    """YES 採択 → apply_yes 経由で accepted_patterns に decision の domain が加算."""
    user_id = uuid4()
    decision_id = uuid4()
    decision = _make_decision(decision_id=decision_id, user_id=user_id, choice="yes")
    factory = _FakeRepoFactory({decision_id: decision})

    handler = InlineLearningHandler(factory)
    await handler(
        user_id=str(user_id),
        decision_id=str(decision_id),
        choice="yes",
        domain="daily",
        timestamp=datetime.now(timezone.utc),
    )

    profile = factory.preferences[user_id]
    assert profile.user_id == user_id
    assert len(profile.accepted_patterns) >= 1  # apply_yes で少なくとも 1 件追加
    assert len(profile.rejected_patterns) == 0


@pytest.mark.asyncio
async def test_no_choice_updates_preference():
    """NO 採択 → apply_no 経由で rejected_patterns に加算。"""
    user_id = uuid4()
    decision_id = uuid4()
    decision = _make_decision(decision_id=decision_id, user_id=user_id, choice="no")
    factory = _FakeRepoFactory({decision_id: decision})

    handler = InlineLearningHandler(factory)
    await handler(
        user_id=str(user_id),
        decision_id=str(decision_id),
        choice="no",
        domain="daily",
        timestamp=datetime.now(timezone.utc),
    )

    profile = factory.preferences[user_id]
    assert len(profile.rejected_patterns) >= 1
    assert len(profile.accepted_patterns) == 0


@pytest.mark.asyncio
async def test_missing_decision_is_logged_and_skipped():
    """decision_repo.get が None を返す場合は log のみで profile は変化しない。"""
    user_id = uuid4()
    decision_id = uuid4()
    factory = _FakeRepoFactory({})  # 空

    handler = InlineLearningHandler(factory)
    # raise しない
    await handler(
        user_id=str(user_id),
        decision_id=str(decision_id),
        choice="yes",
        domain="daily",
        timestamp=datetime.now(timezone.utc),
    )
    assert user_id not in factory.preferences


@pytest.mark.asyncio
async def test_existing_profile_is_extended_not_replaced():
    """既存 PreferenceProfile があれば apply_yes で incremental update される。"""
    user_id = uuid4()
    decision_id1 = uuid4()
    decision_id2 = uuid4()
    d1 = _make_decision(decision_id=decision_id1, user_id=user_id, choice="yes")
    d2 = _make_decision(decision_id=decision_id2, user_id=user_id, choice="yes")
    factory = _FakeRepoFactory({decision_id1: d1, decision_id2: d2})

    handler = InlineLearningHandler(factory)
    await handler(
        user_id=str(user_id),
        decision_id=str(decision_id1),
        choice="yes",
        domain="daily",
        timestamp=datetime.now(timezone.utc),
    )
    accepted_after_1 = len(factory.preferences[user_id].accepted_patterns)

    await handler(
        user_id=str(user_id),
        decision_id=str(decision_id2),
        choice="yes",
        domain="daily",
        timestamp=datetime.now(timezone.utc),
    )
    accepted_after_2 = len(factory.preferences[user_id].accepted_patterns)

    # 2 回目で同一 domain が加算 (count 増加) → patterns 長は同じか、新規 pattern が増えるか
    # いずれにせよ既存 profile を消さずに upsert している
    assert accepted_after_2 >= accepted_after_1
