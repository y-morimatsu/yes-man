"""AuthMiddleware (ASGI) + _LazyAuthMiddleware (FastAPI lifespan 統合用ラッパー).

NFR Design §7 + §8 通り:
- ASGI レベル実装で BaseHTTPMiddleware より低オーバーヘッド
- bypass: /health /docs /openapi.json /redoc + /internal/* + OPTIONS
- Bearer Token 抽出 (Authorization header のみ、Cookie/Query 拒否)
- 401 レスポンスに WWW-Authenticate + Cache-Control: no-store
- _LazyAuthMiddleware: lifespan startup 後に adapter を bind (Starlette 0.32+ 必須)
"""
from __future__ import annotations

import json
from typing import Any, Awaitable, Callable

from yesman_api.application.auth.errors import AuthError
from yesman_api.application.auth.protocols import AuthBackendAdapter
from yesman_api.shared.logging import get_logger


# ASGI typing (minimal, 依存を増やさず Starlette 抽象に依存しない)
Scope = dict[str, Any]
Receive = Callable[[], Awaitable[dict[str, Any]]]
Send = Callable[[dict[str, Any]], Awaitable[None]]
ASGIApp = Callable[[Scope, Receive, Send], Awaitable[None]]


class AuthMiddleware:
    BYPASS_PATHS_DEFAULT: frozenset[str] = frozenset(
        {"/health", "/docs", "/redoc", "/openapi.json"}
    )
    BYPASS_PREFIXES_DEFAULT: tuple[str, ...] = ("/internal/",)

    def __init__(
        self,
        app: ASGIApp,
        *,
        adapter: AuthBackendAdapter,
        extra_bypass_paths: frozenset[str] = frozenset(),
        mock_auto_user: bool = False,
    ) -> None:
        self.app = app
        self._adapter = adapter
        self._bypass_paths = self.BYPASS_PATHS_DEFAULT | extra_bypass_paths
        self._bypass_prefixes = self.BYPASS_PREFIXES_DEFAULT
        self._mock_auto_user = mock_auto_user
        self._logger = get_logger("auth.middleware")

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        path = scope.get("path", "")
        method = scope.get("method", "GET")
        if self._is_bypass(path) or method == "OPTIONS":
            return await self.app(scope, receive, send)
        token = self._extract_bearer(scope.get("headers", []))
        try:
            if token is None:
                if self._mock_auto_user and self._adapter.backend_name == "mock":
                    token = "mock-auto"
                else:
                    raise AuthError("missing")
            user = await self._adapter.verify_token(token)
        except AuthError as exc:
            return await self._send_401(send, exc)
        scope.setdefault("state", {})["user"] = user
        await self.app(scope, receive, send)

    def _is_bypass(self, path: str) -> bool:
        return path in self._bypass_paths or any(
            path.startswith(p) for p in self._bypass_prefixes
        )

    @staticmethod
    def _extract_bearer(headers: list[tuple[bytes, bytes]]) -> str | None:
        # Authorization: Bearer xxx (大文字小文字不問)
        for name, value in headers:
            if name.lower() == b"authorization":
                raw = value.decode("latin-1")
                if raw.lower().startswith("bearer "):
                    return raw[7:].strip()
                return None
        return None

    async def _send_401(self, send: Send, exc: AuthError) -> None:
        body = json.dumps(
            {"detail": "authentication required", "reason": exc.reason}
        ).encode("utf-8")
        await send(
            {
                "type": "http.response.start",
                "status": 401,
                "headers": [
                    (b"content-type", b"application/json"),
                    (b"www-authenticate", b'Bearer error="invalid_token"'),
                    (b"cache-control", b"no-store"),
                ],
            }
        )
        await send({"type": "http.response.body", "body": body})


class _LazyAuthMiddleware:
    """AuthMiddleware を lifespan startup 後にバインドするラッパー.

    FastAPI の `add_middleware` は __init__ 時に adapter を必要とするが、
    lifespan startup までは adapter が存在しないため、最初の HTTP リクエスト時に
    `scope["app"].state.auth_adapter` 経由で lazy bind する。

    依存: Starlette >= 0.32 (scope["app"] が FastAPI/Starlette アプリインスタンスを指す)。
    純粋 ASGI テストでは `tests/conftest.py` の `attach_auth_adapter` で
    `scope["app"].state.auth_adapter` を手動セットする。
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app
        self._inner: AuthMiddleware | None = None

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        if self._inner is None:
            fastapi_app = scope.get("app")
            if fastapi_app is None:
                raise RuntimeError(
                    "_LazyAuthMiddleware requires Starlette>=0.32 (scope['app'] populated)"
                )
            adapter: AuthBackendAdapter = fastapi_app.state.auth_adapter
            config = fastapi_app.state.config
            self._inner = AuthMiddleware(
                self.app,
                adapter=adapter,
                extra_bypass_paths=frozenset(config.auth_bypass_paths_extra),
                mock_auto_user=config.mock_auto_user,
            )
        await self._inner(scope, receive, send)


__all__ = ["AuthMiddleware", "_LazyAuthMiddleware"]
