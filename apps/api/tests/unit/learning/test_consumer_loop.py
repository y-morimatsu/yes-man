"""Unit tests for DecisionConfirmedConsumer run/process (infrastructure/learning/consumer.py).

既存 test_consumer.py は parse のみ。本ファイルは run() / _process_message() /
_delete_message() を、SQS client (boto3) を MagicMock に差し替えて外部 AWS なしで網羅する。
"""
from __future__ import annotations

import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from yesman_api.domain.persistence.models import PreferenceProfile
from yesman_api.infrastructure.learning import consumer as consumer_mod
from yesman_api.infrastructure.learning.consumer import DecisionConfirmedConsumer


def _make_consumer() -> DecisionConfirmedConsumer:
    c = DecisionConfirmedConsumer(
        queue_url="https://sqs/q",
        region="ap-northeast-1",
        decision_repo=AsyncMock(),
        preference_repo=AsyncMock(),
        wait_time_seconds=1,
        retry_sleep_seconds=0.01,
    )
    c._client = MagicMock()  # boto3 SQS client を差し替え
    return c


def _stub_payload(choice: str = "yes") -> SimpleNamespace:
    return SimpleNamespace(decision_id=uuid.uuid4(), user_id=uuid.uuid4(), choice=choice)


async def test_process_parse_failure_returns_without_delete() -> None:
    c = _make_consumer()
    await c._process_message({"Body": "{not-json", "ReceiptHandle": "r"})
    c._client.delete_message.assert_not_called()
    c._preference_repo.upsert.assert_not_awaited()


@pytest.mark.parametrize("choice", ["yes", "no"])
async def test_process_success_updates_and_deletes(monkeypatch, choice) -> None:  # noqa: ANN001
    c = _make_consumer()
    payload = _stub_payload(choice)
    monkeypatch.setattr(
        consumer_mod.DecisionConfirmedPayload, "from_sqs_body", lambda body: payload
    )
    monkeypatch.setattr(consumer_mod, "apply_yes", lambda p, d: p)
    monkeypatch.setattr(consumer_mod, "apply_no", lambda p, d: p)
    c._decision_repo.get.return_value = SimpleNamespace()  # decision exists
    c._preference_repo.get.return_value = None  # cold profile

    await c._process_message({"Body": "{}", "ReceiptHandle": "rh"})

    c._preference_repo.upsert.assert_awaited_once()
    upserted = c._preference_repo.upsert.await_args.args[0]
    assert isinstance(upserted, PreferenceProfile)
    c._client.delete_message.assert_called_once()


async def test_process_decision_not_found_deletes(monkeypatch) -> None:  # noqa: ANN001
    c = _make_consumer()
    monkeypatch.setattr(
        consumer_mod.DecisionConfirmedPayload, "from_sqs_body", lambda body: _stub_payload()
    )
    c._decision_repo.get.return_value = None

    await c._process_message({"Body": "{}", "ReceiptHandle": "rh"})

    c._preference_repo.upsert.assert_not_awaited()
    c._client.delete_message.assert_called_once()


async def test_process_decision_fetch_error_no_delete(monkeypatch) -> None:  # noqa: ANN001
    c = _make_consumer()
    monkeypatch.setattr(
        consumer_mod.DecisionConfirmedPayload, "from_sqs_body", lambda body: _stub_payload()
    )
    c._decision_repo.get.side_effect = RuntimeError("db down")

    await c._process_message({"Body": "{}", "ReceiptHandle": "rh"})

    c._client.delete_message.assert_not_called()


async def test_process_upsert_error_no_delete(monkeypatch) -> None:  # noqa: ANN001
    c = _make_consumer()
    monkeypatch.setattr(
        consumer_mod.DecisionConfirmedPayload, "from_sqs_body", lambda body: _stub_payload()
    )
    monkeypatch.setattr(consumer_mod, "apply_yes", lambda p, d: p)
    c._decision_repo.get.return_value = SimpleNamespace()
    c._preference_repo.get.return_value = None
    c._preference_repo.upsert.side_effect = RuntimeError("write fail")

    await c._process_message({"Body": "{}", "ReceiptHandle": "rh"})

    c._client.delete_message.assert_not_called()


async def test_delete_message_none_receipt_is_noop() -> None:
    c = _make_consumer()
    await c._delete_message(None)
    c._client.delete_message.assert_not_called()


async def test_delete_message_swallows_error() -> None:
    c = _make_consumer()
    c._client.delete_message.side_effect = RuntimeError("sqs error")
    await c._delete_message("rh")  # 例外を握りつぶす (log のみ)


async def test_run_exits_when_stop_already_set() -> None:
    c = _make_consumer()
    await c.stop()  # stop_event をあらかじめ立てる
    await c.run()  # ループに入らず即終了
    c._client.receive_message.assert_not_called()


async def test_run_processes_message_then_stops() -> None:
    c = _make_consumer()
    c._client.receive_message.return_value = {
        "Messages": [{"Body": "{}", "ReceiptHandle": "r"}]
    }

    async def _fake_process(msg):  # noqa: ANN001
        await c.stop()  # 1 件処理したら停止

    c._process_message = _fake_process  # type: ignore[assignment]
    await c.run()
    c._client.receive_message.assert_called()


async def test_run_receive_failure_then_stop() -> None:
    c = _make_consumer()

    def _fail(*args, **kwargs):  # noqa: ANN002, ANN003
        # 失敗直後に stop_event を立て、except 内の wait で即 break させる
        c._stop_event.set()
        raise RuntimeError("sqs unreachable")

    c._client.receive_message.side_effect = _fail
    await c.run()
    c._client.receive_message.assert_called()
