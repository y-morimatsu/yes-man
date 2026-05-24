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
PersonaSource = Literal["builtin", "anonymous"]
SelectedPersonaSource = Literal["builtin", "anonymous", "my"]


@dataclass(frozen=True, slots=True)
class SelectedPersonaRef:
    """2026-05-24 v4: 3 source mix selection の単一エントリ.

    source ごとに id の解決先が異なる:
    - builtin / my: persona_repo の DB UUID
    - anonymous: pool_repo の persona_id (sub-deterministic UUID)
    """

    source: SelectedPersonaSource
    id: UUID


@dataclass(frozen=True, slots=True)
class DecisionRequest:
    """合議リクエスト (in-flight、永続化しない)."""

    user_id: UUID
    user_input: str
    selected_persona_ids: list[UUID] = field(default_factory=list)
    llm_provider: str = "mock"
    # 2026-05-23: Drill-down chain — 親提案列 (Yes 連鎖時の context).
    chain_context: tuple[str, ...] = ()
    # 2026-05-24 v3-γ anonymous-strangers: persona source 選択 (backward-compat 用)
    persona_source: PersonaSource = "builtin"
    # 2026-05-24 v4: 3 source mix selection (優先). 未指定なら旧 fields を使う.
    selected_personas: tuple[SelectedPersonaRef, ...] = ()


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
    "PersonaSource",
    "SelectedPersonaSource",
    "SelectedPersonaRef",
    "DecisionRequest",
    "PersonaUtterance",
    "ConsensusOutput",
    "SilenceVerdict",
    "StreamEvent",
]
