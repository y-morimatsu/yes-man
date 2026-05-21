"""MockAuthAdapter — 3 特殊トークン + 通常パス + 空トークン."""
from __future__ import annotations

from uuid import UUID

import pytest

from yesman_api.application.auth.errors import AuthError
from yesman_api.infrastructure.auth.mock_adapter import MockAuthAdapter

_MOCK_SUB = UUID("11111111-1111-1111-1111-111111111111")
_MOCK_EMAIL = "test@yesman.local"


@pytest.fixture
def adapter() -> MockAuthAdapter:
    return MockAuthAdapter(mock_sub=_MOCK_SUB, mock_email=_MOCK_EMAIL)


async def test_returns_authenticated_user_for_arbitrary_token(adapter):
    user = await adapter.verify_token("anything")
    assert user.sub == str(_MOCK_SUB)
    assert user.email == _MOCK_EMAIL
    assert user.email_verified is True
    assert user.backend == "mock"


async def test_special_token_mock_expired_raises_expired(adapter):
    with pytest.raises(AuthError) as exc_info:
        await adapter.verify_token("mock-expired")
    assert exc_info.value.reason == "expired"


async def test_special_token_mock_anonymous_raises_missing(adapter):
    with pytest.raises(AuthError) as exc_info:
        await adapter.verify_token("mock-anonymous")
    assert exc_info.value.reason == "missing"


async def test_special_token_mock_malformed_raises_malformed(adapter):
    with pytest.raises(AuthError) as exc_info:
        await adapter.verify_token("mock-malformed")
    assert exc_info.value.reason == "malformed"


async def test_empty_token_raises_missing(adapter):
    with pytest.raises(AuthError) as exc_info:
        await adapter.verify_token("")
    assert exc_info.value.reason == "missing"


async def test_email_is_lowercased():
    adapter = MockAuthAdapter(mock_sub=_MOCK_SUB, mock_email="Test@YESMAN.local")
    user = await adapter.verify_token("any")
    assert user.email == "test@yesman.local"


async def test_aclose_is_noop(adapter):
    # MockAuthAdapter.aclose は何もしない (lifespan で呼ばれる)
    await adapter.aclose()


# Multi-user tokens (2026-05-20): "mock-user:<base64url(json{sub,email})>"

import base64
import json


def _make_multi_user_token(sub: str, email: str) -> str:
    payload = json.dumps({"sub": sub, "email": email}).encode("utf-8")
    encoded = base64.urlsafe_b64encode(payload).rstrip(b"=").decode("ascii")
    return f"mock-user:{encoded}"


async def test_multi_user_token_returns_user_from_payload(adapter):
    custom_sub = "22222222-2222-2222-2222-222222222222"
    custom_email = "taro@example.com"
    user = await adapter.verify_token(_make_multi_user_token(custom_sub, custom_email))
    assert user.sub == custom_sub
    assert user.email == custom_email
    assert user.raw_claims["mock"] is True


async def test_multi_user_token_lowercases_email(adapter):
    user = await adapter.verify_token(
        _make_multi_user_token("33333333-3333-3333-3333-333333333333", "Mixed@Case.JP")
    )
    assert user.email == "mixed@case.jp"


async def test_multi_user_token_malformed_base64_raises(adapter):
    with pytest.raises(AuthError) as exc_info:
        await adapter.verify_token("mock-user:!!!not_base64!!!")
    assert exc_info.value.reason == "malformed"


async def test_multi_user_token_invalid_json_raises(adapter):
    not_json = base64.urlsafe_b64encode(b"not json").rstrip(b"=").decode("ascii")
    with pytest.raises(AuthError) as exc_info:
        await adapter.verify_token(f"mock-user:{not_json}")
    assert exc_info.value.reason == "malformed"


async def test_multi_user_token_missing_fields_raises(adapter):
    payload = base64.urlsafe_b64encode(json.dumps({"sub": "abc"}).encode()).rstrip(b"=").decode("ascii")
    with pytest.raises(AuthError) as exc_info:
        await adapter.verify_token(f"mock-user:{payload}")
    assert exc_info.value.reason == "malformed"


async def test_multi_user_token_non_uuid_sub_raises(adapter):
    with pytest.raises(AuthError) as exc_info:
        await adapter.verify_token(_make_multi_user_token("not-a-uuid", "a@b.com"))
    assert exc_info.value.reason == "malformed"


async def test_arbitrary_non_prefixed_token_still_returns_env_user(adapter):
    """Backward compat: prefix なし token は従来通り env 固定 user を返す (mock-auto 含む)."""
    user = await adapter.verify_token("mock-auto")
    assert user.sub == str(_MOCK_SUB)
    assert user.email == _MOCK_EMAIL
