"""InlineLearningHandler — EVENT_BACKEND=inline-async 時の同一プロセス preference 集約.

issue #88 (Post-CONSTRUCTION v3): EVENT_BACKEND=sync では SyncPublisher が no-op で
preference profile が永遠に空のままになる問題への対応。

InlineAsyncPublisher に本 handler を inject することで、apply_choice の延長で
DecisionConfirmedConsumer と同等の preference incremental update を行う。

EventBridge / SQS / U5 Infrastructure code 不在 (dev/demo 環境) で完結する。
"""
from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from yesman_api.domain.learning.builder import apply_no, apply_yes
from yesman_api.domain.persistence.models import PreferenceProfile
from yesman_api.infrastructure.persistence.factory import RepositoryFactory
from yesman_api.shared.logging import get_logger


class InlineLearningHandler:
    """InlineAsyncPublisher.handler 互換 callable.

    Consumer (`infrastructure/learning/consumer.py`) の \_process\_message と同等のロジックを
    SQS 経由なしで同期実行する。失敗時は log のみ (publisher 側の retry なし)。
    """

    def __init__(self, repo_factory: RepositoryFactory) -> None:
        self._repo_factory = repo_factory
        self._logger = get_logger("learning.inline_handler")

    async def __call__(
        self,
        *,
        user_id: str,
        decision_id: str,
        choice: Literal["yes", "no"],
        domain: str,
        timestamp: datetime,
    ) -> None:
        decision_uuid = UUID(decision_id)
        user_uuid = UUID(user_id)
        async with self._repo_factory.bundle() as bundle:
            decision = await bundle.decision.get(decision_uuid)
            if decision is None:
                self._logger.warning(
                    "inline_handler.decision_not_found",
                    decision_id=decision_id,
                )
                return
            profile = await bundle.preference.get(user_uuid)
            if profile is None:
                profile = PreferenceProfile(user_id=user_uuid)
            if choice == "yes":
                updated = apply_yes(profile, decision)
            else:
                updated = apply_no(profile, decision)
            await bundle.preference.upsert(updated)
            self._logger.info(
                "inline_handler.preference_updated",
                user_id=user_id,
                decision_id=decision_id,
                choice=choice,
                accepted_patterns=len(updated.accepted_patterns),
                rejected_patterns=len(updated.rejected_patterns),
            )


__all__ = ["InlineLearningHandler"]
