"""httpx クライアント設定 + 共通リトライヘルパー (AVAIL-U3-01, PERF-U3-02)."""
from __future__ import annotations

import asyncio

import httpx


def make_http_client() -> httpx.AsyncClient:
    """3 Adapter から共有される AsyncClient を生成。

    Timeout: connect=3s + read=3s + write=2s + pool=5s = 単一 GET 上限 ~7s (TLS handshake 込み)
    Limits:  max 10 concurrent + 5 keepalive (JWKS / userInfo の 2 endpoint)
    """
    return httpx.AsyncClient(
        timeout=httpx.Timeout(connect=3.0, read=3.0, write=2.0, pool=5.0),
        limits=httpx.Limits(max_connections=10, max_keepalive_connections=5),
        headers={"User-Agent": "yesman-api/0.1 (+httpx)"},
    )


async def fetch_with_retry(client: httpx.AsyncClient, url: str) -> httpx.Response:
    """GET with 1 retry (200ms backoff). Raises on 2nd failure.

    Captured exceptions: httpx.TimeoutException / httpx.HTTPStatusError / httpx.NetworkError
    """
    for attempt in range(2):  # 最大 2 試行 = 1 retry
        try:
            resp = await client.get(url)
            resp.raise_for_status()
            return resp
        except (httpx.TimeoutException, httpx.HTTPStatusError, httpx.NetworkError):
            if attempt == 1:
                raise
            await asyncio.sleep(0.2)
    raise RuntimeError("unreachable")  # for mypy completeness


async def fetch_with_retry_authed(
    client: httpx.AsyncClient, url: str, access_token: str
) -> httpx.Response:
    """GET with Bearer Authorization header + 1 retry. Used for Cognito userInfo endpoint."""
    headers = {"Authorization": f"Bearer {access_token}"}
    for attempt in range(2):
        try:
            resp = await client.get(url, headers=headers)
            resp.raise_for_status()
            return resp
        except (httpx.TimeoutException, httpx.HTTPStatusError, httpx.NetworkError):
            if attempt == 1:
                raise
            await asyncio.sleep(0.2)
    raise RuntimeError("unreachable")


__all__ = ["make_http_client", "fetch_with_retry", "fetch_with_retry_authed"]
