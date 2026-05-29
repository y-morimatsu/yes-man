"""Unit tests for OriginVerifyMiddleware (ASGI, interface/middleware/origin_verify.py).

外部呼び出しなし。ASGI scope/receive/send を fake して、bypass / 検証成功 /
不一致 403 / 設定不備 を網羅する。
"""
from __future__ import annotations

import json

import pytest

from yesman_api.interface.middleware.origin_verify import OriginVerifyMiddleware

SECRET = "s3cr3t-origin"


class _AppRecorder:
    def __init__(self) -> None:
        self.called = False
        self.scope: dict | None = None

    async def __call__(self, scope, receive, send) -> None:  # noqa: ANN001
        self.called = True
        self.scope = scope


class _SendRecorder:
    def __init__(self) -> None:
        self.messages: list[dict] = []

    async def __call__(self, message: dict) -> None:
        self.messages.append(message)


async def _receive() -> dict:
    return {"type": "http.request", "body": b"", "more_body": False}


def _scope(path: str = "/v1/decisions/request", method: str = "POST", headers=None) -> dict:
    return {
        "type": "http",
        "path": path,
        "method": method,
        "headers": headers or [],
    }


def test_empty_secret_raises() -> None:
    with pytest.raises(ValueError):
        OriginVerifyMiddleware(_AppRecorder(), expected_secret="")


async def test_non_http_scope_passes_through() -> None:
    app = _AppRecorder()
    mw = OriginVerifyMiddleware(app, expected_secret=SECRET)
    await mw({"type": "lifespan"}, _receive, _SendRecorder())
    assert app.called is True


async def test_bypass_health_without_header() -> None:
    app = _AppRecorder()
    send = _SendRecorder()
    mw = OriginVerifyMiddleware(app, expected_secret=SECRET)
    await mw(_scope(path="/health", method="GET"), _receive, send)
    assert app.called is True
    assert send.messages == []


async def test_options_method_bypassed() -> None:
    app = _AppRecorder()
    mw = OriginVerifyMiddleware(app, expected_secret=SECRET)
    await mw(_scope(method="OPTIONS"), _receive, _SendRecorder())
    assert app.called is True


async def test_internal_prefix_bypassed() -> None:
    app = _AppRecorder()
    mw = OriginVerifyMiddleware(app, expected_secret=SECRET)
    await mw(_scope(path="/internal/events/decision-confirmed"), _receive, _SendRecorder())
    assert app.called is True


async def test_valid_header_allows_request() -> None:
    app = _AppRecorder()
    mw = OriginVerifyMiddleware(app, expected_secret=SECRET)
    headers = [(b"x-origin-verify", SECRET.encode("utf-8"))]
    await mw(_scope(headers=headers), _receive, _SendRecorder())
    assert app.called is True


async def test_missing_header_returns_403() -> None:
    app = _AppRecorder()
    send = _SendRecorder()
    mw = OriginVerifyMiddleware(app, expected_secret=SECRET)
    await mw(_scope(headers=[]), _receive, send)
    assert app.called is False
    assert send.messages[0]["status"] == 403
    body = json.loads(send.messages[1]["body"].decode("utf-8"))
    assert body["reason"] == "origin_invalid"


async def test_wrong_header_returns_403() -> None:
    app = _AppRecorder()
    send = _SendRecorder()
    mw = OriginVerifyMiddleware(app, expected_secret=SECRET)
    await mw(_scope(headers=[(b"x-origin-verify", b"wrong")]), _receive, send)
    assert app.called is False
    assert send.messages[0]["status"] == 403
