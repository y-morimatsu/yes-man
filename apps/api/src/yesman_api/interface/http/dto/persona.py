"""Persona API DTO (U-Persona FR-PERSONA-01〜10).

NFR Design §6 + ultrathink FD I3 (sort Literal validate) 反映.
"""
from __future__ import annotations

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


# ============================================================
# Response
# ============================================================
class PersonaResponse(BaseModel):
    """自分の persona 詳細 / builtin (read 系)."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    owner_user_id: UUID
    name: str
    description: str | None
    avatar_url: str | None
    prompt_text: str
    is_shared: bool
    is_builtin: bool
    is_blocked: bool
    usage_count: int
    yes_count: int


class SharedPersonaSummaryResponse(BaseModel):
    """共有プール listing 用 (匿名化済、prompt_text 非公開 NFR-PRIV-07)."""

    id: UUID
    name: str
    description: str | None
    avatar_url: str | None
    usage_count: int
    yes_acceptance_rate: float
    creator_anonymous_id: str


class PersonaSelectionResponse(BaseModel):
    persona_ids: list[UUID]


# ============================================================
# Request
# ============================================================
class PersonaCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=50)
    description: str | None = Field(default=None, max_length=200)
    # 2026-05-26: ハッカソン UX 向上のため min_length 30 → 10 に緩和.
    prompt_text: str = Field(min_length=10, max_length=2000)
    avatar_url: str | None = Field(default=None, max_length=500)


class PersonaUpdateRequest(BaseModel):
    """PATCH なので全 field optional."""

    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=50)
    description: str | None = Field(default=None, max_length=200)
    prompt_text: str | None = Field(default=None, min_length=10, max_length=2000)
    avatar_url: str | None = Field(default=None, max_length=500)


class PersonaShareRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    shared: bool


class PersonaReportRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    reason: Literal["silence-domain", "malicious", "copyright", "other"]
    detail: str | None = Field(default=None, max_length=500)


class PersonaSelectionUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    persona_ids: list[UUID] = Field(min_length=1, max_length=3)


# ============================================================
# Query (shared listing)
# ============================================================
SharedSortLiteral = Literal["popularity", "newest", "acceptance"]


__all__ = [
    "PersonaResponse",
    "SharedPersonaSummaryResponse",
    "PersonaSelectionResponse",
    "PersonaCreateRequest",
    "PersonaUpdateRequest",
    "PersonaShareRequest",
    "PersonaReportRequest",
    "PersonaSelectionUpdateRequest",
    "SharedSortLiteral",
]
