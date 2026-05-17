"""U-Persona ドメインモデル (永続化前 / API 用).

永続化対象 (personas / persona_reports / user_persona_selections) は U2 既存.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal
from uuid import UUID


SilenceDomain = Literal["religion", "election", "violence", "obscene"]


@dataclass(frozen=True, slots=True)
class ModerationVerdict:
    is_allowed: bool
    rejected_domain: SilenceDomain | None = None
    rejected_reason: str | None = None


@dataclass(frozen=True, slots=True)
class PersonaSummary:
    """共有プール用の匿名化済 summary (NFR-PRIV-06 + FR-PERSONA-09)."""

    id: UUID
    name: str
    description: str | None
    avatar_url: str | None
    usage_count: int
    yes_acceptance_rate: float  # = yes_count / usage_count (0.0 if usage_count==0)
    creator_anonymous_id: str  # hash(owner_user_id + salt) で匿名化


__all__ = ["ModerationVerdict", "PersonaSummary", "SilenceDomain"]
