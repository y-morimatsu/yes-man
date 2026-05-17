"""DecisionConfirmedConsumer unit test — parse / DB エラー / decision_id 不整合."""
from __future__ import annotations

import json
import uuid as _uuid

import pytest

from tests.fixtures.learning import decision_factory, sqs_message_factory
from yesman_api.domain.learning.models import DecisionConfirmedPayload


class TestParse:
    def test_from_sqs_body_valid(self):
        user_id = _uuid.uuid4()
        decision_id = _uuid.uuid4()
        body = sqs_message_factory(user_id=user_id, decision_id=decision_id, choice="yes")
        payload = DecisionConfirmedPayload.from_sqs_body(body)
        assert payload.user_id == user_id
        assert payload.decision_id == decision_id
        assert payload.choice == "yes"
        assert payload.domain == "daily"

    def test_from_sqs_body_invalid_uuid(self):
        body = {
            "detail": {
                "user_id": "not-a-uuid",
                "decision_id": str(_uuid.uuid4()),
                "choice": "yes",
                "domain": "daily",
                "timestamp": "2026-05-16T00:00:00+00:00",
            }
        }
        with pytest.raises(ValueError):
            DecisionConfirmedPayload.from_sqs_body(body)

    def test_from_sqs_body_missing_key(self):
        body = {"detail": {"user_id": str(_uuid.uuid4())}}  # 他の必須 key 不足
        with pytest.raises((KeyError, ValueError)):
            DecisionConfirmedPayload.from_sqs_body(body)


# Consumer の run() / _process_message() は boto3 + asyncio の本格 mock が必要
# MVP では DecisionConfirmedPayload の parse ロジックのみ unit test、
# 完全な flow は tests/integration/learning/test_consumer_loop.py で対応 (placeholder)
