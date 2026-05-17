"""Contract test — EventPublisher Protocol を 3 backend が実装 (TEST-U4-02)."""
from __future__ import annotations

from yesman_api.application.decision.event_publisher import EventPublisher
from yesman_api.infrastructure.decision.event_publishers.inline_async_publisher import (
    InlineAsyncPublisher,
)
from yesman_api.infrastructure.decision.event_publishers.sync_publisher import SyncPublisher


def test_sync_publisher_implements_protocol():
    pub = SyncPublisher()
    assert isinstance(pub, EventPublisher)
    assert pub.backend_name == "sync"


def test_inline_async_publisher_implements_protocol():
    pub = InlineAsyncPublisher()
    assert isinstance(pub, EventPublisher)
    assert pub.backend_name == "inline-async"


def test_eventbridge_class_implements_protocol():
    """EventBridgePublisher は boto3 依存のため class 名のみ検証 (instantiate しない)."""
    from yesman_api.infrastructure.decision.event_publishers import eventbridge_publisher

    cls = eventbridge_publisher.EventBridgePublisher
    assert hasattr(cls, "publish_decision_confirmed")
    assert hasattr(cls, "aclose")
    assert cls.backend_name == "eventbridge"
