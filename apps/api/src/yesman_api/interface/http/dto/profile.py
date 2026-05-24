"""Profile API DTO (FR-AUTH-02, FR-AUTH-04).

FD §6.2 確定: Profile PK は user_id (= Cognito sub)、DTO もそのまま user_id 命名。
ProfileUpdateRequest は全フィールド optional (部分更新)、SEC-U3-09 で max 制約を持つ。

2026-05-24: avatar_config (mode/color/emoji/image_url) を追加.
"""
from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class AvatarConfig(BaseModel):
    """User avatar customization (mode + color/emoji/image).

    - mode="default": fallback (green gradient + display_name 頭文字)
    - mode="color":   color preset + display_name 頭文字
    - mode="emoji":   emoji 1 字 (color は背景に使用、なければ default 色)
    - mode="image":   image_url 表示 (Phase 2)
    """

    model_config = ConfigDict(extra="forbid")

    mode: Literal["default", "color", "emoji", "image"] = "default"
    color: (
        Literal[
            "green", "orange", "blue", "purple", "pink", "yellow", "teal", "umber"
        ]
        | None
    ) = None
    emoji: str | None = Field(default=None, max_length=8)
    image_url: str | None = Field(default=None, max_length=500)


class ProfileResponse(BaseModel):
    """GET / PATCH レスポンス + DELETE 前の確認用."""

    model_config = ConfigDict(from_attributes=True)  # SQLModel オブジェクトから model_validate

    user_id: UUID
    email: EmailStr
    age_group: str | None = None
    gender: list[str] = Field(default_factory=list)
    occupation: str | None = None
    value_tags: list[str] = Field(default_factory=list)
    preferences: dict[str, str] = Field(default_factory=dict)
    life_stage: str | None = None
    avatar_config: AvatarConfig | None = None
    created_at: datetime
    updated_at: datetime


class ProfileUpdateRequest(BaseModel):
    """PATCH /v1/profiles/me リクエスト — 全フィールド optional (`exclude_unset=True` で部分更新)."""

    model_config = ConfigDict(extra="forbid")

    age_group: str | None = Field(default=None, max_length=20)
    gender: list[str] | None = Field(default=None, max_length=10)
    occupation: str | None = Field(default=None, max_length=100)
    value_tags: list[str] | None = Field(default=None, max_length=20)
    preferences: dict[str, str] | None = Field(default=None, max_length=50)
    life_stage: str | None = Field(default=None, max_length=50)
    avatar_config: AvatarConfig | None = None


__all__ = ["AvatarConfig", "ProfileResponse", "ProfileUpdateRequest"]
