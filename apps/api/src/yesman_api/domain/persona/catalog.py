"""PersonaCatalogService — Custom Persona CRUD + 共有プール + UserPersonaSelection 管理.

NFR Design §3 + ultrathink C1 (list_my/builtin 分離) + I1 (blocked_immutable) +
I2 (N+1 許容) + Imp1 (sort cast 削除) + Imp2 (validate inline) 反映.
"""
from __future__ import annotations

from uuid import UUID

from yesman_api.application.persistence.protocols import (
    PersonaRepository,
    UserPersonaSelectionRepository,
)
from yesman_api.domain.persistence.constants import SYSTEM_USER_ID
from yesman_api.domain.persistence.models import Persona, UserPersonaSelection
from yesman_api.domain.persona.access import can_access
from yesman_api.domain.persona.anonymizer import anonymize_owner
from yesman_api.domain.persona.constants import MAX_SELECTION
from yesman_api.domain.persona.errors import PersonaError
from yesman_api.domain.persona.models import PersonaSummary
from yesman_api.domain.persona.moderator import PersonaModerator


class PersonaCatalogService:
    def __init__(
        self,
        *,
        persona_repo: PersonaRepository,
        selection_repo: UserPersonaSelectionRepository,
        moderator: PersonaModerator,
        anonymizer_salt: str,
    ) -> None:
        self._persona_repo = persona_repo
        self._selection_repo = selection_repo
        self._moderator = moderator
        self._salt = anonymizer_salt

    # ============================================================
    # CRUD
    # ============================================================
    async def create(
        self,
        *,
        owner_user_id: UUID,
        name: str,
        description: str | None,
        prompt_text: str,
        avatar_url: str | None = None,
    ) -> Persona:
        verdict = await self._moderator.moderate(
            name=name, description=description, prompt_text=prompt_text
        )
        if not verdict.is_allowed:
            raise PersonaError("rejected_by_moderator", detail=verdict.rejected_reason)
        persona = Persona(
            owner_user_id=owner_user_id,
            name=name,
            description=description,
            prompt_text=prompt_text,
            avatar_url=avatar_url,
            is_shared=False,
            is_builtin=False,
        )
        return await self._persona_repo.insert(persona)

    async def update(
        self,
        *,
        persona_id: UUID,
        owner_user_id: UUID,
        name: str | None = None,
        description: str | None = None,
        prompt_text: str | None = None,
        avatar_url: str | None = None,
    ) -> Persona:
        existing = await self._persona_repo.get(persona_id)
        if existing is None or existing.owner_user_id != owner_user_id:
            raise PersonaError("not_found")  # SEC-UP-01 leak 防止
        if existing.is_builtin:
            raise PersonaError("builtin_immutable")
        if existing.is_blocked:
            # ultrathink NFR Design I1: blocked persona は所有者でも update 禁止
            raise PersonaError("blocked_immutable")
        # 変更後の値で再 Moderation
        new_name = name if name is not None else existing.name
        new_description = description if description is not None else existing.description
        new_prompt = prompt_text if prompt_text is not None else existing.prompt_text
        verdict = await self._moderator.moderate(
            name=new_name, description=new_description, prompt_text=new_prompt
        )
        if not verdict.is_allowed:
            raise PersonaError("rejected_by_moderator", detail=verdict.rejected_reason)
        existing.name = new_name
        existing.description = new_description
        existing.prompt_text = new_prompt
        if avatar_url is not None:
            existing.avatar_url = avatar_url
        return await self._persona_repo.update(existing)

    async def delete(self, *, persona_id: UUID, owner_user_id: UUID) -> None:
        existing = await self._persona_repo.get(persona_id)
        if existing is None or existing.owner_user_id != owner_user_id:
            raise PersonaError("not_found")
        if existing.is_builtin:
            raise PersonaError("builtin_immutable")
        # 注: blocked でも delete は所有者の権利として許可 (NFR Design I1)
        await self._persona_repo.soft_delete(persona_id)

    async def set_shared(
        self, *, persona_id: UUID, owner_user_id: UUID, shared: bool
    ) -> Persona:
        existing = await self._persona_repo.get(persona_id)
        if existing is None or existing.owner_user_id != owner_user_id:
            raise PersonaError("not_found")
        if existing.is_builtin:
            raise PersonaError("builtin_immutable")
        if shared:
            # 共有公開時は再 Moderation (NFR Req PERF-UP-02: LLM 2 回呼び累積)
            verdict = await self._moderator.moderate(
                name=existing.name,
                description=existing.description,
                prompt_text=existing.prompt_text,
            )
            if not verdict.is_allowed:
                raise PersonaError("rejected_by_moderator", detail=verdict.rejected_reason)
        existing.is_shared = shared
        return await self._persona_repo.update(existing)

    # ============================================================
    # Listings (ultrathink C1: builtin / my 分離)
    # ============================================================
    async def list_my_personas(self, owner_user_id: UUID) -> list[Persona]:
        """自分の作成 Persona のみ (builtin 除外)."""
        owned = await self._persona_repo.list_by_owner(owner_user_id)
        return [p for p in owned if not p.is_builtin]

    async def list_builtin_personas(self) -> list[Persona]:
        return await self._persona_repo.list_by_owner(SYSTEM_USER_ID)

    async def list_shared(
        self,
        *,
        page: int,
        page_size: int,
        sort: str = "popularity",
    ) -> list[PersonaSummary]:
        """共有プール listing + 匿名化."""
        personas = await self._persona_repo.list_shared(
            page=page,
            page_size=page_size,
            sort=sort,  # type: ignore[arg-type]  # API DTO で Literal validate 済
        )
        summaries = []
        for p in personas:
            yes_rate = (p.yes_count / p.usage_count) if p.usage_count > 0 else 0.0
            summaries.append(
                PersonaSummary(
                    id=p.id,
                    name=p.name,
                    description=p.description,
                    avatar_url=p.avatar_url,
                    usage_count=p.usage_count,
                    yes_acceptance_rate=round(yes_rate, 3),
                    creator_anonymous_id=anonymize_owner(p.owner_user_id, self._salt),
                )
            )
        return summaries

    # ============================================================
    # Selection (FR-PERSONA-03/10)
    # ============================================================
    async def get_selection(self, user_id: UUID) -> list[UUID]:
        selection = await self._selection_repo.get(user_id)
        if selection is None or not selection.persona_ids:
            # builtin fallback
            builtin = await self.list_builtin_personas()
            return [p.id for p in builtin][:MAX_SELECTION]
        return [UUID(pid) for pid in selection.persona_ids]

    async def set_selection(
        self, *, user_id: UUID, persona_ids: list[UUID]
    ) -> None:
        """ultrathink Imp2: MVP inline validate (将来 PBT 切り出し候補)."""
        # 1. size 検証
        if not 1 <= len(persona_ids) <= MAX_SELECTION:
            raise PersonaError("invalid_selection_size")
        # 2. 重複検証
        if len(set(persona_ids)) != len(persona_ids):
            raise PersonaError("duplicate_personas")
        # 3. アクセス検証 (N+1 だが N<=3 で許容、ultrathink I2)
        for pid in persona_ids:
            p = await self._persona_repo.get(pid)
            if p is None or not can_access(p, user_id):
                raise PersonaError("persona_not_accessible", detail=str(pid))
        sel = UserPersonaSelection(
            user_id=user_id,
            persona_ids=[str(pid) for pid in persona_ids],
        )
        await self._selection_repo.upsert(sel)

    async def reset_selection(self, user_id: UUID) -> None:
        """ultrathink FD I5: DELETE 経由で builtin 3 種に戻す.

        UserPersonaSelection に delete メソッドがないため空 list で upsert,
        get_selection は空 list → builtin fallback で動作.
        """
        sel = UserPersonaSelection(user_id=user_id, persona_ids=[])
        await self._selection_repo.upsert(sel)


__all__ = ["PersonaCatalogService"]
