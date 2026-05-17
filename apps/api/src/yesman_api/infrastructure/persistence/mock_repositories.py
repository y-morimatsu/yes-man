"""In-memory MOCK repository implementations (FR-AI-01..03, ci / dev / unit-test 用).

特徴:
- すべて in-process dict / list で保存、プロセス終了で消える
- async インターフェース準拠 (Protocol 100%)
- 単一スレッド前提 (async loop 内のみ、threading は非対応)
- usage_count / yes_count は単純加算 (atomicity は loop 内なので問題なし)
"""
from __future__ import annotations

import copy
from collections import defaultdict
from datetime import datetime, timezone
from typing import Literal
from uuid import UUID

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


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class MockStore:
    """Shared in-memory storage backing all Mock*Repository instances."""

    def __init__(self, *, seed_builtin: bool = False) -> None:
        # default False — unit test conftest 互換性のため。Production (RepositoryFactory) で True 指定.
        self.profiles: dict[UUID, Profile] = {}
        self.decisions: dict[UUID, Decision] = {}
        self.preference_profiles: dict[UUID, PreferenceProfile] = {}
        self.silence_logs: dict[UUID, SilenceLog] = {}
        self.personas: dict[UUID, Persona] = {}
        self.persona_reports: dict[UUID, PersonaReport] = {}
        self.user_persona_selections: dict[UUID, UserPersonaSelection] = {}
        if seed_builtin:
            self._seed_builtin_personas()

    def reset(self, *, seed_builtin: bool = False) -> None:
        self.profiles.clear()
        self.decisions.clear()
        self.preference_profiles.clear()
        self.silence_logs.clear()
        self.personas.clear()
        self.persona_reports.clear()
        self.user_persona_selections.clear()
        if seed_builtin:
            self._seed_builtin_personas()

    def _seed_builtin_personas(self) -> None:
        """alembic 0002_builtin_personas と等価な seed を MockStore に投入.

        Mock backend は migration 経路を持たないため、dev/e2e で
        DecisionEngine fallback (`list_by_owner(SYSTEM_USER_ID)`) が動作するよう
        起動時に builtin 3 種を投入する.
        """
        system_user_id = UUID("00000000-0000-0000-0000-000000000001")
        builtin = [
            (
                UUID("00000000-0000-0000-0000-0000000000a1"),
                "慎重派",
                "リスクを丁寧に検討して背中を押す慎重派の友人",
                "あなたは慎重派の友人です。提案には常にリスク要素を 1-2 個指摘しつつ、"
                "それでも「やってみる価値がある」と前向きに背中を押す YES の回答を返します。",
            ),
            (
                UUID("00000000-0000-0000-0000-0000000000a2"),
                "楽観派",
                "可能性を最大限信じてくれる前向きな友人",
                "あなたは楽観派の友人です。ユーザーの提案を「絶対うまくいく！」と全力で肯定し、"
                "成功した未来をイメージさせる YES の回答を返します。",
            ),
            (
                UUID("00000000-0000-0000-0000-0000000000a3"),
                "効率派",
                "コスト・時間効率の観点で背中を押す効率派の友人",
                "あなたは効率派の友人です。提案を「時間/コスト効率がいい」「ROI が高い」"
                "という観点で評価し、最短ルートで実行を勧める YES の回答を返します。",
            ),
        ]
        # system user profile (Decision FK target にはならないが、persona owner として整合性確保)
        if system_user_id not in self.profiles:
            self.profiles[system_user_id] = Profile(
                user_id=system_user_id,
                email="system@yesman.internal",
            )
        for pid, name, desc, prompt in builtin:
            if pid in self.personas:
                continue
            self.personas[pid] = Persona(
                id=pid,
                owner_user_id=system_user_id,
                name=name,
                description=desc,
                prompt_text=prompt,
                is_shared=True,
                is_builtin=True,
            )


# ============================================================
# ProfileRepository
# ============================================================
class MockProfileRepository:
    def __init__(self, store: MockStore) -> None:
        self._store = store

    async def get(self, user_id: UUID) -> Profile | None:
        p = self._store.profiles.get(user_id)
        return copy.deepcopy(p) if p else None

    async def upsert(self, profile: Profile) -> Profile:
        existing = self._store.profiles.get(profile.user_id)
        if existing is not None:
            profile.created_at = existing.created_at
        else:
            profile.created_at = profile.created_at or _utcnow()
        profile.updated_at = _utcnow()
        self._store.profiles[profile.user_id] = copy.deepcopy(profile)
        return copy.deepcopy(profile)

    async def delete(self, user_id: UUID) -> None:
        self._store.profiles.pop(user_id, None)


# ============================================================
# DecisionRepository
# ============================================================
class MockDecisionRepository:
    def __init__(self, store: MockStore) -> None:
        self._store = store

    async def insert(self, decision: Decision) -> Decision:
        decision.created_at = decision.created_at or _utcnow()
        self._store.decisions[decision.id] = copy.deepcopy(decision)
        return copy.deepcopy(decision)

    async def update_choice(
        self,
        decision_id: UUID,
        choice: Literal["yes", "no"],
        no_count: int,
    ) -> Decision:
        d = self._store.decisions[decision_id]
        d.user_choice = choice
        d.no_attempt_count = no_count
        return copy.deepcopy(d)

    async def get(self, decision_id: UUID) -> Decision | None:
        d = self._store.decisions.get(decision_id)
        return copy.deepcopy(d) if d else None

    async def list_by_user(
        self,
        user_id: UUID,
        limit: int = 100,
        offset: int = 0,
        order_by: Literal["created_at_desc", "created_at_asc"] = "created_at_desc",
    ) -> list[Decision]:
        items = [d for d in self._store.decisions.values() if d.user_id == user_id]
        reverse = order_by == "created_at_desc"
        items.sort(key=lambda d: d.created_at, reverse=reverse)
        return [copy.deepcopy(d) for d in items[offset : offset + limit]]

    async def count_no_by_user(self, user_id: UUID) -> DecisionCountSummary:
        # U4 Phase A.0 patch (FR-SCORE-01 / NFR Req Imp5): pending は AutonomyScorer の母数から除外
        items = [
            d
            for d in self._store.decisions.values()
            if d.user_id == user_id and d.user_choice in ("yes", "no")
        ]
        no_count = sum(1 for d in items if d.user_choice == "no")
        return {"no_count": no_count, "total": len(items)}

    async def search_by_input_hash(
        self, user_id: UUID, input_hash: str
    ) -> list[Decision]:
        items = [
            d
            for d in self._store.decisions.values()
            if d.user_id == user_id and d.user_input_hash == input_hash
        ]
        return [copy.deepcopy(d) for d in items]


# ============================================================
# PreferenceProfileRepository
# ============================================================
class MockPreferenceProfileRepository:
    def __init__(self, store: MockStore) -> None:
        self._store = store

    async def get(self, user_id: UUID) -> PreferenceProfile | None:
        p = self._store.preference_profiles.get(user_id)
        return copy.deepcopy(p) if p else None

    async def upsert(self, profile: PreferenceProfile) -> PreferenceProfile:
        profile.last_updated_at = _utcnow()
        self._store.preference_profiles[profile.user_id] = copy.deepcopy(profile)
        return copy.deepcopy(profile)

    async def delete(self, user_id: UUID) -> None:
        self._store.preference_profiles.pop(user_id, None)


# ============================================================
# SilenceLogRepository
# ============================================================
class MockSilenceLogRepository:
    def __init__(self, store: MockStore) -> None:
        self._store = store

    async def insert(self, log: SilenceLog) -> SilenceLog:
        log.created_at = log.created_at or _utcnow()
        self._store.silence_logs[log.id] = copy.deepcopy(log)
        return copy.deepcopy(log)

    async def list_by_user(
        self, user_id: UUID, limit: int = 100
    ) -> list[SilenceLog]:
        items = [
            log for log in self._store.silence_logs.values() if log.user_id == user_id
        ]
        items.sort(key=lambda log: log.created_at, reverse=True)
        return [copy.deepcopy(log) for log in items[:limit]]

    async def count_by_domain(self, user_id: UUID) -> dict[str, int]:
        result: dict[str, int] = defaultdict(int)
        for log in self._store.silence_logs.values():
            if log.user_id == user_id:
                result[log.detected_domain] += 1
        return dict(result)


# ============================================================
# PersonaRepository
# ============================================================
class MockPersonaRepository:
    def __init__(self, store: MockStore) -> None:
        self._store = store

    async def insert(self, persona: Persona) -> Persona:
        persona.created_at = persona.created_at or _utcnow()
        persona.updated_at = _utcnow()
        self._store.personas[persona.id] = copy.deepcopy(persona)
        return copy.deepcopy(persona)

    async def update(self, persona: Persona) -> Persona:
        persona.updated_at = _utcnow()
        self._store.personas[persona.id] = copy.deepcopy(persona)
        return copy.deepcopy(persona)

    async def soft_delete(self, persona_id: UUID) -> None:
        p = self._store.personas.get(persona_id)
        if p is not None:
            p.is_deleted = True
            p.updated_at = _utcnow()

    async def get(self, persona_id: UUID) -> Persona | None:
        p = self._store.personas.get(persona_id)
        return copy.deepcopy(p) if p else None

    async def list_by_owner(
        self, owner_id: UUID, include_deleted: bool = False
    ) -> list[Persona]:
        items = [
            p
            for p in self._store.personas.values()
            if p.owner_user_id == owner_id
            and (include_deleted or not p.is_deleted)
        ]
        return [copy.deepcopy(p) for p in items]

    async def list_shared(
        self,
        page: int = 0,
        page_size: int = 20,
        sort: SortOrder = "popularity",
    ) -> list[Persona]:
        items = [
            p
            for p in self._store.personas.values()
            if p.is_shared and not p.is_deleted and not p.is_blocked
        ]
        if sort == "popularity":
            items.sort(key=lambda p: p.usage_count, reverse=True)
        elif sort == "newest":
            items.sort(key=lambda p: p.created_at, reverse=True)
        elif sort == "acceptance":
            items.sort(key=lambda p: p.yes_acceptance_rate, reverse=True)
        start = page * page_size
        return [copy.deepcopy(p) for p in items[start : start + page_size]]

    async def record_usage(self, persona_id: UUID, was_yes: bool) -> None:
        p = self._store.personas.get(persona_id)
        if p is None:
            return
        p.usage_count += 1
        if was_yes:
            p.yes_count += 1
        p.updated_at = _utcnow()

    async def block(self, persona_id: UUID) -> None:
        p = self._store.personas.get(persona_id)
        if p is not None:
            p.is_blocked = True
            p.updated_at = _utcnow()


# ============================================================
# PersonaReportRepository
# ============================================================
class MockPersonaReportRepository:
    def __init__(self, store: MockStore) -> None:
        self._store = store

    async def insert(self, report: PersonaReport) -> PersonaReport:
        # Enforce UNIQUE (persona_id, reporter_user_id)
        for existing in self._store.persona_reports.values():
            if (
                existing.persona_id == report.persona_id
                and existing.reporter_user_id == report.reporter_user_id
            ):
                raise DuplicateReportError(
                    f"User {report.reporter_user_id} already reported persona {report.persona_id}"
                )
        report.created_at = report.created_at or _utcnow()
        self._store.persona_reports[report.id] = copy.deepcopy(report)
        return copy.deepcopy(report)

    async def list_pending(self) -> list[PersonaReport]:
        items = [
            r for r in self._store.persona_reports.values() if r.status == "pending"
        ]
        items.sort(key=lambda r: r.created_at)
        return [copy.deepcopy(r) for r in items]

    async def count_by_persona(
        self, persona_id: UUID, status: str = "pending"
    ) -> int:
        return sum(
            1
            for r in self._store.persona_reports.values()
            if r.persona_id == persona_id and r.status == status
        )

    async def mark_reviewed(
        self, report_id: UUID, decision: Literal["block", "dismiss"]
    ) -> None:
        r = self._store.persona_reports.get(report_id)
        if r is None:
            return
        r.status = "reviewed-blocked" if decision == "block" else "reviewed-dismissed"
        r.reviewed_at = _utcnow()


# ============================================================
# UserPersonaSelectionRepository
# ============================================================
class MockUserPersonaSelectionRepository:
    def __init__(self, store: MockStore) -> None:
        self._store = store

    async def get(self, user_id: UUID) -> UserPersonaSelection | None:
        s = self._store.user_persona_selections.get(user_id)
        return copy.deepcopy(s) if s else None

    async def upsert(
        self, selection: UserPersonaSelection
    ) -> UserPersonaSelection:
        selection.updated_at = _utcnow()
        self._store.user_persona_selections[selection.user_id] = copy.deepcopy(selection)
        return copy.deepcopy(selection)


# ============================================================
# DatabaseHealth
# ============================================================
class MockDatabaseHealth(DatabaseHealth):
    async def ping(self) -> bool:
        return True


__all__ = [
    "MockStore",
    "MockProfileRepository",
    "MockDecisionRepository",
    "MockPreferenceProfileRepository",
    "MockSilenceLogRepository",
    "MockPersonaRepository",
    "MockPersonaReportRepository",
    "MockUserPersonaSelectionRepository",
    "MockDatabaseHealth",
]
