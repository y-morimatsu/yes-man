"""CognitoAuthAdapter — AWS Cognito User Pool 連携 (本番).

NFR Design §6.1 通り、ID Token / Access Token 両方を受け入れ:
- ID Token: claims から email + email_verified を取得
- Access Token: Cognito userInfo endpoint から lazy 取得 (TTL 5min キャッシュ)
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


class CognitoAuthAdapter:
    backend_name = "cognito"

    def __init__(
        self,
        *,
        region: str,
        user_pool_id: str,
        app_client_id: str,
        hosted_ui_url: str,
        jwks_cache_ttl: float = 3600,
        jwks_stale_seconds: float = 300,
        userinfo_ttl: float = 300,
    ) -> None:
        self._issuer = f"https://cognito-idp.{region}.amazonaws.com/{user_pool_id}"
        jwks_url = f"{self._issuer}/.well-known/jwks.json"
        userinfo_url = f"{hosted_ui_url.rstrip('/')}/oauth2/userInfo"
        self._http = make_http_client()
        self._jwks = JwksCache(
            jwks_url,
            ttl=jwks_cache_ttl,
            stale_seconds=jwks_stale_seconds,
            http=self._http,
        )
        self._userinfo = UserInfoCache(userinfo_url, ttl=userinfo_ttl, http=self._http)
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
        else:  # access — userInfo endpoint で email + email_verified を lazy 取得
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


__all__ = ["CognitoAuthAdapter"]
