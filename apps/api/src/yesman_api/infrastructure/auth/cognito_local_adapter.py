"""CognitoLocalAuthAdapter — cognito-local (jagregory/cognito-local) ローカル開発用.

NFR Design §6.2 + ultrathink I3 反映: `userinfo_url` をオプション化、
未設定なら Access Token モードを `token_use_unsupported` で拒否 (ID Token only)。
"""
from __future__ import annotations

from datetime import datetime, timezone

import httpx

from yesman_api.application.auth.errors import AuthError
from yesman_api.domain.auth.models import AuthenticatedUser
from yesman_api.infrastructure.auth._http import make_http_client
from yesman_api.infrastructure.auth._verifier import JwtVerifyConfig, _JwtVerifier
from yesman_api.infrastructure.auth.jwks_cache import JwksCache
from yesman_api.infrastructure.auth.userinfo_cache import (
    UserInfoCache,
    UserInfoEmailMissing,
    _coerce_bool,
)


class CognitoLocalAuthAdapter:
    backend_name = "cognito-local"

    def __init__(
        self,
        *,
        issuer_url: str,
        app_client_id: str,
        userinfo_url: str | None = None,
        jwks_cache_ttl: float = 3600,
        jwks_stale_seconds: float = 300,
        userinfo_ttl: float = 300,
    ) -> None:
        self._issuer = issuer_url
        jwks_url = f"{issuer_url.rstrip('/')}/.well-known/jwks.json"
        self._http = make_http_client()
        self._jwks = JwksCache(
            jwks_url,
            ttl=jwks_cache_ttl,
            stale_seconds=jwks_stale_seconds,
            http=self._http,
        )
        self._userinfo: UserInfoCache | None = (
            UserInfoCache(userinfo_url, ttl=userinfo_ttl, http=self._http)
            if userinfo_url is not None
            else None
        )
        self._verifier = _JwtVerifier(
            jwks=self._jwks,
            config=JwtVerifyConfig(issuer=self._issuer, audience=app_client_id),
        )

    async def verify_token(self, token: str) -> AuthenticatedUser:
        claims = await self._verifier.verify(token)
        sub = claims["sub"]
        token_use = claims["token_use"]
        if token_use == "id":
            email = (claims.get("email") or "").lower().strip()
            if not email:
                raise AuthError("missing_email")
            email_verified = _coerce_bool(claims.get("email_verified", True))
        else:  # access
            if self._userinfo is None:
                raise AuthError(
                    "token_use_unsupported",
                    detail="cognito-local without userInfo URL: id token only",
                )
            try:
                info = await self._userinfo.get_userinfo(sub=sub, access_token=token)
            except (UserInfoEmailMissing, httpx.HTTPError) as exc:
                raise AuthError("userinfo_unavailable", detail=str(exc)) from exc
            email = info.email
            email_verified = info.email_verified
        return AuthenticatedUser(
            sub=sub,
            email=email,
            email_verified=email_verified,
            issued_at=datetime.fromtimestamp(claims["iat"], tz=timezone.utc),
            expires_at=datetime.fromtimestamp(claims["exp"], tz=timezone.utc),
            raw_claims=claims,
            backend=self.backend_name,
        )

    async def aclose(self) -> None:
        await self._http.aclose()


__all__ = ["CognitoLocalAuthAdapter"]
