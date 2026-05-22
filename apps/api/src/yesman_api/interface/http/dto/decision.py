"""Decision API DTO (FR-AI / FR-NUDGE / FR-SCORE).

NFR Req I2 反映 + ultrathink Imp1 (ConsensusOutput vs DecisionResponse 分離):
- user_input max_length=100_000 (413 reject)
- ProfileResponse パターン踏襲 (Pydantic v2 + ConfigDict from_attributes=True)
"""
from __future__ import annotations

from datetime import datetime
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


class ScoreHistoryPointResponse(BaseModel):
    date: str  # ISO date (YYYY-MM-DD)
    yes_ratio: float | None
    total: int


class ScoreResponse(BaseModel):
    no_count: int
    total: int
    ratio: float | None  # Yes 比率 = (total - no_count) / total、total=0 → None
    message: str
    history: list[ScoreHistoryPointResponse] = []


class DecisionHistoryItemDTO(BaseModel):
    """履歴 1 件の表示用 DTO (FR-HIST-01)."""

    id: str  # UUID 文字列
    user_input: str  # 質問 (生、本人にしか返さない)
    proposal_text: str  # AI 提案
    user_choice: Literal["yes", "no", "pending"]
    attempt_count: int = Field(
        ge=1,
        description="同一 user_input_hash 内での created_at 順 1-indexed (何回目の提案で採用したか)",
    )
    created_at: datetime


class DecisionHistoryResponse(BaseModel):
    items: list[DecisionHistoryItemDTO]
    limit: int


__all__ = [
    "DecisionRequestDTO",
    "ChoiceRequest",
    "UtteranceDTO",
    "DecisionResponse",
    "ChoiceResponse",
    "NudgeResponse",
    "ScoreResponse",
    "ScoreHistoryPointResponse",
    "DecisionHistoryItemDTO",
    "DecisionHistoryResponse",
]
