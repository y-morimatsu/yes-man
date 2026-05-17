"""PBT — PersonaCatalogService.set_selection の 4 不変条件 (ultrathink Imp2).

(a) len(saved.persona_ids) <= 3   (FR-PERSONA-10)
(b) 重複なし                       (len(set) == len)
(c) 全 persona で can_access(p, user_id) == True
(d) 全 persona で p.is_blocked == False

set_selection が許容した場合のみ、上記 4 不変条件が満たされる事を Hypothesis で検証.
"""
from __future__ import annotations

import asyncio
from uuid import UUID, uuid4

from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from yesman_api.domain.persistence.models import Persona
from yesman_api.domain.persona.access import can_access
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


def _seed_persona_pool(store: MockStore, owner: UUID, n: int) -> list[Persona]:
    """N 個の persona を seed (mix: own / shared / blocked / 他人 private)."""
    pool: list[Persona] = []
    for i in range(n):
        if i % 4 == 0:
            p = Persona(
                owner_user_id=owner,
                name=f"own-{i}",
                description="",
                prompt_text="x" * 40,
            )
        elif i % 4 == 1:
            p = Persona(
                owner_user_id=uuid4(),
                name=f"shared-{i}",
                description="",
                prompt_text="x" * 40,
                is_shared=True,
            )
        elif i % 4 == 2:
            p = Persona(
                owner_user_id=owner,
                name=f"blocked-{i}",
                description="",
                prompt_text="x" * 40,
                is_blocked=True,
            )
        else:
            p = Persona(
                owner_user_id=uuid4(),
                name=f"private-{i}",
                description="",
                prompt_text="x" * 40,
            )
        store.personas[p.id] = p
        pool.append(p)
    return pool


@given(
    indices=st.lists(
        st.integers(min_value=0, max_value=11),
        min_size=0,
        max_size=8,
    ),
)
@settings(max_examples=100, suppress_health_check=[HealthCheck.function_scoped_fixture])
def test_set_selection_invariants(indices):
    async def run():
        store = MockStore()
        owner = uuid4()
        pool = _seed_persona_pool(store, owner, 12)
        service = PersonaCatalogService(
            persona_repo=MockPersonaRepository(store),
            selection_repo=MockUserPersonaSelectionRepository(store),
            moderator=_AllowingModerator(),
            anonymizer_salt="salt",
        )
        # build candidate persona_ids
        candidate_ids = [pool[i].id for i in indices]
        try:
            await service.set_selection(user_id=owner, persona_ids=candidate_ids)
        except PersonaError:
            # 検証失敗時は invariant 自体は破れていない (set_selection が拒否)
            return
        # 保存された場合は 4 invariants を全て満たす
        saved = store.user_persona_selections[owner]
        ids = [UUID(s) for s in saved.persona_ids]
        # (a) max 3
        assert len(ids) <= 3
        # (b) no duplicates
        assert len(set(ids)) == len(ids)
        # (c)+(d) access + not blocked
        for pid in ids:
            p = store.personas[pid]
            assert can_access(p, owner) is True
            assert p.is_blocked is False

    asyncio.run(run())
