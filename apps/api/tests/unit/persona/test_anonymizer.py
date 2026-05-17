"""anonymize_owner unit test — 同一 input 同一 ID / 異なる user で異なる ID / salt 違いで変化."""
from __future__ import annotations

from uuid import UUID

from yesman_api.domain.persona.anonymizer import anonymize_owner


def test_same_user_same_salt_yields_same_id():
    user = UUID("11111111-1111-1111-1111-111111111111")
    a = anonymize_owner(user, "salt-A")
    b = anonymize_owner(user, "salt-A")
    assert a == b
    assert a.startswith("yesman-")


def test_different_users_yield_different_ids():
    salt = "salt-A"
    a = anonymize_owner(UUID("11111111-1111-1111-1111-111111111111"), salt)
    b = anonymize_owner(UUID("22222222-2222-2222-2222-222222222222"), salt)
    assert a != b


def test_different_salts_yield_different_ids():
    user = UUID("11111111-1111-1111-1111-111111111111")
    a = anonymize_owner(user, "salt-A")
    b = anonymize_owner(user, "salt-B")
    assert a != b


def test_anonymous_id_length_16_chars():
    user = UUID("11111111-1111-1111-1111-111111111111")
    out = anonymize_owner(user, "salt-A")
    # "yesman-" prefix + 16 hex chars
    assert out.startswith("yesman-")
    assert len(out) == len("yesman-") + 16
