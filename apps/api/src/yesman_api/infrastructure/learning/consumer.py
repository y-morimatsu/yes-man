"""DecisionConfirmedConsumer — SQS long polling + incremental preference update.

NFR Design §4 + ultrathink I1 (Consumer は ColdStart 呼ばず、空 profile で incremental update) +
NFR Req I3 (parse 失敗 delete しない、DLQ 経由) 反映.
"""
from __future__ import annotations

import asyncio
import json

import boto3

from yesman_api.application.persistence.protocols import (
    DecisionRepository,
    PreferenceProfileRepository,
)
from yesman_api.domain.learning.builder import apply_no, apply_yes
from yesman_api.domain.learning.models import DecisionConfirmedPayload
from yesman_api.domain.persistence.models import PreferenceProfile
from yesman_api.shared.logging import get_logger


class DecisionConfirmedConsumer:
    def __init__(
        self,
        *,
        queue_url: str,
        region: str,
        decision_repo: DecisionRepository,
        preference_repo: PreferenceProfileRepository,
        wait_time_seconds: int = 5,
        retry_sleep_seconds: float = 30.0,
    ) -> None:
        self._queue_url = queue_url
        # NFR Design Imp2: 独立 Session で thread safety 強化
        self._session = boto3.session.Session(region_name=region)
        self._client = self._session.client("sqs")
        self._decision_repo = decision_repo
        self._preference_repo = preference_repo
        self._wait_time = wait_time_seconds
        self._retry_sleep = retry_sleep_seconds
        self._stop_event = asyncio.Event()
        self._logger = get_logger("learning.consumer")

    async def run(self) -> None:
        """Long polling loop, stop_event で graceful shutdown."""
        self._logger.info("consumer.start", queue_url=self._queue_url)
        while not self._stop_event.is_set():
            try:
                response = await asyncio.to_thread(
                    self._client.receive_message,
                    QueueUrl=self._queue_url,
                    MaxNumberOfMessages=10,
                    WaitTimeSeconds=self._wait_time,
                )
                messages = response.get("Messages", [])
                for msg in messages:
                    await self._process_message(msg)
            except Exception as exc:
                # AVAIL-U5-01: SQS receive 失敗 → 30s sleep + retry
                self._logger.error("consumer.receive_failed", error=str(exc))
                try:
                    await asyncio.wait_for(
                        self._stop_event.wait(), timeout=self._retry_sleep
                    )
                    break  # stop_event 立った
                except asyncio.TimeoutError:
                    pass  # retry
        self._logger.info("consumer.stop")

    async def stop(self) -> None:
        self._stop_event.set()

    async def _process_message(self, msg: dict) -> None:
        body_raw = msg.get("Body", "")
        receipt_handle = msg.get("ReceiptHandle")
        # 1. parse
        try:
            body = json.loads(body_raw)
            payload = DecisionConfirmedPayload.from_sqs_body(body)
        except Exception as exc:
            # ultrathink NFR Req I3: delete しない、redrive policy で DLQ
            self._logger.warning(
                "consumer.parse_failed", error=str(exc), body=body_raw[:200]
            )
            return
        # 2. decision 取得
        try:
            decision = await self._decision_repo.get(payload.decision_id)
        except Exception as exc:
            self._logger.error(
                "consumer.decision_fetch_failed",
                decision_id=str(payload.decision_id),
                error=str(exc),
            )
            return  # delete しない、visibility timeout で再配送
        if decision is None:
            # AVAIL-U5-05: 不整合 (上流クラッシュ等)、retry しても解決しない → delete
            self._logger.warning(
                "consumer.decision_not_found", decision_id=str(payload.decision_id)
            )
            await self._delete_message(receipt_handle)
            return
        # 3. preference 更新 (Loader 一元化のため Consumer は ColdStart 呼ばない、I1)
        try:
            profile = await self._preference_repo.get(payload.user_id)
            if profile is None:
                profile = PreferenceProfile(user_id=payload.user_id)
            if payload.choice == "yes":
                updated = apply_yes(profile, decision)
            else:
                updated = apply_no(profile, decision)
            await self._preference_repo.upsert(updated)
            await self._delete_message(receipt_handle)
        except Exception as exc:
            # DB エラー等: delete しない、visibility timeout 後に再配送
            self._logger.error(
                "consumer.process_failed",
                decision_id=str(payload.decision_id),
                error=str(exc),
            )

    async def _delete_message(self, receipt_handle: str | None) -> None:
        """delete_message 失敗時は log のみ (再配送で対応、NFR Req Imp1)."""
        if receipt_handle is None:
            return
        try:
            await asyncio.to_thread(
                self._client.delete_message,
                QueueUrl=self._queue_url,
                ReceiptHandle=receipt_handle,
            )
        except Exception as exc:
            self._logger.warning("consumer.delete_failed", error=str(exc))


__all__ = ["DecisionConfirmedConsumer"]
