"""_JwtVerifier — Cognito ID Token / Access Token 共通検証ヘルパー.

ultrathink I1 反映: unverified payload で token_use を判別し ID/Access 経路を明示分岐。
ultrathink I2 反映: kid mismatch 時に force_refetch=True で確実な retry。
ultrathink Imp2 反映: REQUIRED_CLAIMS に `sub` を含める (防御層)。
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import jwt

from yesman_api.application.auth.errors import AuthError
from yesman_api.infrastructure.auth.jwks_cache import JwksCache, JwksUnavailable, UnknownKid


@dataclass(frozen=True, slots=True)
class JwtVerifyConfig:
    issuer: str
    audience: str  # App Client ID (ID Token の aud / Access Token の client_id)
    leeway_seconds: int = 30  # SEC-U3-05 clock skew
    algorithms: tuple[str, ...] = ("RS256",)


class _JwtVerifier:
    REQUIRED_CLAIMS = ("exp", "iat", "iss", "sub")

    def __init__(self, *, jwks: JwksCache, config: JwtVerifyConfig) -> None:
        self._jwks = jwks
        self._cfg = config

    async def verify(self, token: str) -> dict[str, Any]:
        # 1. header + unverified payload 抽出
        try:
            unverified_header = jwt.get_unverified_header(token)
            unverified_payload = jwt.decode(token, options={"verify_signature": False})
        except jwt.DecodeError as exc:
            raise AuthError("malformed", detail=str(exc)) from exc

        kid = unverified_header.get("kid")
        alg = unverified_header.get("alg")
        if alg not in self._cfg.algorithms:
            raise AuthError("algorithm_mismatch", detail=f"alg={alg!r}")
        if not kid:
            raise AuthError("malformed", detail="missing kid")

        # 2. token_use を先に判別 (I1)
        token_use = unverified_payload.get("token_use")
        if token_use not in {"id", "access"}:
            raise AuthError("token_use_unsupported", detail=f"token_use={token_use!r}")

        # 3. 公開鍵取得 (UnknownKid 時 force_refetch で 1 回 retry、I2)
        try:
            key = await self._jwks.get_key(kid)
        except UnknownKid:
            try:
                key = await self._jwks.get_key(kid, force_refetch=True)
            except UnknownKid:
                raise AuthError("unknown_kid")
            except JwksUnavailable as exc:
                raise AuthError("jwks_unavailable", detail=str(exc)) from exc
        except JwksUnavailable as exc:
            raise AuthError("jwks_unavailable", detail=str(exc)) from exc

        # 4. token_use 別に署名 + クレーム検証
        decode_options: dict[str, Any] = {"require": list(self.REQUIRED_CLAIMS)}
        try:
            if token_use == "id":
                claims = jwt.decode(
                    token,
                    key=key,
                    algorithms=list(self._cfg.algorithms),
                    issuer=self._cfg.issuer,
                    audience=self._cfg.audience,
                    leeway=self._cfg.leeway_seconds,
                    options=decode_options,
                )
            else:  # access
                claims = jwt.decode(
                    token,
                    key=key,
                    algorithms=list(self._cfg.algorithms),
                    issuer=self._cfg.issuer,
                    leeway=self._cfg.leeway_seconds,
                    options={**decode_options, "verify_aud": False},
                )
                if claims.get("client_id") != self._cfg.audience:
                    raise AuthError("audience_mismatch", detail="client_id mismatch")
        except jwt.ExpiredSignatureError as exc:
            raise AuthError("expired") from exc
        except jwt.InvalidIssuerError as exc:
            raise AuthError("issuer_mismatch") from exc
        except jwt.InvalidAudienceError as exc:
            raise AuthError("audience_mismatch") from exc
        except jwt.InvalidSignatureError as exc:
            raise AuthError("invalid_signature") from exc
        except jwt.MissingRequiredClaimError as exc:
            raise AuthError("malformed", detail=f"missing claim: {exc!s}") from exc
        except jwt.InvalidTokenError as exc:
            raise AuthError("malformed", detail=str(exc)) from exc

        return claims


__all__ = ["JwtVerifyConfig", "_JwtVerifier"]
