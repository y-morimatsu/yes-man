"""Preference API DTO (FR-LEARN-04).

NFR Design §6 + ultrathink FD Imp3 (PATCH clip 強制) 反映.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


class PreferenceProfileResponse(BaseModel):
    """GET /v1/preferences/me + PATCH の戻り値."""

    model_config = ConfigDict(from_attributes=True)

    user_id: UUID
    accepted_patterns: list[dict[str, Any]] = Field(default_factory=list)
    rejected_patterns: list[dict[str, Any]] = Field(default_factory=list)
    persona_style_preference: dict[str, float] = Field(default_factory=dict)
    inferred_tags: list[str] = Field(default_factory=list)
    last_updated_at: datetime


class PreferenceProfileUpdateRequest(BaseModel):
    """PATCH /v1/preferences/me リクエスト — 全フィールド optional.

    上限 (NFR Req SEC-U5-06):
    - accepted/rejected_patterns ≤ 100 件
    - persona_style_preference ≤ 50 key + 値域 [-1.0, 1.0]
    - inferred_tags ≤ 50 件

    persona_style_preference は DTO で validation + handler 側でも clip 強制 (defense-in-depth).
    OpenAPI に上限を露出させるため `field_validator` を使用.
    """

    model_config = ConfigDict(extra="forbid")

    accepted_patterns: list[dict[str, Any]] | None = Field(default=None, max_length=100)
    rejected_patterns: list[dict[str, Any]] | None = Field(default=None, max_length=100)
    persona_style_preference: dict[str, float] | None = Field(default=None)
    inferred_tags: list[str] | None = Field(default=None, max_length=50)

    @field_validator("persona_style_preference")
    @classmethod
    def _validate_persona_style(
        cls, v: dict[str, float] | None
    ) -> dict[str, float] | None:
        if v is None:
            return v
        if len(v) > 50:
            raise ValueError("persona_style_preference must have at most 50 keys")
        for key, score in v.items():
            if not isinstance(score, (int, float)):
                raise ValueError(
                    f"persona_style_preference[{key!r}] must be numeric"
                )
            if not (-1.0 <= float(score) <= 1.0):
                raise ValueError(
                    f"persona_style_preference[{key!r}] must be within [-1.0, 1.0]"
                )
        return v


__all__ = ["PreferenceProfileResponse", "PreferenceProfileUpdateRequest"]
