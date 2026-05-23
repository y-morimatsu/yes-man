"""EventPublisherFactory — config.event_backend に応じて 3 backend を生成."""
from __future__ import annotations

from yesman_api.application.decision.event_publisher import EventPublisher
from yesman_api.application.learning.inline_handler import InlineLearningHandler
from yesman_api.infrastructure.config import AppConfig
from yesman_api.infrastructure.decision.event_publishers.eventbridge_publisher import (
    EventBridgePublisher,
)
from yesman_api.infrastructure.decision.event_publishers.inline_async_publisher import (
    InlineAsyncPublisher,
)
from yesman_api.infrastructure.decision.event_publishers.sync_publisher import (
    SyncPublisher,
)
from yesman_api.infrastructure.persistence.factory import RepositoryFactory


class EventPublisherFactory:
    def __init__(
        self,
        config: AppConfig,
        *,
        repo_factory: RepositoryFactory | None = None,
    ) -> None:
        self._cfg = config
        # issue #88: inline-async 用 InlineLearningHandler 注入のため repo_factory を保持
        self._repo_factory = repo_factory
        self._publisher: EventPublisher | None = None

    async def create(self) -> EventPublisher:
        if self._publisher is not None:
            return self._publisher
        backend = self._cfg.event_backend
        if backend == "eventbridge":
            self._publisher = EventBridgePublisher(
                event_bus_name=self._cfg.event_bus_name,
                region=self._cfg.bedrock_region,
            )
        elif backend == "inline-async":
            # issue #88: repo_factory が渡されていれば InlineLearningHandler を注入し、
            # apply_choice 直後に preference profile を同一プロセスで更新する。
            handler = (
                InlineLearningHandler(self._repo_factory)
                if self._repo_factory is not None
                else None
            )
            self._publisher = InlineAsyncPublisher(handler=handler)
        elif backend == "sync":
            self._publisher = SyncPublisher()
        else:
            raise RuntimeError(f"Unknown EVENT_BACKEND: {backend!r}")
        return self._publisher

    async def dispose(self) -> None:
        if self._publisher is not None:
            await self._publisher.aclose()
            self._publisher = None


__all__ = ["EventPublisherFactory"]
