"""AuthBackendFactory — config.auth_backend に応じて 3 Adapter のいずれかを生成.

NFR Design §6.4 通り、U2 RepositoryFactory と同パターン:
- process-wide singleton (lifespan startup で 1 回 create)
- shutdown で aclose() を呼ぶ
- request scope ではなく app-wide で adapter / JWKS キャッシュ / userInfo キャッシュを共有
"""
from __future__ import annotations

from yesman_api.application.auth.protocols import AuthBackendAdapter
from yesman_api.infrastructure.auth.cognito_adapter import CognitoAuthAdapter
from yesman_api.infrastructure.auth.cognito_local_adapter import CognitoLocalAuthAdapter
from yesman_api.infrastructure.auth.mock_adapter import MockAuthAdapter
from yesman_api.infrastructure.config import AppConfig


class AuthBackendFactory:
    def __init__(self, config: AppConfig) -> None:
        self._config = config
        self._adapter: AuthBackendAdapter | None = None

    async def create(self) -> AuthBackendAdapter:
        if self._adapter is not None:
            return self._adapter
        backend = self._config.auth_backend
        if backend == "cognito":
            # validate_runtime() で必須環境変数を強制済 (AVAIL-U3-03)
            self._adapter = CognitoAuthAdapter(
                region=self._config.cognito_region or "",
                user_pool_id=self._config.cognito_user_pool_id or "",
                app_client_id=self._config.cognito_app_client_id or "",
                hosted_ui_url=self._config.cognito_hosted_ui_url or "",
                jwks_cache_ttl=self._config.jwks_cache_ttl_seconds,
                jwks_stale_seconds=self._config.jwks_stale_while_error_seconds,
                userinfo_ttl=self._config.userinfo_cache_ttl_seconds,
            )
        elif backend == "cognito-local":
            self._adapter = CognitoLocalAuthAdapter(
                issuer_url=self._config.cognito_local_issuer_url or "",
                app_client_id=self._config.cognito_app_client_id or "",
                userinfo_url=self._config.cognito_local_userinfo_url,
                jwks_cache_ttl=self._config.jwks_cache_ttl_seconds,
                jwks_stale_seconds=self._config.jwks_stale_while_error_seconds,
                userinfo_ttl=self._config.userinfo_cache_ttl_seconds,
            )
        elif backend == "mock":
            self._adapter = MockAuthAdapter(
                mock_sub=self._config.mock_user_sub,
                mock_email=self._config.mock_user_email,
            )
        else:
            raise RuntimeError(f"Unknown AUTH_BACKEND: {backend!r}")
        return self._adapter

    async def dispose(self) -> None:
        if self._adapter is not None:
            await self._adapter.aclose()
            self._adapter = None


__all__ = ["AuthBackendFactory"]
