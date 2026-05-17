"""SyncPublisher — no-op (MVP / Mock backend)。structured log のみ."""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from yesman_api.shared.logging import get_logger


class SyncPublisher:
    backend_name = "sync"

    def __init__(self) -> None:
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
        self._logger.info(
            "decision.confirmed.sync",
            user_id=user_id,
            decision_id=decision_id,
            choice=choice,
            dispatched="sync",
        )

    async def aclose(self) -> None:
        return None


__all__ = ["SyncPublisher"]
