"""Domain models — 7 SQLModel tables for YesMan persistence.

NFR refs:
- FR-AUTH-02/03 (profiles)
- FR-HIST-01, FR-CV-06 (decisions with persona_outputs JSONB)
- FR-LEARN-06 (preference_profiles)
- NFR-PRIV-04 (silence_logs, body hash only)
- FR-PERSONA-01..12 (personas, persona_reports, user_persona_selections)
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import Column, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, SQLModel


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


# ============================================================
# Profile
# ============================================================
class Profile(SQLModel, table=True):
    __tablename__ = "profiles"

    user_id: UUID = Field(primary_key=True, description="= Cognito sub")
    email: str = Field(max_length=255, unique=True, index=True)
    age_group: str | None = Field(default=None, max_length=20)
    gender: list[str] = Field(
        default_factory=list,
        sa_column=Column(JSONB, nullable=False, server_default="[]"),
    )
    occupation: str | None = Field(default=None, max_length=100)
    value_tags: list[str] = Field(
        default_factory=list,
        sa_column=Column(JSONB, nullable=False, server_default="[]"),
    )
    preferences: dict[str, str] = Field(
        default_factory=dict,
        sa_column=Column(JSONB, nullable=False, server_default="{}"),
    )
    life_stage: str | None = Field(default=None, max_length=50)
    created_at: datetime = Field(default_factory=_utcnow)
    updated_at: datetime = Field(default_factory=_utcnow)


# ============================================================
# Decision
# ============================================================
class Decision(SQLModel, table=True):
    __tablename__ = "decisions"
    __table_args__ = ()

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    user_id: UUID = Field(foreign_key="profiles.user_id", index=True)
    domain_classification: str = Field(max_length=50)
    """Allowed values: daily | work | school | major | silenced (FR-DM)."""

    user_input: str = Field(sa_column=Column(Text, nullable=False))
    user_input_hash: str = Field(max_length=64, index=True, description="SHA-256 hex")
    proposal_text: str = Field(sa_column=Column(Text, nullable=False))
    persona_outputs: dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column(JSONB, nullable=False, server_default="{}"),
        description="{persona_name: utterance, ...} - FR-CV-06 用",
    )
    rationale: str | None = Field(default=None, sa_column=Column(Text))
    user_choice: str = Field(max_length=10, description="yes | no | pending")
    no_attempt_count: int = Field(default=0)
    llm_provider: str = Field(max_length=50)
    selected_persona_ids: list[str] = Field(
        default_factory=list,
        sa_column=Column(JSONB, nullable=False, server_default="[]"),
        description="UUID strings (max 3) of personas used in this decision",
    )
    created_at: datetime = Field(default_factory=_utcnow, index=True)


# ============================================================
# PreferenceProfile
# ============================================================
class PreferenceProfile(SQLModel, table=True):
    __tablename__ = "preference_profiles"

    user_id: UUID = Field(primary_key=True, foreign_key="profiles.user_id")
    accepted_patterns: list[dict[str, Any]] = Field(
        default_factory=list,
        sa_column=Column(JSONB, nullable=False, server_default="[]"),
    )
    rejected_patterns: list[dict[str, Any]] = Field(
        default_factory=list,
        sa_column=Column(JSONB, nullable=False, server_default="[]"),
    )
    persona_style_preference: dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column(JSONB, nullable=False, server_default="{}"),
    )
    inferred_tags: list[str] = Field(
        default_factory=list,
        sa_column=Column(JSONB, nullable=False, server_default="[]"),
    )
    last_updated_at: datetime = Field(default_factory=_utcnow)


# ============================================================
# SilenceLog (NFR-PRIV-04: body NOT persisted, hash only)
# ============================================================
class SilenceLog(SQLModel, table=True):
    __tablename__ = "silence_logs"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    user_id: UUID = Field(foreign_key="profiles.user_id", index=True)
    detected_domain: str = Field(
        max_length=20, index=True, description="religion | election | violence | obscene"
    )
    triggered_by: str = Field(
        max_length=30, description="prompt-self-check | guardrails"
    )
    user_input_hash: str = Field(max_length=64, description="SHA-256 hex (body NOT stored)")
    created_at: datetime = Field(default_factory=_utcnow, index=True)


# ============================================================
# Persona (FR-PERSONA-01..12)
# ============================================================
class Persona(SQLModel, table=True):
    __tablename__ = "personas"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    owner_user_id: UUID = Field(foreign_key="profiles.user_id", index=True)
    name: str = Field(max_length=100)
    description: str = Field(max_length=500)
    prompt_text: str = Field(sa_column=Column(Text, nullable=False))
    avatar_url: str | None = Field(default=None, max_length=500)
    is_shared: bool = Field(default=False, index=True)
    is_blocked: bool = Field(default=False)
    is_builtin: bool = Field(default=False)
    is_deleted: bool = Field(default=False)
    usage_count: int = Field(default=0)
    yes_count: int = Field(default=0)
    created_at: datetime = Field(default_factory=_utcnow)
    updated_at: datetime = Field(default_factory=_utcnow)

    @property
    def yes_acceptance_rate(self) -> float:
        return self.yes_count / max(self.usage_count, 1)


# ============================================================
# PersonaReport (FR-PERSONA-08)
# ============================================================
class PersonaReport(SQLModel, table=True):
    __tablename__ = "persona_reports"
    __table_args__ = (
        UniqueConstraint("persona_id", "reporter_user_id", name="uq_persona_report_user"),
    )

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    persona_id: UUID = Field(foreign_key="personas.id", index=True)
    reporter_user_id: UUID = Field(foreign_key="profiles.user_id")
    reason: str = Field(
        max_length=30, description="silence-domain | malicious | copyright | other"
    )
    detail: str | None = Field(default=None, sa_column=Column(Text))
    status: str = Field(
        max_length=30,
        default="pending",
        index=True,
        description="pending | reviewed-blocked | reviewed-dismissed",
    )
    created_at: datetime = Field(default_factory=_utcnow)
    reviewed_at: datetime | None = Field(default=None)


# ============================================================
# UserPersonaSelection (FR-PERSONA-03, max 3 personas)
# ============================================================
class UserPersonaSelection(SQLModel, table=True):
    __tablename__ = "user_persona_selections"

    user_id: UUID = Field(primary_key=True, foreign_key="profiles.user_id")
    persona_ids: list[str] = Field(
        default_factory=list,
        sa_column=Column(JSONB, nullable=False, server_default="[]"),
        description="UUID strings, max 3 (アプリ層で検証)",
    )
    updated_at: datetime = Field(default_factory=_utcnow)


__all__ = [
    "Profile",
    "Decision",
    "PreferenceProfile",
    "SilenceLog",
    "Persona",
    "PersonaReport",
    "UserPersonaSelection",
]
