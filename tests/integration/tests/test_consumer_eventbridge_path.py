"""Integration: eventbridge Consumer 直接 test (U-Test FD §3.1 ultrathink I2).

DecisionConfirmedConsumer._process_message を直接呼び、
SQS message body parse → PreferenceProfile 更新の prod path を verify.

LocalStack や Mock SQS 不要 (boto3 client は monkeypatch で stub).
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from unittest.mock import MagicMock
from uuid import UUID, uuid4

import pytest

from yesman_api.domain.persistence.models import Decision
from yesman_api.infrastructure.learning.consumer import DecisionConfirmedConsumer


def _make_consumer(repo_bundle, monkeypatch) -> DecisionConfirmedConsumer:
    """boto3 client を MagicMock に差し替えて Consumer を構築."""
    # boto3.session.Session を monkeypatch して MagicMock を返す
    mock_session = MagicMock()
    mock_session.client.return_value = MagicMock()
    monkeypatch.setattr(
        "yesman_api.infrastructure.learning.consumer.boto3.session.Session",
        lambda **kwargs: mock_session,
    )
    return DecisionConfirmedConsumer(
        queue_url="https://sqs.test/queue/yesman",
        region="ap-northeast-1",
        decision_repo=repo_bundle.decision,
        preference_repo=repo_bundle.preference,
    )


def _make_sqs_message(*, user_id: UUID, decision_id: UUID, choice: str, domain: str) -> dict:
    """EventBridge envelope を SQS message 形式にラップ."""
    body = {
        "version": "0",
        "detail-type": "DecisionConfirmed",
        "source": "yesman.api",
        "time": datetime.now(timezone.utc).isoformat(),
        "detail": {
            "user_id": str(user_id),
            "decision_id": str(decision_id),
            "choice": choice,
            "domain": domain,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        },
    }
    return {"Body": json.dumps(body), "ReceiptHandle": "test-receipt-handle"}


async def _insert_decision(
    repo_bundle, *, user_id: UUID, choice: str = "yes"
) -> Decision:
    """test 用 Decision を直接 insert (DecisionEngine 経由しない)."""
    decision = Decision(
        id=uuid4(),
        user_id=user_id,
        domain_classification="daily",
        user_input="昼ご飯どうする",
        user_input_hash="x" * 64,
        proposal_text="その選択肢で進めてください",
        persona_outputs={
            "utterances": [
                {"persona_id": str(uuid4()), "persona_name": "慎重派", "text": "..."},
                {"persona_id": str(uuid4()), "persona_name": "楽観派", "text": "..."},
            ]
        },
        user_choice=choice,
        no_attempt_count=0,
        llm_provider="mock",
        selected_persona_ids=[],
    )
    return await repo_bundle.decision.insert(decision)


@pytest.mark.asyncio
async def test_consumer_processes_yes_decision_event(
    repo_bundle, test_user_id: str, monkeypatch
):
    """Yes 採択 SQS message → PreferenceProfile.accepted_patterns + persona_style 更新."""
    user_id = UUID(test_user_id)
    decision = await _insert_decision(repo_bundle, user_id=user_id, choice="yes")
    consumer = _make_consumer(repo_bundle, monkeypatch)

    msg = _make_sqs_message(
        user_id=user_id, decision_id=decision.id, choice="yes", domain="daily"
    )
    await consumer._process_message(msg)

    persisted = await repo_bundle.preference.get(user_id)
    assert persisted is not None
    assert len(persisted.accepted_patterns) == 1
    assert persisted.accepted_patterns[0]["decision_id"] == str(decision.id)
    # 2 persona 各 +0.1
    assert persisted.persona_style_preference.get("慎重派") == pytest.approx(0.1)
    assert persisted.persona_style_preference.get("楽観派") == pytest.approx(0.1)


@pytest.mark.asyncio
async def test_consumer_processes_no_decision_event(
    repo_bundle, test_user_id: str, monkeypatch
):
    """No 採択 SQS message → PreferenceProfile.rejected_patterns 更新 (accepted は不変)."""
    user_id = UUID(test_user_id)
    decision = await _insert_decision(repo_bundle, user_id=user_id, choice="no")
    consumer = _make_consumer(repo_bundle, monkeypatch)

    msg = _make_sqs_message(
        user_id=user_id, decision_id=decision.id, choice="no", domain="daily"
    )
    await consumer._process_message(msg)

    persisted = await repo_bundle.preference.get(user_id)
    assert persisted is not None
    assert len(persisted.rejected_patterns) == 1
    assert len(persisted.accepted_patterns) == 0
    # 2 persona 各 -0.05
    assert persisted.persona_style_preference.get("慎重派") == pytest.approx(-0.05)


@pytest.mark.asyncio
async def test_consumer_handles_decision_not_found(
    repo_bundle, test_user_id: str, monkeypatch
):
    """decision_not_found (上流クラッシュ) → log + delete (例外 raise しない、AVAIL-U5-05)."""
    user_id = UUID(test_user_id)
    consumer = _make_consumer(repo_bundle, monkeypatch)

    # 存在しない decision_id
    msg = _make_sqs_message(
        user_id=user_id, decision_id=uuid4(), choice="yes", domain="daily"
    )
    await consumer._process_message(msg)

    # preference は作成されない (decision 不在のため)
    persisted = await repo_bundle.preference.get(user_id)
    assert persisted is None


@pytest.mark.asyncio
async def test_consumer_skips_parse_failure(repo_bundle, monkeypatch):
    """parse 失敗 (broken json) → delete しない、log のみ (NFR Req I3、DLQ 経由)."""
    consumer = _make_consumer(repo_bundle, monkeypatch)
    bad_msg = {"Body": "this-is-not-json", "ReceiptHandle": "rh-broken"}

    # 例外 raise されないこと
    await consumer._process_message(bad_msg)

    # delete_message は呼ばれない (broken parse は DLQ 行き想定)
    delete_calls = consumer._client.delete_message.call_args_list
    assert all(
        call.kwargs.get("ReceiptHandle") != "rh-broken" for call in delete_calls
    )
