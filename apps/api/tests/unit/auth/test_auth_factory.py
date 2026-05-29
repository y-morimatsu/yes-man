"""Unit tests for AuthBackendFactory (infrastructure/auth/factory.py).

外部呼び出しなし (adapter の __init__ は config 格納のみ、JWKS/userinfo は遅延)。
cognito / cognito-local / mock の 3 分岐 + memoize + dispose + 未知 backend を網羅。
"""
from __future__ import annotations

import types

import pytest

from yesman_api.infrastructure.auth.cognito_adapter import CognitoAuthAdapter
from yesman_api.infrastructure.auth.cognito_local_adapter import CognitoLocalAuthAdapter
from yesman_api.infrastructure.auth.factory import AuthBackendFactory
from yesman_api.infrastructure.auth.mock_adapter import MockAuthAdapter
from yesman_api.infrastructure.config import AppConfig


async def test_mock_backend_and_memoize() -> None:
    factory = AuthBackendFactory(AppConfig(auth_backend="mock"))
    adapter = await factory.create()
    assert isinstance(adapter, MockAuthAdapter)
    assert await factory.create() is adapter  # memoize
    await factory.dispose()
    assert await factory.create() is not adapter  # dispose 後は再生成
    await factory.dispose()


async def test_cognito_backend() -> None:
    factory = AuthBackendFactory(
        AppConfig(
            auth_backend="cognito",
            cognito_region="ap-northeast-1",
            cognito_user_pool_id="ap-northeast-1_test",
            cognito_app_client_id="client",
            cognito_hosted_ui_url="https://example.auth.ap-northeast-1.amazoncognito.com",
        )
    )
    adapter = await factory.create()
    assert isinstance(adapter, CognitoAuthAdapter)
    await factory.dispose()


async def test_cognito_local_backend() -> None:
    factory = AuthBackendFactory(
        AppConfig(
            auth_backend="cognito-local",
            cognito_local_issuer_url="http://localhost:9229/local_test",
            cognito_app_client_id="client",
        )
    )
    adapter = await factory.create()
    assert isinstance(adapter, CognitoLocalAuthAdapter)
    await factory.dispose()


async def test_unknown_backend_raises() -> None:
    # AppConfig.auth_backend は Literal なので、未知値到達には stub config を使う
    stub_cfg = types.SimpleNamespace(auth_backend="bogus")
    factory = AuthBackendFactory(stub_cfg)  # type: ignore[arg-type]
    with pytest.raises(RuntimeError, match="Unknown AUTH_BACKEND"):
        await factory.create()
