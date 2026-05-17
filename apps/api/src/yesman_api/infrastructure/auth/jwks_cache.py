"""JWKS keys cached with TTL + stale-while-error + asyncio.Lock 直列化.

PERF-U3-03: TTL 1h
PERF-U3-04: kid mismatch retry 1 回、asyncio.Lock で thundering herd 直列化
AVAIL-U3-02: stale 5min、ただし kid が既存キャッシュにある場合のみ
Imp1 (ultrathink): empty JWKS は障害扱いで stale 経路へ流す
"""
from __future__ import annotations

import asyncio
import json
import time
from typing import Any

import httpx
import jwt

from yesman_api.infrastructure.auth._http import fetch_with_retry


class JwksUnavailable(Exception):
    """JWKS endpoint 障害 (network / 5xx / empty_jwks)."""


class UnknownKid(Exception):
    """JWKS から指定 kid が見つからない。"""

    def __init__(self, kid: str) -> None:
        super().__init__(kid)
        self.kid = kid


class JwksCache:
    """JWKS 公開鍵を TTL 1h でキャッシュ。

    `from_jwk` 結果 (RSA 公開鍵オブジェクト) を直接キャッシュし、verify ごとの再構築コストを回避。
    """

    def __init__(
        self,
        url: str,
        *,
        ttl: float,
        stale_seconds: float,
        http: httpx.AsyncClient,
    ) -> None:
        self._url = url
        self._ttl = ttl
        self._stale_seconds = stale_seconds
        self._http = http
        self._keys: dict[str, Any] = {}
        self._fetched_at: float | None = None  # monotonic
        self._lock = asyncio.Lock()

    async def get_key(self, kid: str, *, force_refetch: bool = False) -> Any:
        """`force_refetch=True` で fresh でも必ず JWKS を再取得 (kid mismatch retry 用、I2)."""
        if not force_refetch and self._is_fresh() and kid in self._keys:
            return self._keys[kid]
        async with self._lock:
            # double-check (他リクエストが lock 解放直前に fetch 済の可能性)
            if not force_refetch and self._is_fresh() and kid in self._keys:
                return self._keys[kid]
            try:
                await self._fetch()
            except (httpx.HTTPError, httpx.TimeoutException, JwksUnavailable) as exc:
                # AVAIL-U3-02: stale 利用は kid 既存時のみ (I4)
                if self._is_stale_usable() and kid in self._keys:
                    return self._keys[kid]
                if isinstance(exc, JwksUnavailable):
                    raise
                raise JwksUnavailable(str(exc)) from exc
            if kid in self._keys:
                return self._keys[kid]
            raise UnknownKid(kid)

    async def _fetch(self) -> None:
        resp = await fetch_with_retry(self._http, self._url)
        data = resp.json()
        new_keys: dict[str, Any] = {}
        for jwk in data.get("keys", []):
            try:
                new_keys[jwk["kid"]] = jwt.algorithms.RSAAlgorithm.from_jwk(json.dumps(jwk))
            except (KeyError, ValueError):
                # 個別の JWK が不正なら他の鍵だけで継続 (Cognito JWKS は通常 1-3 鍵)
                continue
        if not new_keys:
            raise JwksUnavailable("empty_jwks")  # Imp1 反映
        self._keys = new_keys
        self._fetched_at = time.monotonic()

    def _is_fresh(self) -> bool:
        return (
            self._fetched_at is not None
            and time.monotonic() - self._fetched_at < self._ttl
        )

    def _is_stale_usable(self) -> bool:
        return (
            self._fetched_at is not None
            and time.monotonic() - self._fetched_at < self._ttl + self._stale_seconds
        )


__all__ = ["JwksCache", "JwksUnavailable", "UnknownKid"]
