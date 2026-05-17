"""PersonaCatalogService unit test (Mock Repo + stub Moderator 直接 instantiate, ultrathink I2).

CRUD + 共有 + listing + selection 上限 3 + builtin_immutable + blocked_immutable + アクセス検証.
"""
from __future__ import annotations

from uuid import UUID, uuid4

import pytest

from yesman_api.domain.persistence.constants import SYSTEM_USER_ID
from yesman_api.domain.persistence.models import Persona, UserPersonaSelection
from yesman_api.domain.persona.catalog import PersonaCatalogService
from yesman_api.domain.persona.errors import PersonaError
from yesman_api.domain.persona.models import ModerationVerdict
from yesman_api.infrastructure.persistence.mock_repositories import (
    MockPersonaRepository,
    MockStore,
    MockUserPersonaSelectionRepository,
)


class _AllowingModerator:
    async def moderate(self, *, name, description, prompt_text):
        return ModerationVerdict(is_allowed=True)


class _RejectingModerator:
    async def moderate(self, *, name, description, prompt_text):
        return ModerationVerdict(
            is_allowed=False,
            rejected_domain="religion",
            rejected_reason="reject",
        )


def _build_service(*, moderator=None) -> tuple[PersonaCatalogService, MockStore]:
    store = MockStore()
    persona_repo = MockPersonaRepository(store)
    selection_repo = MockUserPersonaSelectionRepository(store)
    service = PersonaCatalogService(
        persona_repo=persona_repo,
        selection_repo=selection_repo,
        moderator=moderator or _AllowingModerator(),
        anonymizer_salt="test-salt",
    )
    return service, store


def _seed_persona(store: MockStore, **kwargs) -> Persona:
    persona = Persona(
        owner_user_id=kwargs.pop("owner_user_id", uuid4()),
        name=kwargs.pop("name", "P"),
        description=kwargs.pop("description", "d"),
        prompt_text=kwargs.pop("prompt_text", "prompt-text-x" * 5),
        **kwargs,
    )
    store.personas[persona.id] = persona
    return persona


# ============================================================
# CRUD
# ============================================================
class TestCreate:
    async def test_create_allowed_persona(self):
        service, _ = _build_service()
        owner = uuid4()
        persona = await service.create(
            owner_user_id=owner,
            name="P1",
            description="d",
            prompt_text="x" * 40,
        )
        assert persona.owner_user_id == owner
        assert persona.is_builtin is False
        assert persona.is_shared is False

    async def test_create_rejected_by_moderator(self):
        service, _ = _build_service(moderator=_RejectingModerator())
        with pytest.raises(PersonaError) as exc:
            await service.create(
                owner_user_id=uuid4(),
                name="P",
                description=None,
                prompt_text="x" * 40,
            )
        assert exc.value.reason == "rejected_by_moderator"


class TestUpdate:
    async def test_update_own_persona(self):
        service, store = _build_service()
        owner = uuid4()
        persona = _seed_persona(store, owner_user_id=owner, name="orig")
        updated = await service.update(
            persona_id=persona.id,
            owner_user_id=owner,
            name="new",
        )
        assert updated.name == "new"

    async def test_update_other_users_persona_returns_not_found(self):
        service, store = _build_service()
        persona = _seed_persona(store, owner_user_id=uuid4())
        with pytest.raises(PersonaError) as exc:
            await service.update(
                persona_id=persona.id,
                owner_user_id=uuid4(),
                name="hacked",
            )
        assert exc.value.reason == "not_found"

    async def test_update_builtin_immutable(self):
        service, store = _build_service()
        persona = _seed_persona(
            store, owner_user_id=SYSTEM_USER_ID, is_builtin=True
        )
        with pytest.raises(PersonaError) as exc:
            await service.update(
                persona_id=persona.id,
                owner_user_id=SYSTEM_USER_ID,
                name="x",
            )
        assert exc.value.reason == "builtin_immutable"

    async def test_update_blocked_persona_rejected(self):
        service, store = _build_service()
        owner = uuid4()
        persona = _seed_persona(store, owner_user_id=owner, is_blocked=True)
        with pytest.raises(PersonaError) as exc:
            await service.update(
                persona_id=persona.id,
                owner_user_id=owner,
                name="x",
            )
        assert exc.value.reason == "blocked_immutable"


class TestDelete:
    async def test_delete_own_persona(self):
        service, store = _build_service()
        owner = uuid4()
        persona = _seed_persona(store, owner_user_id=owner)
        await service.delete(persona_id=persona.id, owner_user_id=owner)
        assert store.personas[persona.id].is_deleted is True

    async def test_delete_builtin_immutable(self):
        service, store = _build_service()
        persona = _seed_persona(
            store, owner_user_id=SYSTEM_USER_ID, is_builtin=True
        )
        with pytest.raises(PersonaError) as exc:
            await service.delete(
                persona_id=persona.id, owner_user_id=SYSTEM_USER_ID
            )
        assert exc.value.reason == "builtin_immutable"


# ============================================================
# Sharing
# ============================================================
class TestSetShared:
    async def test_publish_runs_re_moderation_and_succeeds(self):
        service, store = _build_service()
        owner = uuid4()
        persona = _seed_persona(store, owner_user_id=owner)
        result = await service.set_shared(
            persona_id=persona.id, owner_user_id=owner, shared=True
        )
        assert result.is_shared is True

    async def test_unpublish_skips_moderation(self):
        service, store = _build_service(moderator=_RejectingModerator())
        owner = uuid4()
        persona = _seed_persona(store, owner_user_id=owner, is_shared=True)
        result = await service.set_shared(
            persona_id=persona.id, owner_user_id=owner, shared=False
        )
        assert result.is_shared is False


# ============================================================
# Listings
# ============================================================
class TestListings:
    async def test_list_my_personas_excludes_builtin(self):
        service, store = _build_service()
        owner = uuid4()
        _seed_persona(store, owner_user_id=owner, name="own")
        # builtin owned by SYSTEM_USER_ID は除外、また他 user owner で is_builtin=True も除外
        _seed_persona(
            store, owner_user_id=owner, name="builtin-like", is_builtin=True
        )
        result = await service.list_my_personas(owner)
        names = [p.name for p in result]
        assert "own" in names
        assert "builtin-like" not in names

    async def test_list_builtin_personas(self):
        service, store = _build_service()
        _seed_persona(
            store, owner_user_id=SYSTEM_USER_ID, name="慎重派", is_builtin=True
        )
        result = await service.list_builtin_personas()
        assert len(result) == 1
        assert result[0].name == "慎重派"

    async def test_list_shared_returns_anonymized_summaries(self):
        service, store = _build_service()
        owner = uuid4()
        _seed_persona(
            store, owner_user_id=owner, is_shared=True, usage_count=10, yes_count=7
        )
        summaries = await service.list_shared(
            page=0, page_size=20, sort="popularity"
        )
        assert len(summaries) == 1
        s = summaries[0]
        assert s.creator_anonymous_id.startswith("yesman-")
        assert str(owner) not in s.creator_anonymous_id
        assert s.yes_acceptance_rate == 0.7


# ============================================================
# Selection
# ============================================================
class TestSelection:
    async def test_get_selection_returns_builtin_fallback_when_unset(self):
        service, store = _build_service()
        # seed 2 builtin
        b1 = _seed_persona(
            store, owner_user_id=SYSTEM_USER_ID, is_builtin=True, name="A"
        )
        b2 = _seed_persona(
            store, owner_user_id=SYSTEM_USER_ID, is_builtin=True, name="B"
        )
        result = await service.get_selection(uuid4())
        assert set(result) == {b1.id, b2.id}

    async def test_set_selection_with_valid_personas(self):
        service, store = _build_service()
        user = uuid4()
        p1 = _seed_persona(store, owner_user_id=user)
        p2 = _seed_persona(
            store, owner_user_id=uuid4(), is_shared=True
        )
        await service.set_selection(user_id=user, persona_ids=[p1.id, p2.id])
        stored = store.user_persona_selections[user]
        assert len(stored.persona_ids) == 2

    async def test_set_selection_size_violation(self):
        service, store = _build_service()
        user = uuid4()
        ids = [uuid4() for _ in range(4)]
        with pytest.raises(PersonaError) as exc:
            await service.set_selection(user_id=user, persona_ids=ids)
        assert exc.value.reason == "invalid_selection_size"

    async def test_set_selection_duplicate_rejected(self):
        service, store = _build_service()
        user = uuid4()
        p = _seed_persona(store, owner_user_id=user)
        with pytest.raises(PersonaError) as exc:
            await service.set_selection(user_id=user, persona_ids=[p.id, p.id])
        assert exc.value.reason == "duplicate_personas"

    async def test_set_selection_inaccessible_rejected(self):
        service, store = _build_service()
        user = uuid4()
        # 別 user の private persona は不可
        other = _seed_persona(store, owner_user_id=uuid4())
        with pytest.raises(PersonaError) as exc:
            await service.set_selection(user_id=user, persona_ids=[other.id])
        assert exc.value.reason == "persona_not_accessible"

    async def test_set_selection_blocked_rejected(self):
        service, store = _build_service()
        user = uuid4()
        blocked = _seed_persona(
            store, owner_user_id=user, is_blocked=True
        )
        with pytest.raises(PersonaError) as exc:
            await service.set_selection(user_id=user, persona_ids=[blocked.id])
        assert exc.value.reason == "persona_not_accessible"

    async def test_reset_selection_returns_builtin(self):
        service, store = _build_service()
        user = uuid4()
        p = _seed_persona(store, owner_user_id=user)
        # 先に set
        await service.set_selection(user_id=user, persona_ids=[p.id])
        # 次に reset
        await service.reset_selection(user)
        b = _seed_persona(
            store, owner_user_id=SYSTEM_USER_ID, is_builtin=True
        )
        result = await service.get_selection(user)
        # 空リスト → builtin fallback で b.id を返す
        assert b.id in result
