"""Integration: Persona blocked → can_access False / Selection 拒否 (U-Test FD §3.2).

U-Persona の `can_access` module-level function は is_blocked=True で False を返す.
set_selection で blocked persona を含めると PersonaError("persona_not_accessible") を raise.
"""
from __future__ import annotations

from uuid import UUID

import pytest

from yesman_api.domain.persistence.models import Persona
from yesman_api.domain.persona.access import can_access
from yesman_api.domain.persona.errors import PersonaError
from yesman_api.domain.persona.catalog import PersonaCatalogService
from yesman_api.domain.persona.models import ModerationVerdict


class _AllowingModerator:
    async def moderate(self, *, name, description, prompt_text):
        return ModerationVerdict(is_allowed=True)


@pytest.mark.asyncio
async def test_blocked_persona_can_access_returns_false(repo_bundle, test_user_id: str):
    """blocked persona は owner 自身でも can_access False."""
    user_id = UUID(test_user_id)
    persona = Persona(
        owner_user_id=user_id,
        name="blocked",
        description="",
        prompt_text="x" * 40,
        is_blocked=True,
    )
    await repo_bundle.persona.insert(persona)

    # 自分が owner でも is_blocked で access 不可
    assert can_access(persona, user_id) is False


@pytest.mark.asyncio
async def test_set_selection_rejects_blocked_persona(repo_bundle, test_user_id: str):
    """set_selection で blocked persona を含めると PersonaError raise (U-Persona)."""
    user_id = UUID(test_user_id)
    blocked = Persona(
        owner_user_id=user_id,
        name="blocked",
        description="",
        prompt_text="x" * 40,
        is_blocked=True,
    )
    saved = await repo_bundle.persona.insert(blocked)

    service = PersonaCatalogService(
        persona_repo=repo_bundle.persona,
        selection_repo=repo_bundle.user_persona_selection,
        moderator=_AllowingModerator(),
        anonymizer_salt="integration-salt",
    )

    with pytest.raises(PersonaError) as exc_info:
        await service.set_selection(user_id=user_id, persona_ids=[saved.id])
    assert exc_info.value.reason == "persona_not_accessible"


@pytest.mark.asyncio
async def test_set_selection_rejects_other_users_private_persona(repo_bundle, test_user_id: str):
    """他人の private persona も access 不可 → set_selection で拒否."""
    user_id = UUID(test_user_id)
    other_user_id = UUID("99999999-9999-9999-9999-999999999999")
    private = Persona(
        owner_user_id=other_user_id,
        name="private",
        description="",
        prompt_text="x" * 40,
        is_shared=False,
        is_builtin=False,
    )
    saved = await repo_bundle.persona.insert(private)

    service = PersonaCatalogService(
        persona_repo=repo_bundle.persona,
        selection_repo=repo_bundle.user_persona_selection,
        moderator=_AllowingModerator(),
        anonymizer_salt="integration-salt",
    )

    with pytest.raises(PersonaError) as exc_info:
        await service.set_selection(user_id=user_id, persona_ids=[saved.id])
    assert exc_info.value.reason == "persona_not_accessible"
