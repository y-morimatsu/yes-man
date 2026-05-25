"""DTOs for /v1/persona-pool/* endpoints.

Pydantic は frozen=True dataclass の AnonymousPersonaSpec を `model_validate` できないため、
小さな手書き converter を持つ (`from_spec`).
"""
from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from yesman_api.domain.persona_pool.models import (
    AnonymousPersonaSpec,
    MIN_SIGNAL_TOTAL,
    PoolCitation,
)


class AnonymousPersonaDTO(BaseModel):
    """Persona spec — API 流通用 (user.sub は絶対に含めない、NFR-6)."""

    model_config = ConfigDict(frozen=True)

    persona_id: UUID
    value_tags: list[str]
    primary_language: Literal["ja", "en", "fr", "ar", "zh"]
    formality: Literal["polite", "casual", "blunt"]

    @classmethod
    def from_spec(cls, spec: AnonymousPersonaSpec) -> "AnonymousPersonaDTO":
        return cls(
            persona_id=spec.persona_id,
            value_tags=list(spec.value_tags),
            primary_language=spec.primary_language,
            formality=spec.formality,
        )


class PoolGuardInfo(BaseModel):
    """FR-9 / US-2.4 opt-in guard 情報."""

    model_config = ConfigDict(frozen=True)

    signal_total: int = Field(ge=0)
    min_required: int = Field(default=MIN_SIGNAL_TOTAL, ge=0)
    is_eligible: bool


class PoolStatusResponse(BaseModel):
    """GET /v1/persona-pool/me 用 — 現在状態 + preview + guard."""

    model_config = ConfigDict(frozen=True)

    opted_in: bool
    preview: AnonymousPersonaDTO | None
    guard: PoolGuardInfo


class RandomPoolResponse(BaseModel):
    """GET /v1/persona-pool/random 用."""

    model_config = ConfigDict(frozen=True)

    personas: list[AnonymousPersonaDTO]


class CitationCountResponse(BaseModel):
    """GET /v1/persona-pool/me/citations 用 — US-2.2 「今日 N 件」."""

    model_config = ConfigDict(frozen=True)

    today_count: int = Field(ge=0)
    all_time_count: int = Field(ge=0)


class CitedHistoryItem(BaseModel):
    """過去合議で呼ばれた anonymous persona の表示用 row (US-3.1 / US-3.2)."""

    model_config = ConfigDict(frozen=True)

    cited_persona_id: UUID
    cited_at: datetime
    persona: AnonymousPersonaDTO | None  # spec が pool から消えていれば None


class CitedHistoryResponse(BaseModel):
    """GET /v1/persona-pool/cited-by-me 用."""

    model_config = ConfigDict(frozen=True)

    items: list[CitedHistoryItem]

    @classmethod
    def build(
        cls,
        *,
        citations: list[PoolCitation],
        spec_lookup: dict[UUID, AnonymousPersonaSpec],
    ) -> "CitedHistoryResponse":
        items = [
            CitedHistoryItem(
                cited_persona_id=c.cited_persona_id,
                cited_at=c.cited_at,
                persona=AnonymousPersonaDTO.from_spec(spec_lookup[c.cited_persona_id])
                if c.cited_persona_id in spec_lookup
                else None,
            )
            for c in citations
        ]
        return cls(items=items)


__all__ = [
    "AnonymousPersonaDTO",
    "CitationCountResponse",
    "CitedHistoryItem",
    "CitedHistoryResponse",
    "PoolGuardInfo",
    "PoolStatusResponse",
    "RandomPoolResponse",
]
