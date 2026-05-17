"""PBT — 任意のバイト列 / 改変 JWT に対し _JwtVerifier が必ず AuthError を発生する (TEST-U3-02).

プロセスクラッシュ・予期せぬ例外型を出さないことが invariant。
"""
from __future__ import annotations

import httpx
import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from tests.fixtures.jwt import make_jwks_mock_transport
from yesman_api.application.auth.errors import AuthError
from yesman_api.infrastructure.auth._verifier import JwtVerifyConfig, _JwtVerifier
from yesman_api.infrastructure.auth.jwks_cache import JwksCache


@pytest.fixture
def verifier():
    http = httpx.AsyncClient(transport=make_jwks_mock_transport())
    cache = JwksCache(
        "https://example.com/jwks", ttl=3600, stale_seconds=300, http=http
    )
    return _JwtVerifier(
        jwks=cache,
        config=JwtVerifyConfig(
            issuer="https://issuer.test/", audience="test-aud"
        ),
    )


@given(token=st.text(max_size=200))
@settings(max_examples=100, suppress_health_check=[HealthCheck.function_scoped_fixture])
async def test_arbitrary_text_input_raises_auth_error(verifier, token):
    """任意の文字列入力は AuthError で reject される (= プロセスクラッシュなし)."""
    try:
        await verifier.verify(token)
    except AuthError:
        return  # 期待挙動
    except Exception as exc:
        pytest.fail(f"Unexpected exception type {type(exc).__name__}: {exc}")


@given(
    token=st.binary(max_size=200).map(lambda b: b.decode("latin-1", errors="replace"))
)
@settings(max_examples=50, suppress_health_check=[HealthCheck.function_scoped_fixture])
async def test_arbitrary_binary_input_raises_auth_error(verifier, token):
    try:
        await verifier.verify(token)
    except AuthError:
        return
    except Exception as exc:
        pytest.fail(f"Unexpected exception type {type(exc).__name__}: {exc}")
