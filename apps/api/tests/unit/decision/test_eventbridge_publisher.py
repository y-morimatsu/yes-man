"""Unit tests for EventBridgePublisher (infrastructure/decision/event_publishers/eventbridge_publisher.py).

boto3 events client を MagicMock に差し替え、put_events 発火と失敗握り潰しを
外部 AWS なしで検証する。
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from unittest.mock import MagicMock

from yesman_api.infrastructure.decision.event_publishers.eventbridge_publisher import (
    EventBridgePublisher,
)


def _publisher() -> EventBridgePublisher:
    pub = EventBridgePublisher(event_bus_name="yesman-bus", region="ap-northeast-1")
    pub._client = MagicMock()
    return pub


async def test_publish_puts_event_entry() -> None:
    pub = _publisher()
    await pub.publish_decision_confirmed(
        user_id="u1",
        decision_id="d1",
        choice="yes",
        domain="daily",
        timestamp=datetime(2026, 5, 29, tzinfo=timezone.utc),
    )
    pub._client.put_events.assert_called_once()
    entries = pub._client.put_events.call_args.kwargs["Entries"]
    assert entries[0]["Source"] == "yesman.api"
    assert entries[0]["DetailType"] == "DecisionConfirmed"
    detail = json.loads(entries[0]["Detail"])
    assert detail["decision_id"] == "d1" and detail["choice"] == "yes"


async def test_publish_swallows_failure() -> None:
    pub = _publisher()
    pub._client.put_events.side_effect = RuntimeError("eventbridge down")
    # 例外を握り潰し、API 自体は成功させる (log のみ)
    await pub.publish_decision_confirmed(
        user_id="u1",
        decision_id="d1",
        choice="no",
        domain="work",
        timestamp=datetime(2026, 5, 29, tzinfo=timezone.utc),
    )


async def test_aclose_noop() -> None:
    pub = _publisher()
    assert await pub.aclose() is None
