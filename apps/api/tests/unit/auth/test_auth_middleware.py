"""AuthMiddleware — bypass 6 種 + 401 + state.user + Cache-Control + MOCK_AUTO_USER."""
from __future__ import annotations

import json
from typing import Any

import pytest

from yesman_api.application.auth.errors import AuthError
from yesman_api.domain.auth.models import AuthenticatedUser
from yesman_api.infrastructure.auth.mock_adapter import MockAuthAdapter
from yesman_api.interface.middleware.auth import AuthMiddleware

_MOCK_SUB = "11111111-1111-1111-1111-111111111111"


@pytest.fixture
def mock_adapter():
    from uuid import UUID

    return MockAuthAdapter(mock_sub=UUID(_MOCK_SUB), mock_email="test@yesman.local")


class _RecordingApp:
    """ASGI app stub — Bearer 認証成功時の scope を記録する."""

    def __init__(self) -> None:
        self.called = False
        self.user: AuthenticatedUser | None = None

    async def __call__(self, scope, receive, send):
        self.called = True
        self.user = scope.get("state", {}).get("user")
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b"OK"})


async def _call_middleware(mw, *, path: str, method: str = "GET", auth: str | None = None):
    """Helper: middleware に scope を渡し、レスポンスメッセージ列を収集する."""
    headers: list[tuple[bytes, bytes]] = []
    if auth is not None:
        headers.append((b"authorization", auth.encode("latin-1")))
    scope: dict[str, Any] = {
        "type": "http",
        "method": method,
        "path": path,
        "headers": headers,
    }
    messages: list[dict[str, Any]] = []

    async def send(msg):
        messages.append(msg)

    async def receive():
        return {"type": "http.request", "body": b"", "more_body": False}

    await mw(scope, receive, send)
    return scope, messages


# ============================================================
# Bypass paths (6 種)
# ============================================================
@pytest.mark.parametrize(
    "path",
    ["/health", "/docs", "/openapi.json", "/redoc", "/internal/foo"],
)
async def test_bypass_paths_pass_through(mock_adapter, path):
    app = _RecordingApp()
    mw = AuthMiddleware(app, adapter=mock_adapter)
    scope, messages = await _call_middleware(mw, path=path)
    assert app.called is True
    assert messages[0]["status"] == 200


async def test_options_method_bypass(mock_adapter):
    """OPTIONS preflight は認証スキップ (CORS 用)."""
    app = _RecordingApp()
    mw = AuthMiddleware(app, adapter=mock_adapter)
    scope, messages = await _call_middleware(mw, path="/v1/profiles/me", method="OPTIONS")
    assert app.called is True


# ============================================================
# 401 reason cases
# ============================================================
async def test_missing_authorization_header_returns_401(mock_adapter):
    app = _RecordingApp()
    mw = AuthMiddleware(app, adapter=mock_adapter)
    _, messages = await _call_middleware(mw, path="/v1/profiles/me")
    assert messages[0]["status"] == 401
    body = json.loads(messages[1]["body"])
    assert body["reason"] == "missing"


async def test_401_response_has_cache_control_no_store(mock_adapter):
    """401 レスポンスは Cache-Control: no-store (Imp4)."""
    app = _RecordingApp()
    mw = AuthMiddleware(app, adapter=mock_adapter)
    _, messages = await _call_middleware(mw, path="/v1/profiles/me")
    headers = dict(messages[0]["headers"])
    assert headers.get(b"cache-control") == b"no-store"
    assert b"www-authenticate" in headers


async def test_401_response_has_www_authenticate(mock_adapter):
    app = _RecordingApp()
    mw = AuthMiddleware(app, adapter=mock_adapter)
    _, messages = await _call_middleware(mw, path="/v1/profiles/me")
    headers = dict(messages[0]["headers"])
    assert b"Bearer" in headers.get(b"www-authenticate", b"")


@pytest.mark.parametrize(
    "token,expected_reason",
    [
        ("mock-expired", "expired"),
        ("mock-anonymous", "missing"),
        ("mock-malformed", "malformed"),
    ],
)
async def test_special_token_reasons(mock_adapter, token, expected_reason):
    app = _RecordingApp()
    mw = AuthMiddleware(app, adapter=mock_adapter)
    _, messages = await _call_middleware(
        mw, path="/v1/profiles/me", auth=f"Bearer {token}"
    )
    assert messages[0]["status"] == 401
    body = json.loads(messages[1]["body"])
    assert body["reason"] == expected_reason


# ============================================================
# Success path — state.user セット
# ============================================================
async def test_valid_token_sets_state_user(mock_adapter):
    app = _RecordingApp()
    mw = AuthMiddleware(app, adapter=mock_adapter)
    await _call_middleware(mw, path="/v1/profiles/me", auth="Bearer anything")
    assert app.called is True
    assert app.user is not None
    assert app.user.sub == _MOCK_SUB
    assert app.user.email == "test@yesman.local"


async def test_authorization_without_bearer_prefix_is_missing(mock_adapter):
    """Authorization: xxx (Bearer prefix なし) は missing 扱い."""
    app = _RecordingApp()
    mw = AuthMiddleware(app, adapter=mock_adapter)
    _, messages = await _call_middleware(mw, path="/v1/profiles/me", auth="Basic abc")
    body = json.loads(messages[1]["body"])
    assert body["reason"] == "missing"


# ============================================================
# MOCK_AUTO_USER (Imp4 拡張)
# ============================================================
async def test_mock_auto_user_passes_without_authorization(mock_adapter):
    """MOCK_AUTO_USER=true なら Authorization 省略でも mock_user で通過."""
    app = _RecordingApp()
    mw = AuthMiddleware(app, adapter=mock_adapter, mock_auto_user=True)
    await _call_middleware(mw, path="/v1/profiles/me")  # auth なし
    assert app.called is True
    assert app.user is not None
    assert app.user.sub == _MOCK_SUB


# ============================================================
# Extra bypass paths
# ============================================================
async def test_extra_bypass_paths(mock_adapter):
    app = _RecordingApp()
    mw = AuthMiddleware(
        app, adapter=mock_adapter, extra_bypass_paths=frozenset({"/custom-bypass"})
    )
    scope, messages = await _call_middleware(mw, path="/custom-bypass")
    assert app.called is True
