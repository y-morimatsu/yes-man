"""UserInfoCache — TTL / email_verified キャッシュ / per-sub lock."""
from __future__ import annotations

import asyncio

import httpx
import pytest

from yesman_api.infrastructure.auth.userinfo_cache import (
    UserInfoCache,
    UserInfoEmailMissing,
)


def _make_cache(handler, *, ttl: float = 300):
    http = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    return UserInfoCache("https://example.com/oauth2/userInfo", ttl=ttl, http=http)


async def test_fetches_email_and_email_verified():
    def handler(request):
        return httpx.Response(
            200, json={"sub": "abc", "email": "Alice@Test.com", "email_verified": True}
        )

    cache = _make_cache(handler)
    info = await cache.get_userinfo(sub="abc", access_token="tok")
    assert info.email == "alice@test.com"  # lowercased
    assert info.email_verified is True


async def test_returns_cached_value_within_ttl():
    counter = {"hits": 0}

    def handler(request):
        counter["hits"] += 1
        return httpx.Response(
            200, json={"sub": "abc", "email": "a@b.c", "email_verified": True}
        )

    cache = _make_cache(handler)
    await cache.get_userinfo(sub="abc", access_token="tok")
    await cache.get_userinfo(sub="abc", access_token="tok")
    await cache.get_userinfo(sub="abc", access_token="tok")
    assert counter["hits"] == 1


async def test_email_missing_raises():
    def handler(request):
        return httpx.Response(200, json={"sub": "abc"})  # email クレームなし

    cache = _make_cache(handler)
    with pytest.raises(UserInfoEmailMissing):
        await cache.get_userinfo(sub="abc", access_token="tok")


async def test_email_verified_coerces_string_true():
    def handler(request):
        return httpx.Response(
            200, json={"sub": "abc", "email": "x@y.z", "email_verified": "true"}
        )

    cache = _make_cache(handler)
    info = await cache.get_userinfo(sub="abc", access_token="tok")
    assert info.email_verified is True


async def test_concurrent_per_sub_serialized():
    """同一 sub への並行リクエストは per-sub Lock で 1 回だけ userInfo を呼ぶ."""
    counter = {"hits": 0}

    def handler(request):
        counter["hits"] += 1
        return httpx.Response(
            200, json={"sub": "abc", "email": "a@b.c", "email_verified": True}
        )

    cache = _make_cache(handler)
    await asyncio.gather(
        *(cache.get_userinfo(sub="abc", access_token="tok") for _ in range(50))
    )
    assert counter["hits"] == 1
