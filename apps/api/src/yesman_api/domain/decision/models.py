"""Domain models for U4 / decision — in-flight (永続化前) のデータ構造.

永続化対象 (Decision テーブル) は U2 `domain/persistence/models.py` で既定義。
ここでは合議処理中の値オブジェクトと SSE イベントを定義する。
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal
from uuid import UUID


DomainClassification = Literal["daily", "work", "school", "major", "silenced"]
SilenceDomain = Literal["religion", "election", "violence", "obscene"]


@dataclass(frozen=True, slots=True)
class DecisionRequest:
    """合議リクエスト (in-flight、永続化しない)."""

    user_id: UUID
    user_input: str
    selected_persona_ids: list[UUID] = field(default_factory=list)
    llm_provider: str = "mock"


@dataclass(frozen=True, slots=True)
class PersonaUtterance:
    """合議内の単一人格による発言."""

    persona_id: UUID
    persona_name: str
    text: str


@dataclass(frozen=True, slots=True)
class ConsensusOutput:
    """LLM 出力の parse 結果 (永続化前)。

    decision_id は API レスポンス DTO 側で持ち、ConsensusOutput には含めない (Imp1)。
    """

    domain_classification: DomainClassification
    utterances: list[PersonaUtterance]
    proposal_text: str


@dataclass(frozen=True, slots=True)
class SilenceVerdict:
    """SilenceGuard 判定結果."""

    is_silenced: bool
    domain: SilenceDomain | None = None
    response_text: str | None = None


@dataclass(frozen=True, slots=True)
class StreamEvent:
    """SSE 配信イベント (DiscussionStreamer + ConsensusOrchestrator.stream_parse)."""

    type: str  # "start" | "domain" | "utterance" | "proposal" | "complete" | "error" | "silence"
    data: dict[str, Any]


__all__ = [
    "DomainClassification",
    "SilenceDomain",
    "DecisionRequest",
    "PersonaUtterance",
    "ConsensusOutput",
    "SilenceVerdict",
    "StreamEvent",
]
