"""MockAuthAdapter — CI / 自動テスト / オフライン開発用 (FR-AUTH-06).

NFR Design §6.3 + ultrathink Imp5 反映: SPECIAL_TOKENS で 3 種特殊トークンを明示。
SEC-U3-11: prod / stg では起動拒否 (config.validate_runtime で fail-fast)。
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import ClassVar
from uuid import UUID

from yesman_api.application.auth.errors import AuthError
from yesman_api.domain.auth.models import AuthenticatedUser


class MockAuthAdapter:
    backend_name = "mock"

    SPECIAL_TOKENS: ClassVar[dict[str, str]] = {
        "mock-expired": "expired",
        "mock-anonymous": "missing",
        "mock-malformed": "malformed",
    }

    def __init__(self, *, mock_sub: UUID, mock_email: str) -> None:
        self._sub = str(mock_sub)
        self._email = mock_email.lower()

    async def verify_token(self, token: str) -> AuthenticatedUser:
        if token == "":
            raise AuthError("missing")
        if token in self.SPECIAL_TOKENS:
            raise AuthError(self.SPECIAL_TOKENS[token])
        now = datetime.now(timezone.utc)
        return AuthenticatedUser(
            sub=self._sub,
            email=self._email,
            email_verified=True,
            issued_at=now,
            expires_at=now + timedelta(hours=1),
            raw_claims={
                "sub": self._sub,
                "email": self._email,
                "token_use": "id",
                "mock": True,
            },
            backend=self.backend_name,
        )

    async def aclose(self) -> None:
        return None


__all__ = ["MockAuthAdapter"]
