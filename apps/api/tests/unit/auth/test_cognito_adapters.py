"""Unit tests for Cognito(Local)AuthAdapter.verify_token (infrastructure/auth/cognito*_adapter.py).

_verifier.verify / _userinfo.get_userinfo を mock し、ID/Access token・email 欠落・
userInfo 失敗・cognito-local の userInfo 無し分岐を、ネットワークなしで網羅する。
"""
from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock

import httpx
import pytest

from yesman_api.application.auth.errors import AuthError
from yesman_api.infrastructure.auth.cognito_adapter import CognitoAuthAdapter
from yesman_api.infrastructure.auth.cognito_local_adapter import CognitoLocalAuthAdapter

_IAT = 1_700_000_000
_EXP = 1_700_003_600


def _claims(**overrides) -> dict:  # noqa: ANN003
    base = {
        "sub": "11111111-1111-1111-1111-111111111111",
        "token_use": "id",
        "email": "User@Example.com",
        "email_verified": True,
        "iat": _IAT,
        "exp": _EXP,
    }
    base.update(overrides)
    return base


def _cognito() -> CognitoAuthAdapter:
    return CognitoAuthAdapter(
        region="ap-northeast-1",
        user_pool_id="ap-northeast-1_x",
        app_client_id="client",
        hosted_ui_url="https://example.auth.ap-northeast-1.amazoncognito.com",
    )


def _cognito_local(*, with_userinfo: bool) -> CognitoLocalAuthAdapter:
    return CognitoLocalAuthAdapter(
        issuer_url="http://localhost:9229/local_test",
        app_client_id="client",
        userinfo_url="http://localhost:9229/oauth2/userInfo" if with_userinfo else None,
    )


# ============================================================
# CognitoAuthAdapter
# ============================================================
async def test_cognito_id_token_returns_user() -> None:
    adapter = _cognito()
    adapter._verifier.verify = AsyncMock(return_value=_claims())
    user = await adapter.verify_token("tok")
    assert user.sub == "11111111-1111-1111-1111-111111111111"
    assert user.email == "user@example.com"  # lower + strip
    assert user.backend == "cognito"
    await adapter.aclose()


async def test_cognito_id_token_missing_email_raises() -> None:
    adapter = _cognito()
    adapter._verifier.verify = AsyncMock(return_value=_claims(email=""))
    with pytest.raises(AuthError):
        await adapter.verify_token("tok")
    await adapter.aclose()


async def test_cognito_access_token_uses_userinfo() -> None:
    adapter = _cognito()
    adapter._verifier.verify = AsyncMock(return_value=_claims(token_use="access", email=None))
    adapter._userinfo.get_userinfo = AsyncMock(
        return_value=SimpleNamespace(email="a@example.com", email_verified=True)
    )
    user = await adapter.verify_token("tok")
    assert user.email == "a@example.com"
    await adapter.aclose()


async def test_cognito_access_token_userinfo_failure_raises() -> None:
    adapter = _cognito()
    adapter._verifier.verify = AsyncMock(return_value=_claims(token_use="access", email=None))
    adapter._userinfo.get_userinfo = AsyncMock(side_effect=httpx.HTTPError("boom"))
    with pytest.raises(AuthError):
        await adapter.verify_token("tok")
    await adapter.aclose()


# ============================================================
# CognitoLocalAuthAdapter
# ============================================================
async def test_cognito_local_id_token() -> None:
    adapter = _cognito_local(with_userinfo=True)
    adapter._verifier.verify = AsyncMock(return_value=_claims())
    user = await adapter.verify_token("tok")
    assert user.email == "user@example.com"
    await adapter.aclose()


async def test_cognito_local_access_without_userinfo_raises() -> None:
    adapter = _cognito_local(with_userinfo=False)
    adapter._verifier.verify = AsyncMock(return_value=_claims(token_use="access", email=None))
    with pytest.raises(AuthError):
        await adapter.verify_token("tok")
    await adapter.aclose()
