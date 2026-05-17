"""JWT test fixtures — RSA キー生成 + Cognito ID/Access Token 発行 + JWKS endpoint MockTransport.

CognitoAuthAdapter 系のテストで「本物の JWT を _JwtVerifier に流す」用途。
RSA 鍵ペアはモジュール読み込み時に一度生成しキャッシュ (生成コスト ~100ms 削減)。
"""
from __future__ import annotations

import json
import time
from typing import Any

import httpx
import jwt
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

DEFAULT_KID = "test-kid-1"


def _make_rsa_keypair() -> tuple[Any, Any]:
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    public_key = private_key.public_key()
    return private_key, public_key


_PRIVATE_KEY, _PUBLIC_KEY = _make_rsa_keypair()


def get_private_pem() -> bytes:
    return _PRIVATE_KEY.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )


def get_jwk(kid: str = DEFAULT_KID) -> dict[str, Any]:
    """RSA 公開鍵を JWK (JSON Web Key) 形式で返す。"""
    public_numbers = _PUBLIC_KEY.public_numbers()
    n = public_numbers.n.to_bytes((public_numbers.n.bit_length() + 7) // 8, "big")
    e = public_numbers.e.to_bytes((public_numbers.e.bit_length() + 7) // 8, "big")
    import base64

    def b64(b: bytes) -> str:
        return base64.urlsafe_b64encode(b).rstrip(b"=").decode("ascii")

    return {
        "kty": "RSA",
        "alg": "RS256",
        "use": "sig",
        "kid": kid,
        "n": b64(n),
        "e": b64(e),
    }


def make_jwks_response(*, kid: str = DEFAULT_KID) -> dict[str, Any]:
    """JWKS endpoint レスポンス (Cognito 互換) を返す。"""
    return {"keys": [get_jwk(kid)]}


def make_id_token(
    *,
    sub: str,
    email: str,
    issuer: str,
    audience: str,
    kid: str = DEFAULT_KID,
    exp_in: int = 3600,
    email_verified: bool = True,
    extra_claims: dict[str, Any] | None = None,
) -> str:
    now = int(time.time())
    claims: dict[str, Any] = {
        "sub": sub,
        "email": email,
        "email_verified": email_verified,
        "iss": issuer,
        "aud": audience,
        "token_use": "id",
        "iat": now,
        "exp": now + exp_in,
    }
    if extra_claims:
        claims.update(extra_claims)
    return jwt.encode(
        claims,
        get_private_pem(),
        algorithm="RS256",
        headers={"kid": kid},
    )


def make_access_token(
    *,
    sub: str,
    client_id: str,
    issuer: str,
    kid: str = DEFAULT_KID,
    exp_in: int = 3600,
    extra_claims: dict[str, Any] | None = None,
) -> str:
    now = int(time.time())
    claims: dict[str, Any] = {
        "sub": sub,
        "client_id": client_id,
        "iss": issuer,
        "token_use": "access",
        "iat": now,
        "exp": now + exp_in,
    }
    if extra_claims:
        claims.update(extra_claims)
    return jwt.encode(
        claims,
        get_private_pem(),
        algorithm="RS256",
        headers={"kid": kid},
    )


def make_jwks_mock_transport(*, kid: str = DEFAULT_KID) -> httpx.MockTransport:
    """JWKS endpoint をモックする httpx MockTransport."""

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=make_jwks_response(kid=kid))

    return httpx.MockTransport(handler)


def tamper_token(token: str) -> str:
    """末尾文字を改変して invalid_signature を誘発する。"""
    head, _, sig = token.rpartition(".")
    # 1 文字 flip して署名を壊す
    tampered_sig = ("A" if sig[0] != "A" else "B") + sig[1:]
    return f"{head}.{tampered_sig}"


__all__ = [
    "DEFAULT_KID",
    "get_jwk",
    "make_jwks_response",
    "make_id_token",
    "make_access_token",
    "make_jwks_mock_transport",
    "tamper_token",
]
