"""Decision API DTO (FR-AI / FR-NUDGE / FR-SCORE).

NFR Req I2 反映 + ultrathink Imp1 (ConsensusOutput vs DecisionResponse 分離):
- user_input max_length=100_000 (413 reject)
- ProfileResponse パターン踏襲 (Pydantic v2 + ConfigDict from_attributes=True)

2026-05-24 v4 (persona unification): 3 source mix 選択対応.
- selected_personas: [{source, id}] — builtin/anonymous/my の混在選択 (max 3)
- 旧 selected_persona_ids + persona_source は backward-compat で維持 (auto-migration)
- anonymous の random sampling + self injection は廃止
"""
from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


# ============================================================
# Request
# ============================================================
PersonaSourceLiteral = Literal["builtin", "anonymous", "my"]


class SelectedPersonaDTO(BaseModel):
    """3 source mix 選択用 entry. source ごとに id の解決先が異なる:
    - builtin / my: persona_repo の DB UUID
    - anonymous: pool_repo の persona_id (sub-deterministic UUID)
    """

    model_config = ConfigDict(extra="forbid")

    source: PersonaSourceLiteral
    id: UUID


class DecisionRequestDTO(BaseModel):
    model_config = ConfigDict(extra="forbid")

    user_input: str = Field(min_length=1, max_length=100_000)
    # 2026-05-24 v4: 新規 — 3 source mix 選択. 指定時はこれを優先 (max 3).
    selected_personas: list[SelectedPersonaDTO] | None = Field(default=None, max_length=3)
    # backward compat (~v3-γ): builtin/my 選択. selected_personas 未指定時のみ使用.
    selected_persona_ids: list[UUID] | None = None
    # 2026-05-23: Drill-down chain — Yes 連鎖時に親提案列を context として渡す.
    chain_context: list[str] | None = Field(default=None, max_length=10)
    # backward compat (~v3-γ): persona source 選択. selected_personas 未指定時のみ使用.
    persona_source: Literal["builtin", "anonymous"] = "builtin"


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


# issue #93: No 採択 → 別案到着後の YES nudge microcopy (同期 endpoint).
class YesNudgeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    stage: int = Field(ge=1, le=100, description="no_attempt_count (No 累積回数)")


class YesNudgeResponse(BaseModel):
    message: str = Field(description="LLM 生成 or fallback の microcopy (<= 60 字)")


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
    """履歴一覧のレスポンス DTO (FR-HIST-01)."""

    items: list[DecisionHistoryItemDTO]
    limit: int


__all__ = [
    "DecisionRequestDTO",
    "ChoiceRequest",
    "UtteranceDTO",
    "DecisionResponse",
    "ChoiceResponse",
    "NudgeResponse",
    "YesNudgeRequest",
    "YesNudgeResponse",
    "ScoreResponse",
    "ScoreHistoryPointResponse",
    "DecisionHistoryItemDTO",
    "DecisionHistoryResponse",
]
