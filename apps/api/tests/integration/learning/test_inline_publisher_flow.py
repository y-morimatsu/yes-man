"""Integration test (issue #88): EVENT_BACKEND=inline-async でリアル factory + repo を通して
DecisionEngine.apply_choice → InlineAsyncPublisher → InlineLearningHandler →
PreferenceProfile upsert の経路が壊れていないことを verify する。
"""
from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID, uuid4

import pytest

from yesman_api.infrastructure.config import AppConfig
from yesman_api.infrastructure.decision.event_publishers.factory import (
    EventPublisherFactory,
)
from yesman_api.infrastructure.persistence.factory import RepositoryFactory


@pytest.mark.asyncio
@pytest.mark.integration
async def test_inline_async_with_repo_factory_updates_preference():
    """EVENT_BACKEND=inline-async + repo_factory 注入で、publish_decision_confirmed が
    実 RepositoryFactory 経由で preference を upsert する."""
    config = AppConfig(event_backend="inline-async", storage_backend="mock")
    repo_factory = RepositoryFactory(config)

    user_id = uuid4()
    decision_id = uuid4()

    # 事前に decision を 1 件 mock に挿入 (DecisionEngine.run() の代わり)
    from yesman_api.domain.persistence.models import Decision

    async with repo_factory.bundle() as bundle:
        await bundle.decision.insert(
            Decision(
                id=decision_id,
                user_id=user_id,
                user_input="今日のランチを決めて",
                user_input_hash="hash1",
                domain_classification="daily",
                proposal_text="カレー",
                user_choice="yes",
                no_attempt_count=0,
                created_at=datetime.now(timezone.utc),
                persona_names=["慎重派", "楽観派", "効率派"],
            )
        )

    event_factory = EventPublisherFactory(config, repo_factory=repo_factory)
    publisher = await event_factory.create()
    assert publisher.backend_name == "inline-async"

    # 発火
    await publisher.publish_decision_confirmed(
        user_id=str(user_id),
        decision_id=str(decision_id),
        choice="yes",
        domain="daily",
        timestamp=datetime.now(timezone.utc),
    )

    # preference repository に書かれているはず
    async with repo_factory.bundle() as bundle:
        profile = await bundle.preference.get(user_id)
    assert profile is not None, "preference profile should be upserted by inline handler"
    assert len(profile.accepted_patterns) >= 1
    assert len(profile.rejected_patterns) == 0


@pytest.mark.asyncio
@pytest.mark.integration
async def test_inline_async_without_repo_factory_falls_back_to_log_only():
    """repo_factory 無指定なら handler は注入されず従来通り log のみ (no-op)、
    raise しないことを verify。"""
    config = AppConfig(event_backend="inline-async", storage_backend="mock")
    # repo_factory を渡さない
    event_factory = EventPublisherFactory(config)
    publisher = await event_factory.create()

    # raise しない
    await publisher.publish_decision_confirmed(
        user_id=str(uuid4()),
        decision_id=str(uuid4()),
        choice="yes",
        domain="daily",
        timestamp=datetime.now(timezone.utc),
    )


@pytest.mark.asyncio
@pytest.mark.integration
async def test_sync_backend_remains_no_op():
    """EVENT_BACKEND=sync は従来通り no-op (本 issue は inline-async のみを修正対象)."""
    config = AppConfig(event_backend="sync", storage_backend="mock")
    repo_factory = RepositoryFactory(config)
    event_factory = EventPublisherFactory(config, repo_factory=repo_factory)
    publisher = await event_factory.create()
    assert publisher.backend_name == "sync"
