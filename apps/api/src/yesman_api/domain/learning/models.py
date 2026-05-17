"""DecisionConfirmedPayload — SQS message body から parse される DecisionConfirmed イベント.

NFR Design §1 + ultrathink FD C1 反映: from_sqs_body classmethod で UUID/datetime 型変換.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Literal
from uuid import UUID


@dataclass(frozen=True, slots=True)
class DecisionConfirmedPayload:
    """SQS body (EventBridge envelope) から parse される DecisionConfirmed イベント.

    EventBridge envelope:
        {"version": "0", "detail-type": "DecisionConfirmed",
         "source": "yesman.api", "time": "...", "detail": {...}}
    detail.user_id / decision_id は文字列、Python 側で UUID 変換が必要.
    """

    user_id: UUID
    decision_id: UUID
    choice: Literal["yes", "no"]
    domain: str
    timestamp: datetime

    @classmethod
    def from_sqs_body(cls, body: dict) -> "DecisionConfirmedPayload":
        """SQS body (EventBridge envelope) から parse、UUID/datetime 型変換."""
        detail = body["detail"]
        return cls(
            user_id=UUID(detail["user_id"]),
            decision_id=UUID(detail["decision_id"]),
            choice=detail["choice"],
            domain=detail["domain"],
            timestamp=datetime.fromisoformat(detail["timestamp"]),
        )


__all__ = ["DecisionConfirmedPayload"]
