"""_JwtVerifier — 9 種 AuthError reason の網羅検証 + id/access 両経路."""
from __future__ import annotations

import time
import uuid

import jwt
import pytest

from tests.fixtures.jwt import (
    DEFAULT_KID,
    get_private_pem,
    make_access_token,
    make_id_token,
    make_jwks_mock_transport,
    make_jwks_response,
    tamper_token,
)
from yesman_api.application.auth.errors import AuthError
from yesman_api.infrastructure.auth._http import make_http_client
from yesman_api.infrastructure.auth._verifier import JwtVerifyConfig, _JwtVerifier
from yesman_api.infrastructure.auth.jwks_cache import JwksCache

ISSUER = "https://cognito-idp.test.amazonaws.com/test-pool"
AUDIENCE = "test-client-id"


@pytest.fixture
def jwks_cache():
    import httpx

    http = httpx.AsyncClient(transport=make_jwks_mock_transport())
    cache = JwksCache(
        "https://example.com/jwks", ttl=3600, stale_seconds=300, http=http
    )
    yield cache


@pytest.fixture
def verifier(jwks_cache):
    return _JwtVerifier(
        jwks=jwks_cache,
        config=JwtVerifyConfig(issuer=ISSUER, audience=AUDIENCE),
    )


async def test_id_token_success(verifier):
    sub = str(uuid.uuid4())
    token = make_id_token(sub=sub, email="alice@test.com", issuer=ISSUER, audience=AUDIENCE)
    claims = await verifier.verify(token)
    assert claims["sub"] == sub
    assert claims["email"] == "alice@test.com"
    assert claims["token_use"] == "id"


async def test_access_token_success(verifier):
    sub = str(uuid.uuid4())
    token = make_access_token(sub=sub, client_id=AUDIENCE, issuer=ISSUER)
    claims = await verifier.verify(token)
    assert claims["sub"] == sub
    assert claims["client_id"] == AUDIENCE
    assert claims["token_use"] == "access"


async def test_malformed_token(verifier):
    with pytest.raises(AuthError) as exc_info:
        await verifier.verify("not-a-jwt")
    assert exc_info.value.reason == "malformed"


async def test_algorithm_mismatch(verifier):
    # HS256 で署名 (公開鍵 RS256 と不一致)
    token = jwt.encode(
        {
            "sub": "x",
            "iss": ISSUER,
            "aud": AUDIENCE,
            "iat": int(time.time()),
            "exp": int(time.time()) + 3600,
            "token_use": "id",
        },
        "secret",
        algorithm="HS256",
        headers={"kid": DEFAULT_KID},
    )
    with pytest.raises(AuthError) as exc_info:
        await verifier.verify(token)
    assert exc_info.value.reason == "algorithm_mismatch"


async def test_unknown_kid(jwks_cache):
    """unknown_kid: kid が JWKS に存在せず、force_refetch 後も見つからない場合."""
    verifier = _JwtVerifier(
        jwks=jwks_cache,
        config=JwtVerifyConfig(issuer=ISSUER, audience=AUDIENCE),
    )
    sub = str(uuid.uuid4())
    token = make_id_token(
        sub=sub, email="x@y.z", issuer=ISSUER, audience=AUDIENCE, kid="unknown-kid"
    )
    with pytest.raises(AuthError) as exc_info:
        await verifier.verify(token)
    assert exc_info.value.reason == "unknown_kid"


async def test_expired_token(verifier):
    sub = str(uuid.uuid4())
    token = make_id_token(
        sub=sub, email="x@y.z", issuer=ISSUER, audience=AUDIENCE, exp_in=-3600
    )
    with pytest.raises(AuthError) as exc_info:
        await verifier.verify(token)
    assert exc_info.value.reason == "expired"


async def test_issuer_mismatch(verifier):
    sub = str(uuid.uuid4())
    token = make_id_token(
        sub=sub, email="x@y.z", issuer="https://wrong.iss/", audience=AUDIENCE
    )
    with pytest.raises(AuthError) as exc_info:
        await verifier.verify(token)
    assert exc_info.value.reason == "issuer_mismatch"


async def test_audience_mismatch_id_token(verifier):
    sub = str(uuid.uuid4())
    token = make_id_token(
        sub=sub, email="x@y.z", issuer=ISSUER, audience="other-client-id"
    )
    with pytest.raises(AuthError) as exc_info:
        await verifier.verify(token)
    assert exc_info.value.reason == "audience_mismatch"


async def test_audience_mismatch_access_token(verifier):
    sub = str(uuid.uuid4())
    token = make_access_token(sub=sub, client_id="other-client-id", issuer=ISSUER)
    with pytest.raises(AuthError) as exc_info:
        await verifier.verify(token)
    assert exc_info.value.reason == "audience_mismatch"


async def test_invalid_signature(verifier):
    sub = str(uuid.uuid4())
    token = make_id_token(sub=sub, email="x@y.z", issuer=ISSUER, audience=AUDIENCE)
    tampered = tamper_token(token)
    with pytest.raises(AuthError) as exc_info:
        await verifier.verify(tampered)
    # 改変署名は invalid_signature or malformed (PyJWT バージョンにより異なり得る)
    assert exc_info.value.reason in {"invalid_signature", "malformed"}


async def test_token_use_unsupported(verifier):
    """token_use が id/access 以外 (= refresh token 等) は token_use_unsupported."""
    now = int(time.time())
    claims = {
        "sub": "x",
        "iss": ISSUER,
        "aud": AUDIENCE,
        "token_use": "refresh",
        "iat": now,
        "exp": now + 3600,
    }
    token = jwt.encode(
        claims, get_private_pem(), algorithm="RS256", headers={"kid": DEFAULT_KID}
    )
    with pytest.raises(AuthError) as exc_info:
        await verifier.verify(token)
    assert exc_info.value.reason == "token_use_unsupported"


async def test_required_claim_sub_missing(verifier):
    """REQUIRED_CLAIMS に sub を含む (Imp2) — sub なしは malformed."""
    now = int(time.time())
    claims = {
        "iss": ISSUER,
        "aud": AUDIENCE,
        "token_use": "id",
        "iat": now,
        "exp": now + 3600,
    }
    token = jwt.encode(
        claims, get_private_pem(), algorithm="RS256", headers={"kid": DEFAULT_KID}
    )
    with pytest.raises(AuthError) as exc_info:
        await verifier.verify(token)
    assert exc_info.value.reason == "malformed"
