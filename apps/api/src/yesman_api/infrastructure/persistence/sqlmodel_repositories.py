"""SQLModel + AsyncSession repository implementations (Aurora / Docker PostgreSQL).

Patterns (NFR Design §3 + Code Generation Plan):
- Repository は AsyncSession を inject される (DI、commit は呼び出し側責任)
- atomic UPDATE: personas.usage_count / yes_count は SQL `UPDATE ... SET col = col + 1` で実行
- UNIQUE 違反 (persona_reports) は IntegrityError → DuplicateReportError 変換
- SELECT 1 (DatabaseHealth.ping)
"""
from __future__ import annotations

from typing import Literal, cast
from uuid import UUID

from sqlalchemy import case, delete, func, literal, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from yesman_api.application.persistence.protocols import (
    DatabaseHealth,
    DecisionCountSummary,
    DuplicateReportError,
    SortOrder,
)
from yesman_api.domain.persistence.models import (
    Decision,
    Persona,
    PersonaReport,
    PreferenceProfile,
    Profile,
    SilenceLog,
    UserPersonaSelection,
)


# ============================================================
# ProfileRepository
# ============================================================
class SqlModelProfileRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get(self, user_id: UUID) -> Profile | None:
        return await self._session.get(Profile, user_id)

    async def upsert(self, profile: Profile) -> Profile:
        existing = await self._session.get(Profile, profile.user_id)
        if existing is None:
            self._session.add(profile)
            await self._session.flush()
            return profile
        # update fields
        existing.email = profile.email
        existing.age_group = profile.age_group
        existing.occupation = profile.occupation
        existing.value_tags = profile.value_tags
        existing.life_stage = profile.life_stage
        existing.updated_at = profile.updated_at
        await self._session.flush()
        return existing

    async def delete(self, user_id: UUID) -> None:
        await self._session.execute(delete(Profile).where(Profile.user_id == user_id))
        await self._session.flush()


# ============================================================
# DecisionRepository
# ============================================================
class SqlModelDecisionRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def insert(self, decision: Decision) -> Decision:
        self._session.add(decision)
        await self._session.flush()
        return decision

    async def update_choice(
        self,
        decision_id: UUID,
        choice: Literal["yes", "no"],
        no_count: int,
    ) -> Decision:
        d = await self._session.get(Decision, decision_id)
        if d is None:
            raise KeyError(f"Decision {decision_id} not found")
        d.user_choice = choice
        d.no_attempt_count = no_count
        await self._session.flush()
        return d

    async def get(self, decision_id: UUID) -> Decision | None:
        return await self._session.get(Decision, decision_id)

    async def list_by_user(
        self,
        user_id: UUID,
        limit: int = 100,
        offset: int = 0,
        order_by: Literal["created_at_desc", "created_at_asc"] = "created_at_desc",
    ) -> list[Decision]:
        stmt = select(Decision).where(Decision.user_id == user_id)
        if order_by == "created_at_desc":
            stmt = stmt.order_by(Decision.created_at.desc())  # type: ignore[attr-defined]
        else:
            stmt = stmt.order_by(Decision.created_at.asc())  # type: ignore[attr-defined]
        stmt = stmt.limit(limit).offset(offset)
        result = await self._session.execute(stmt)
        return list(result.scalars().all())

    async def count_no_by_user(self, user_id: UUID) -> DecisionCountSummary:
        # U4 Phase A.0 patch (FR-SCORE-01 / NFR Req Imp5): pending は AutonomyScorer の母数から除外
        no_expr = func.coalesce(
            func.sum(case((Decision.user_choice == "no", 1), else_=0)),
            literal(0),
        )
        total_expr = func.coalesce(
            func.sum(case((Decision.user_choice.in_(["yes", "no"]), 1), else_=0)),
            literal(0),
        )
        stmt = select(no_expr, total_expr).where(Decision.user_id == user_id)
        result = await self._session.execute(stmt)
        row = result.one()
        return {"no_count": int(row[0] or 0), "total": int(row[1] or 0)}

    async def search_by_input_hash(
        self, user_id: UUID, input_hash: str
    ) -> list[Decision]:
        stmt = (
            select(Decision)
            .where(Decision.user_id == user_id)
            .where(Decision.user_input_hash == input_hash)
            .order_by(Decision.created_at.desc())  # type: ignore[attr-defined]
        )
        result = await self._session.execute(stmt)
        return list(result.scalars().all())


# ============================================================
# PreferenceProfileRepository
# ============================================================
class SqlModelPreferenceProfileRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get(self, user_id: UUID) -> PreferenceProfile | None:
        return await self._session.get(PreferenceProfile, user_id)

    async def upsert(self, profile: PreferenceProfile) -> PreferenceProfile:
        existing = await self._session.get(PreferenceProfile, profile.user_id)
        if existing is None:
            self._session.add(profile)
            await self._session.flush()
            return profile
        existing.accepted_patterns = profile.accepted_patterns
        existing.rejected_patterns = profile.rejected_patterns
        existing.persona_style_preference = profile.persona_style_preference
        existing.inferred_tags = profile.inferred_tags
        existing.last_updated_at = profile.last_updated_at
        await self._session.flush()
        return existing

    async def delete(self, user_id: UUID) -> None:
        await self._session.execute(
            delete(PreferenceProfile).where(PreferenceProfile.user_id == user_id)
        )
        await self._session.flush()


# ============================================================
# SilenceLogRepository
# ============================================================
class SqlModelSilenceLogRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def insert(self, log: SilenceLog) -> SilenceLog:
        self._session.add(log)
        await self._session.flush()
        return log

    async def list_by_user(
        self, user_id: UUID, limit: int = 100
    ) -> list[SilenceLog]:
        stmt = (
            select(SilenceLog)
            .where(SilenceLog.user_id == user_id)
            .order_by(SilenceLog.created_at.desc())  # type: ignore[attr-defined]
            .limit(limit)
        )
        result = await self._session.execute(stmt)
        return list(result.scalars().all())

    async def count_by_domain(self, user_id: UUID) -> dict[str, int]:
        stmt = (
            select(SilenceLog.detected_domain, func.count(SilenceLog.id))
            .where(SilenceLog.user_id == user_id)
            .group_by(SilenceLog.detected_domain)
        )
        result = await self._session.execute(stmt)
        return {str(domain): int(count) for domain, count in result.all()}


# ============================================================
# PersonaRepository
# ============================================================
class SqlModelPersonaRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def insert(self, persona: Persona) -> Persona:
        self._session.add(persona)
        await self._session.flush()
        return persona

    async def update(self, persona: Persona) -> Persona:
        # SQLModel: assume persona is attached or merged
        merged = await self._session.merge(persona)
        await self._session.flush()
        return merged

    async def soft_delete(self, persona_id: UUID) -> None:
        await self._session.execute(
            update(Persona).where(Persona.id == persona_id).values(is_deleted=True)
        )
        await self._session.flush()

    async def get(self, persona_id: UUID) -> Persona | None:
        return await self._session.get(Persona, persona_id)

    async def list_by_owner(
        self, owner_id: UUID, include_deleted: bool = False
    ) -> list[Persona]:
        stmt = select(Persona).where(Persona.owner_user_id == owner_id)
        if not include_deleted:
            stmt = stmt.where(Persona.is_deleted == False)  # noqa: E712
        result = await self._session.execute(stmt)
        return list(result.scalars().all())

    async def list_shared(
        self,
        page: int = 0,
        page_size: int = 20,
        sort: SortOrder = "popularity",
    ) -> list[Persona]:
        stmt = (
            select(Persona)
            .where(Persona.is_shared == True)  # noqa: E712
            .where(Persona.is_deleted == False)  # noqa: E712
            .where(Persona.is_blocked == False)  # noqa: E712
        )
        if sort == "popularity":
            stmt = stmt.order_by(Persona.usage_count.desc())  # type: ignore[attr-defined]
        elif sort == "newest":
            stmt = stmt.order_by(Persona.created_at.desc())  # type: ignore[attr-defined]
        elif sort == "acceptance":
            # PostgreSQL 計算式 (yes_count / GREATEST(usage_count, 1))
            ratio = Persona.yes_count / func.greatest(Persona.usage_count, 1)
            stmt = stmt.order_by(ratio.desc())
        stmt = stmt.limit(page_size).offset(page * page_size)
        result = await self._session.execute(stmt)
        return list(result.scalars().all())

    async def record_usage(self, persona_id: UUID, was_yes: bool) -> None:
        """Atomic: usage_count += 1, yes_count += (1 if was_yes else 0)."""
        await self._session.execute(
            update(Persona)
            .where(Persona.id == persona_id)
            .values(
                usage_count=Persona.usage_count + 1,
                yes_count=Persona.yes_count + (1 if was_yes else 0),
            )
        )
        await self._session.flush()

    async def block(self, persona_id: UUID) -> None:
        await self._session.execute(
            update(Persona).where(Persona.id == persona_id).values(is_blocked=True)
        )
        await self._session.flush()


# ============================================================
# PersonaReportRepository
# ============================================================
class SqlModelPersonaReportRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def insert(self, report: PersonaReport) -> PersonaReport:
        try:
            self._session.add(report)
            await self._session.flush()
        except IntegrityError as e:
            await self._session.rollback()
            raise DuplicateReportError(
                f"User {report.reporter_user_id} already reported persona {report.persona_id}"
            ) from e
        return report

    async def list_pending(self) -> list[PersonaReport]:
        stmt = (
            select(PersonaReport)
            .where(PersonaReport.status == "pending")
            .order_by(PersonaReport.created_at.asc())  # type: ignore[attr-defined]
        )
        result = await self._session.execute(stmt)
        return list(result.scalars().all())

    async def count_by_persona(
        self, persona_id: UUID, status: str = "pending"
    ) -> int:
        stmt = (
            select(func.count(PersonaReport.id))
            .where(PersonaReport.persona_id == persona_id)
            .where(PersonaReport.status == status)
        )
        result = await self._session.execute(stmt)
        return int(result.scalar_one())

    async def mark_reviewed(
        self, report_id: UUID, decision: Literal["block", "dismiss"]
    ) -> None:
        new_status = "reviewed-blocked" if decision == "block" else "reviewed-dismissed"
        await self._session.execute(
            update(PersonaReport)
            .where(PersonaReport.id == report_id)
            .values(status=new_status, reviewed_at=func.now())
        )
        await self._session.flush()


# ============================================================
# UserPersonaSelectionRepository
# ============================================================
class SqlModelUserPersonaSelectionRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get(self, user_id: UUID) -> UserPersonaSelection | None:
        return await self._session.get(UserPersonaSelection, user_id)

    async def upsert(
        self, selection: UserPersonaSelection
    ) -> UserPersonaSelection:
        existing = await self._session.get(UserPersonaSelection, selection.user_id)
        if existing is None:
            self._session.add(selection)
            await self._session.flush()
            return selection
        existing.persona_ids = selection.persona_ids
        existing.updated_at = selection.updated_at
        await self._session.flush()
        return existing


# ============================================================
# DatabaseHealth
# ============================================================
class SqlModelDatabaseHealth(DatabaseHealth):
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def ping(self) -> bool:
        result = await self._session.execute(select(literal(1)))
        return cast(int, result.scalar_one()) == 1


__all__ = [
    "SqlModelProfileRepository",
    "SqlModelDecisionRepository",
    "SqlModelPreferenceProfileRepository",
    "SqlModelSilenceLogRepository",
    "SqlModelPersonaRepository",
    "SqlModelPersonaReportRepository",
    "SqlModelUserPersonaSelectionRepository",
    "SqlModelDatabaseHealth",
]
