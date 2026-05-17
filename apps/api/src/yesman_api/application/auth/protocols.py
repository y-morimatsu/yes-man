"""AuthBackendAdapter Protocol — 認証バックエンドの抽象 (FR-AUTH-05, NFR-EXT-04).

3 実装 (CognitoAuthAdapter / CognitoLocalAuthAdapter / MockAuthAdapter) がこの Protocol に準拠する。
Contract test (`tests/contract/test_auth_protocol.py`) が `@runtime_checkable` + `isinstance` で適合検証。
"""
from __future__ import annotations

from typing import Protocol, runtime_checkable

from yesman_api.domain.auth.models import AuthenticatedUser


@runtime_checkable
class AuthBackendAdapter(Protocol):
    """認証バックエンドの最小インターフェース。

    `verify_token` のみが必須メソッド (公開鍵検証 + email 取得を内部に閉じ込める)。
    OAuth code 交換 / refresh / revoke は SPA + PKCE で FE 完結のため Adapter に含めない。
    """

    backend_name: str  # "cognito" / "cognito-local" / "mock"

    async def verify_token(self, token: str) -> AuthenticatedUser:
        """Bearer Token を検証し AuthenticatedUser を返す。失敗時は AuthError を raise。"""
        ...

    async def aclose(self) -> None:
        """HTTP クライアントや JWKS キャッシュの dispose。lifespan shutdown で呼ばれる。"""
        ...


__all__ = ["AuthBackendAdapter"]
