"""EventPublisher Protocol — 採択イベント発火の Strategy 切替 (FR-LEARN-07).

3 実装 (EventBridgePublisher / InlineAsyncPublisher / SyncPublisher) が準拠.
Yes/No 両方の採択時に発火 (NFR Req SEC-U4-10、FR-LEARN-01 整合).
"""
from __future__ import annotations

from datetime import datetime
from typing import Literal, Protocol, runtime_checkable


@runtime_checkable
class EventPublisher(Protocol):
    backend_name: str  # "eventbridge" / "inline-async" / "sync"

    async def publish_decision_confirmed(
        self,
        *,
        user_id: str,
        decision_id: str,
        choice: Literal["yes", "no"],
        domain: str,
        timestamp: datetime,
    ) -> None:
        """採択イベント発火. 失敗時の挙動は実装依存 (NFR Req AVAIL-U4-06)."""
        ...

    async def aclose(self) -> None: ...


__all__ = ["EventPublisher"]
