"""Pydantic schema for AI pre-generated Quick-Start template pool.

spec: docs/superpowers/specs/2026-05-22-yes-no-quickstart-design.md §6.1
"""
from __future__ import annotations

import re
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

DayKind = Literal["weekday", "weekend", "any"]

_KEBAB_RE = re.compile(r"^[a-z][a-z0-9]*(-[a-z0-9]+)*$")


class QuickStartTemplate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(..., min_length=1, max_length=64)
    title: str = Field(..., min_length=1, max_length=60)
    hours: list[int] = Field(..., min_length=0, max_length=24)
    dayKind: DayKind
    preferenceTag: str | None = None
    priority: int = Field(..., ge=0, le=100)

    @field_validator("id")
    @classmethod
    def _validate_id(cls, v: str) -> str:
        if not _KEBAB_RE.match(v):
            raise ValueError(f"id must be kebab-case ASCII (got {v!r})")
        return v

    @field_validator("hours")
    @classmethod
    def _validate_hours(cls, v: list[int]) -> list[int]:
        for h in v:
            if not 0 <= h <= 23:
                raise ValueError(f"hours must be 0-23 (got {h})")
        # 重複排除し、安定 sort
        return sorted(set(v))


class QuickStartTemplatePool(BaseModel):
    """Top-level pool. JSON top に metadata、templates[] と catchAll を保持."""

    model_config = ConfigDict(extra="forbid")

    generatedAt: str
    generatedBy: str
    schemaVersion: Literal[1]
    templates: list[QuickStartTemplate] = Field(..., min_length=1)
    catchAll: QuickStartTemplate

    @field_validator("templates")
    @classmethod
    def _unique_ids(cls, v: list[QuickStartTemplate]) -> list[QuickStartTemplate]:
        seen: set[str] = set()
        for t in v:
            if t.id in seen:
                raise ValueError(f"duplicate template id: {t.id}")
            seen.add(t.id)
        return v


__all__ = ["DayKind", "QuickStartTemplate", "QuickStartTemplatePool"]
