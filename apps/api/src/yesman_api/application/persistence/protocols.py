"""Repository Protocols — pure interface definitions (no implementation).

All methods are async. Implementations: SqlModel* (Aurora / Docker PostgreSQL) and Mock* (in-memory).

Repository 層は常に `user_id: UUID` を引数で受け取り、cross-user データアクセスを構造的に防ぐ (FR-CV-11 / SEC-U2-06)。
"""
from __future__ import annotations

from typing import Literal, Protocol, TypedDict
from uuid import UUID

from yesman_api.domain.persistence.models import (  # type: ignore[import-not-found]
    Decision,
    Persona,
    PersonaReport,
    PreferenceProfile,
    Profile,
    SilenceLog,
    UserPersonaSelection,
)


# ============================================================
# Custom Exceptions
# ============================================================
class RepositoryError(Exception):
    """Base for repository-level errors."""


class DuplicateReportError(RepositoryError):
    """A user reports the same persona twice (UNIQUE constraint violation)."""


# ============================================================
# Return types
# ============================================================
class DecisionCountSummary(TypedDict):
    no_count: int
    total: int


SortOrder = Literal["popularity", "newest", "acceptance"]


# ============================================================
# ProfileRepository
# ============================================================
class ProfileRepository(Protocol):
    async def get(self, user_id: UUID) -> Profile | None: ...
    async def upsert(self, profile: Profile) -> Profile: ...
    async def delete(self, user_id: UUID) -> None: ...


# ============================================================
# DecisionRepository
# ============================================================
class DecisionRepository(Protocol):
    async def insert(self, decision: Decision) -> Decision: ...

    async def update_choice(
        self,
        decision_id: UUID,
        choice: Literal["yes", "no"],
        no_count: int,
    ) -> Decision: ...

    async def get(self, decision_id: UUID) -> Decision | None: ...

    async def list_by_user(
        self,
        user_id: UUID,
        limit: int = 100,
        offset: int = 0,
        order_by: Literal["created_at_desc", "created_at_asc"] = "created_at_desc",
    ) -> list[Decision]: ...

    async def count_no_by_user(self, user_id: UUID) -> DecisionCountSummary: ...

    async def search_by_input_hash(
        self, user_id: UUID, input_hash: str
    ) -> list[Decision]: ...


# ============================================================
# PreferenceProfileRepository
# ============================================================
class PreferenceProfileRepository(Protocol):
    async def get(self, user_id: UUID) -> PreferenceProfile | None: ...
    async def upsert(self, profile: PreferenceProfile) -> PreferenceProfile: ...
    async def delete(self, user_id: UUID) -> None: ...  # FR-LEARN-04 リセット


# ============================================================
# SilenceLogRepository
# ============================================================
class SilenceLogRepository(Protocol):
    async def insert(self, log: SilenceLog) -> SilenceLog: ...
    async def list_by_user(
        self, user_id: UUID, limit: int = 100
    ) -> list[SilenceLog]: ...
    async def count_by_domain(self, user_id: UUID) -> dict[str, int]: ...


# ============================================================
# PersonaRepository
# ============================================================
class PersonaRepository(Protocol):
    async def insert(self, persona: Persona) -> Persona: ...
    async def update(self, persona: Persona) -> Persona: ...
    async def soft_delete(self, persona_id: UUID) -> None: ...
    async def get(self, persona_id: UUID) -> Persona | None: ...
    async def list_by_owner(
        self, owner_id: UUID, include_deleted: bool = False
    ) -> list[Persona]: ...

    async def list_shared(
        self,
        page: int = 0,
        page_size: int = 20,
        sort: SortOrder = "popularity",
    ) -> list[Persona]: ...

    async def record_usage(self, persona_id: UUID, was_yes: bool) -> None:
        """Atomic: usage_count += 1, yes_count += (1 if was_yes else 0)."""
        ...

    async def block(self, persona_id: UUID) -> None: ...


# ============================================================
# PersonaReportRepository
# ============================================================
class PersonaReportRepository(Protocol):
    async def insert(self, report: PersonaReport) -> PersonaReport:
        """Raises DuplicateReportError if (persona_id, reporter_user_id) already exists."""
        ...

    async def list_pending(self) -> list[PersonaReport]: ...
    async def count_by_persona(
        self, persona_id: UUID, status: str = "pending"
    ) -> int: ...

    async def mark_reviewed(
        self, report_id: UUID, decision: Literal["block", "dismiss"]
    ) -> None: ...


# ============================================================
# UserPersonaSelectionRepository
# ============================================================
class UserPersonaSelectionRepository(Protocol):
    async def get(self, user_id: UUID) -> UserPersonaSelection | None: ...
    async def upsert(
        self, selection: UserPersonaSelection
    ) -> UserPersonaSelection: ...


# ============================================================
# DatabaseHealth (for /health endpoint)
# ============================================================
class DatabaseHealth(Protocol):
    async def ping(self) -> bool:
        """SELECT 1 (or MOCK: True). Returns True on success."""
        ...


__all__ = [
    "ProfileRepository",
    "DecisionRepository",
    "PreferenceProfileRepository",
    "SilenceLogRepository",
    "PersonaRepository",
    "PersonaReportRepository",
    "UserPersonaSelectionRepository",
    "DatabaseHealth",
    "DecisionCountSummary",
    "RepositoryError",
    "DuplicateReportError",
    "SortOrder",
]
