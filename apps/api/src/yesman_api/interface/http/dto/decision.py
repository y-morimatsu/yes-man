"""Decision API DTO (FR-AI / FR-NUDGE / FR-SCORE).

NFR Req I2 反映 + ultrathink Imp1 (ConsensusOutput vs DecisionResponse 分離):
- user_input max_length=100_000 (413 reject)
- ProfileResponse パターン踏襲 (Pydantic v2 + ConfigDict from_attributes=True)
"""
from __future__ import annotations

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


# ============================================================
# Request
# ============================================================
class DecisionRequestDTO(BaseModel):
    model_config = ConfigDict(extra="forbid")

    user_input: str = Field(min_length=1, max_length=100_000)
    selected_persona_ids: list[UUID] | None = None


class ChoiceRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    choice: Literal["yes", "no"]


# ============================================================
# Response
# ============================================================
class UtteranceDTO(BaseModel):
    persona_id: UUID
    persona_name: str
    text: str


class DecisionResponse(BaseModel):
    """非ストリーミング合議 + Yes/No 採択直後のレスポンス."""

    decision_id: UUID
    domain: str
    utterances: list[UtteranceDTO]
    proposal_text: str
    nudge_url: str
    no_attempt_count: int = 0


class ChoiceResponse(BaseModel):
    decision_id: UUID
    nudge_url: str
    no_attempt_count: int


class NudgeResponse(BaseModel):
    status: Literal["pending", "ready", "failed"]
    message: str | None = None


class ScoreResponse(BaseModel):
    no_count: int
    total: int
    ratio: float | None
    message: str


__all__ = [
    "DecisionRequestDTO",
    "ChoiceRequest",
    "UtteranceDTO",
    "DecisionResponse",
    "ChoiceResponse",
    "NudgeResponse",
    "ScoreResponse",
]
