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
