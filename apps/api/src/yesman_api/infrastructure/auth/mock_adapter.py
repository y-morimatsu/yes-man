"""MockAuthAdapter — CI / 自動テスト / オフライン開発用 (FR-AUTH-06).

NFR Design §6.3 + ultrathink Imp5 反映: SPECIAL_TOKENS で 3 種特殊トークンを明示。
SEC-U3-11: prod / stg では起動拒否 (config.validate_runtime で fail-fast)。

multi-user support (2026-05-20):
  Bearer "mock-user:<base64url(json{sub, email})>" を受け付け、token に含まれる
  sub/email をそのまま返す。Frontend (CognitoTokenProvider) が生成する.
  上記 prefix を持たない token は従来通り env 固定 sub/email を返す
  (= MOCK_AUTO_USER=true + Bearer 無し時の "mock-auto" 経路、backward compat).
"""
from __future__ import annotations

import base64
import binascii
import json
from datetime import datetime, timedelta, timezone
from typing import ClassVar
from uuid import UUID

from yesman_api.application.auth.errors import AuthError
from yesman_api.domain.auth.models import AuthenticatedUser

MULTI_USER_PREFIX = "mock-user:"


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

        if token.startswith(MULTI_USER_PREFIX):
            return self._verify_multi_user(token[len(MULTI_USER_PREFIX):])

        # Backward compat: 任意の他 token は env 固定 sub/email を返す (mock-auto 経路を含む)
        return self._build_user(sub=self._sub, email=self._email)

    def _verify_multi_user(self, payload: str) -> AuthenticatedUser:
        """`mock-user:` prefix 後の base64url(JSON) をデコードして user を返す."""
        try:
            # base64url decode (padding 補完)
            padding = "=" * (-len(payload) % 4)
            raw = base64.urlsafe_b64decode((payload + padding).encode("ascii"))
            data = json.loads(raw.decode("utf-8"))
        except (binascii.Error, UnicodeDecodeError, json.JSONDecodeError, ValueError) as exc:
            raise AuthError("malformed") from exc

        if not isinstance(data, dict):
            raise AuthError("malformed")

        sub = data.get("sub")
        email = data.get("email")
        if not isinstance(sub, str) or not isinstance(email, str):
            raise AuthError("malformed")

        # sub は UUID 形式を強制 (Profile PK と整合)
        try:
            UUID(sub)
        except ValueError as exc:
            raise AuthError("malformed") from exc

        return self._build_user(sub=sub, email=email.lower())

    def _build_user(self, *, sub: str, email: str) -> AuthenticatedUser:
        now = datetime.now(timezone.utc)
        return AuthenticatedUser(
            sub=sub,
            email=email,
            email_verified=True,
            issued_at=now,
            expires_at=now + timedelta(hours=1),
            raw_claims={
                "sub": sub,
                "email": email,
                "token_use": "id",
                "mock": True,
            },
            backend=self.backend_name,
        )

    async def aclose(self) -> None:
        return None


__all__ = ["MockAuthAdapter", "MULTI_USER_PREFIX"]
