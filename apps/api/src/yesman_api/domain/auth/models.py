"""AuthenticatedUser — set on `request.state.user` after JWT verification.

Returned by AuthBackendAdapter.verify_token() (CognitoAuthAdapter / CognitoLocalAuthAdapter / MockAuthAdapter).
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Mapping


@dataclass(frozen=True, slots=True)
class AuthenticatedUser:
    """JWT 検証成功後にリクエストにアタッチされる認証済ユーザー。

    Attributes:
        sub: Cognito sub (UUID 文字列) — Profile.user_id にもなる
        email: lowercased email (ID Token claim or Cognito userInfo)
        email_verified: ID Token claim or userInfo
        issued_at: iat (UTC datetime)
        expires_at: exp (UTC datetime)
        raw_claims: 任意拡張用 (cognito:groups, custom:* 等)
        backend: "cognito" | "cognito-local" | "mock" — 監査・テスト用
    """

    sub: str
    email: str
    email_verified: bool
    issued_at: datetime
    expires_at: datetime
    raw_claims: Mapping[str, object]
    backend: str


__all__ = ["AuthenticatedUser"]
