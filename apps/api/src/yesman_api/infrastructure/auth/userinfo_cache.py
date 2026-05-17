"""Cognito userInfo endpoint cache (C1 由来、SEC-U3-04 Access Token モード).

TTL 5min、sub をキーにキャッシュ。`email` と `email_verified` 両方をキャッシュ (Imp3)。
Cognito userInfo の 10 RPS rate limit 対策で per-sub asyncio.Lock。
"""
from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass
from typing import Any

import httpx

from yesman_api.infrastructure.auth._http import fetch_with_retry_authed


@dataclass(frozen=True, slots=True)
class UserInfo:
    email: str
    email_verified: bool


class UserInfoEmailMissing(Exception):
    """userInfo レスポンスに email クレームがない (Cognito 設定不備など)."""


def _coerce_bool(value: Any) -> bool:
    """Cognito userInfo は email_verified を bool / 'true' / 'false' 文字列で返すケースがある。"""
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.lower() == "true"
    return bool(value)


class UserInfoCache:
    """Access Token sub → (email, email_verified) を TTL 5min でキャッシュ。"""

    def __init__(
        self,
        userinfo_url: str,
        *,
        ttl: float,
        http: httpx.AsyncClient,
    ) -> None:
        self._url = userinfo_url
        self._ttl = ttl
        self._http = http
        self._cache: dict[str, tuple[UserInfo, float]] = {}  # sub -> (UserInfo, expires_at_monotonic)
        self._locks: dict[str, asyncio.Lock] = {}

    async def get_userinfo(self, *, sub: str, access_token: str) -> UserInfo:
        now = time.monotonic()
        cached = self._cache.get(sub)
        if cached and now < cached[1]:
            return cached[0]
        lock = self._locks.setdefault(sub, asyncio.Lock())
        async with lock:
            cached = self._cache.get(sub)
            if cached and time.monotonic() < cached[1]:
                return cached[0]
            resp = await fetch_with_retry_authed(self._http, self._url, access_token)
            payload = resp.json()
            email = str(payload.get("email", "")).lower().strip()
            if not email:
                raise UserInfoEmailMissing(sub)
            email_verified = _coerce_bool(payload.get("email_verified", True))
            info = UserInfo(email=email, email_verified=email_verified)
            self._cache[sub] = (info, time.monotonic() + self._ttl)
            return info


__all__ = ["UserInfo", "UserInfoCache", "UserInfoEmailMissing"]
