"""EventPublisher 3 backend — Yes/No 両方発火 (ultrathink I6)."""
from __future__ import annotations

from datetime import datetime, timezone

import pytest

from yesman_api.infrastructure.decision.event_publishers.inline_async_publisher import (
    InlineAsyncPublisher,
)
from yesman_api.infrastructure.decision.event_publishers.sync_publisher import SyncPublisher


@pytest.mark.asyncio
async def test_sync_publisher_yes_no_both():
    pub = SyncPublisher()
    # 例外なし完了で十分 (副作用は log のみ)
    await pub.publish_decision_confirmed(
        user_id="u1",
        decision_id="d1",
        choice="yes",
        domain="daily",
        timestamp=datetime.now(timezone.utc),
    )
    await pub.publish_decision_confirmed(
        user_id="u1",
        decision_id="d2",
        choice="no",
        domain="daily",
        timestamp=datetime.now(timezone.utc),
    )


@pytest.mark.asyncio
async def test_inline_async_calls_handler():
    received = []

    async def handler(**kwargs):
        received.append(kwargs)

    pub = InlineAsyncPublisher(handler=handler)
    await pub.publish_decision_confirmed(
        user_id="u1",
        decision_id="d1",
        choice="yes",
        domain="daily",
        timestamp=datetime.now(timezone.utc),
    )
    await pub.publish_decision_confirmed(
        user_id="u1",
        decision_id="d2",
        choice="no",
        domain="daily",
        timestamp=datetime.now(timezone.utc),
    )
    assert len(received) == 2
    assert [r["choice"] for r in received] == ["yes", "no"]


@pytest.mark.asyncio
async def test_inline_async_no_handler_logs_only():
    pub = InlineAsyncPublisher()
    await pub.publish_decision_confirmed(
        user_id="u1",
        decision_id="d1",
        choice="yes",
        domain="daily",
        timestamp=datetime.now(timezone.utc),
    )  # log のみ、例外なし
