"""JwksCache — cache hit/miss/TTL/stale/force_refetch/empty_jwks."""
from __future__ import annotations

import asyncio
import json

import httpx
import pytest

from tests.fixtures.jwt import DEFAULT_KID, make_jwks_response
from yesman_api.infrastructure.auth.jwks_cache import (
    JwksCache,
    JwksUnavailable,
    UnknownKid,
)


def _make_cache(transport: httpx.MockTransport, *, ttl: float = 3600, stale: float = 300):
    http = httpx.AsyncClient(transport=transport)
    return JwksCache(
        "https://example.com/jwks", ttl=ttl, stale_seconds=stale, http=http
    )


async def test_cache_hit_after_first_fetch():
    counter = {"hits": 0}

    def handler(request):
        counter["hits"] += 1
        return httpx.Response(200, json=make_jwks_response())

    cache = _make_cache(httpx.MockTransport(handler))
    await cache.get_key(DEFAULT_KID)
    await cache.get_key(DEFAULT_KID)
    await cache.get_key(DEFAULT_KID)
    assert counter["hits"] == 1  # 1 回だけ JWKS GET


async def test_unknown_kid_raises():
    def handler(request):
        return httpx.Response(200, json=make_jwks_response(kid="other-kid"))

    cache = _make_cache(httpx.MockTransport(handler))
    with pytest.raises(UnknownKid):
        await cache.get_key(DEFAULT_KID)


async def test_force_refetch_re_fetches_jwks():
    counter = {"hits": 0}

    def handler(request):
        counter["hits"] += 1
        return httpx.Response(200, json=make_jwks_response())

    cache = _make_cache(httpx.MockTransport(handler))
    await cache.get_key(DEFAULT_KID)
    await cache.get_key(DEFAULT_KID, force_refetch=True)
    assert counter["hits"] == 2


async def test_empty_jwks_raises_jwks_unavailable():
    def handler(request):
        return httpx.Response(200, json={"keys": []})

    cache = _make_cache(httpx.MockTransport(handler))
    with pytest.raises(JwksUnavailable) as exc_info:
        await cache.get_key(DEFAULT_KID)
    assert "empty_jwks" in str(exc_info.value)


async def test_http_500_raises_jwks_unavailable():
    def handler(request):
        return httpx.Response(500, text="server error")

    cache = _make_cache(httpx.MockTransport(handler))
    with pytest.raises(JwksUnavailable):
        await cache.get_key(DEFAULT_KID)


async def test_concurrent_fetches_are_serialized():
    """asyncio.Lock により thundering herd を防ぐ (PERF-U3-04 Imp1)."""
    counter = {"hits": 0}

    async def handler_async(request):
        counter["hits"] += 1
        await asyncio.sleep(0.05)  # 並行性を観測しやすくする
        return httpx.Response(200, json=make_jwks_response())

    def handler(request):
        # MockTransport は同期ハンドラを許容、上位 fetch_with_retry も同期 raise_for_status
        counter["hits"] += 1
        return httpx.Response(200, json=make_jwks_response())

    cache = _make_cache(httpx.MockTransport(handler))
    # 100 並行 get_key
    await asyncio.gather(*(cache.get_key(DEFAULT_KID) for _ in range(100)))
    # asyncio.Lock により最大 1 回しか fetch されない
    assert counter["hits"] == 1
