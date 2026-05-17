"""EventBridgePublisher — AWS EventBridge bus への DecisionConfirmed 発火.

NFR Design §7.2 + ultrathink Imp2 反映:
- 独立 boto3 Session を持ち、並行 put_events の thread safety を強化
- asyncio.to_thread で同期 boto3 を非同期化
"""
from __future__ import annotations

import asyncio
import json
from datetime import datetime
from typing import Literal

import boto3

from yesman_api.shared.logging import get_logger


class EventBridgePublisher:
    backend_name = "eventbridge"

    def __init__(self, *, event_bus_name: str, region: str) -> None:
        self._session = boto3.session.Session(region_name=region)
        self._client = self._session.client("events")
        self._bus = event_bus_name
        self._logger = get_logger("decision.event_publisher")

    async def publish_decision_confirmed(
        self,
        *,
        user_id: str,
        decision_id: str,
        choice: Literal["yes", "no"],
        domain: str,
        timestamp: datetime,
    ) -> None:
        detail = {
            "user_id": user_id,
            "decision_id": decision_id,
            "choice": choice,
            "domain": domain,
            "timestamp": timestamp.isoformat(),
        }
        entry = {
            "Source": "yesman.api",
            "DetailType": "DecisionConfirmed",
            "Detail": json.dumps(detail, default=str),
            "EventBusName": self._bus,
        }
        try:
            await asyncio.to_thread(self._client.put_events, Entries=[entry])
        except Exception as exc:
            # AVAIL-U4-06: EventBridge 失敗で API 自体は成功 (= ログのみ)
            self._logger.error("eventbridge_publish_failed", error=str(exc), decision_id=decision_id)

    async def aclose(self) -> None:
        pass  # boto3 client は明示 close 不要


__all__ = ["EventBridgePublisher"]
