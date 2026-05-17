"""can_access unit test — builtin / owner / shared / blocked の 4 経路."""
from __future__ import annotations

from uuid import UUID, uuid4

from yesman_api.domain.persistence.models import Persona
from yesman_api.domain.persona.access import can_access


def _persona(*, owner: UUID, is_builtin: bool = False, is_shared: bool = False,
             is_blocked: bool = False) -> Persona:
    return Persona(
        owner_user_id=owner,
        name="P",
        description="d",
        prompt_text="prompt-text-x" * 5,
        is_builtin=is_builtin,
        is_shared=is_shared,
        is_blocked=is_blocked,
    )


def test_builtin_accessible_for_any_user():
    p = _persona(owner=uuid4(), is_builtin=True)
    assert can_access(p, uuid4()) is True


def test_owner_can_access_own_private_persona():
    owner = uuid4()
    p = _persona(owner=owner)
    assert can_access(p, owner) is True


def test_shared_persona_accessible_for_other_user():
    p = _persona(owner=uuid4(), is_shared=True)
    assert can_access(p, uuid4()) is True


def test_other_users_private_persona_denied():
    p = _persona(owner=uuid4())
    assert can_access(p, uuid4()) is False


def test_blocked_persona_denied_even_for_owner():
    owner = uuid4()
    p = _persona(owner=owner, is_blocked=True)
    assert can_access(p, owner) is False


def test_blocked_persona_denied_even_if_shared():
    p = _persona(owner=uuid4(), is_shared=True, is_blocked=True)
    assert can_access(p, uuid4()) is False
