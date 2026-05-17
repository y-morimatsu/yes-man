"""OriginVerifyMiddleware (ASGI) — CloudFront → ALB origin の片肺防御を補完.

NFR Design (U1 §infra) + audit.md SEC 設計通り:
- CloudFront の Origin Custom Header `X-Origin-Verify: <secret>` を FastAPI 側で照合
- secret は ECS task に `ORIGIN_VERIFY_SECRET` env で注入 (Secrets Manager 経由)
- 不一致 → 403 (ALB 直撃や bypass を防ぐ defense-in-depth、SG prefix list と二重ガード)

実装方針:
- ASGI レベル (BaseHTTPMiddleware より低オーバーヘッド、AuthMiddleware と一貫)
- bypass: /health /docs /redoc /openapi.json /internal/* + OPTIONS (AuthMiddleware と同等)
- `secrets.compare_digest` で constant-time 比較 (timing attack 対策)
- secret 空 (dev/test) では middleware 自体を install しないこと (main.py で gate)
"""
from __future__ import annotations

import json
import secrets
from typing import Any, Awaitable, Callable

from yesman_api.shared.logging import get_logger


Scope = dict[str, Any]
Receive = Callable[[], Awaitable[dict[str, Any]]]
Send = Callable[[dict[str, Any]], Awaitable[None]]
ASGIApp = Callable[[Scope, Receive, Send], Awaitable[None]]


class OriginVerifyMiddleware:
    BYPASS_PATHS_DEFAULT: frozenset[str] = frozenset(
        {"/health", "/docs", "/redoc", "/openapi.json"}
    )
    BYPASS_PREFIXES_DEFAULT: tuple[str, ...] = ("/internal/",)
    HEADER_NAME: bytes = b"x-origin-verify"

    def __init__(
        self,
        app: ASGIApp,
        *,
        expected_secret: str,
    ) -> None:
        if not expected_secret:
            raise ValueError(
                "OriginVerifyMiddleware requires non-empty expected_secret"
            )
        self.app = app
        self._expected = expected_secret.encode("utf-8")
        self._logger = get_logger("origin_verify.middleware")

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        path = scope.get("path", "")
        method = scope.get("method", "GET")
        if self._is_bypass(path) or method == "OPTIONS":
            return await self.app(scope, receive, send)
        provided = self._extract_header(scope.get("headers", []))
        if provided is None or not secrets.compare_digest(provided, self._expected):
            self._logger.warning(
                "origin_verify.failed",
                path=path,
                method=method,
                has_header=provided is not None,
            )
            return await self._send_403(send)
        await self.app(scope, receive, send)

    def _is_bypass(self, path: str) -> bool:
        return path in self.BYPASS_PATHS_DEFAULT or any(
            path.startswith(p) for p in self.BYPASS_PREFIXES_DEFAULT
        )

    @classmethod
    def _extract_header(cls, headers: list[tuple[bytes, bytes]]) -> bytes | None:
        for name, value in headers:
            if name.lower() == cls.HEADER_NAME:
                return value
        return None

    @staticmethod
    async def _send_403(send: Send) -> None:
        body = json.dumps(
            {"detail": "origin verification failed", "reason": "origin_invalid"}
        ).encode("utf-8")
        await send(
            {
                "type": "http.response.start",
                "status": 403,
                "headers": [
                    (b"content-type", b"application/json"),
                    (b"cache-control", b"no-store"),
                ],
            }
        )
        await send({"type": "http.response.body", "body": body})


__all__ = ["OriginVerifyMiddleware"]
