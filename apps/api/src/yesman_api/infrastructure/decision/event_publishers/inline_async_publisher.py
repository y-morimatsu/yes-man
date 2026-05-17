"""InlineAsyncPublisher — 同一プロセス内で U5 logic を直接呼ぶ (dev/test 用)."""
from __future__ import annotations

from datetime import datetime
from typing import Awaitable, Callable, Literal

from yesman_api.shared.logging import get_logger


class InlineAsyncPublisher:
    backend_name = "inline-async"

    def __init__(
        self,
        *,
        handler: Callable[..., Awaitable[None]] | None = None,
    ) -> None:
        self._handler = handler
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
        if self._handler is None:
            # U5 未着手段階では log のみ
            self._logger.info(
                "decision.confirmed.inline_async",
                user_id=user_id,
                decision_id=decision_id,
                choice=choice,
            )
            return
        await self._handler(
            user_id=user_id,
            decision_id=decision_id,
            choice=choice,
            domain=domain,
            timestamp=timestamp,
        )

    async def aclose(self) -> None:
        return None


__all__ = ["InlineAsyncPublisher"]
