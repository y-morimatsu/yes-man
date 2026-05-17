"""Contract test — 3 Adapter が同一 AuthBackendAdapter Protocol を満たす.

ultrathink Imp5 (NFR Design) 反映: @runtime_checkable + isinstance() ベース
(`inspect.signature` 比較は false positive を生むため不採用)。
"""
from __future__ import annotations

from uuid import UUID

from yesman_api.application.auth.protocols import AuthBackendAdapter
from yesman_api.infrastructure.auth.cognito_adapter import CognitoAuthAdapter
from yesman_api.infrastructure.auth.cognito_local_adapter import CognitoLocalAuthAdapter
from yesman_api.infrastructure.auth.mock_adapter import MockAuthAdapter


def test_mock_adapter_implements_protocol():
    adapter = MockAuthAdapter(
        mock_sub=UUID("11111111-1111-1111-1111-111111111111"),
        mock_email="test@yesman.local",
    )
    assert isinstance(adapter, AuthBackendAdapter)
    assert adapter.backend_name == "mock"


def test_cognito_adapter_implements_protocol():
    adapter = CognitoAuthAdapter(
        region="ap-northeast-1",
        user_pool_id="ap-northeast-1_FAKE",
        app_client_id="fake-client",
        hosted_ui_url="https://example.auth.ap-northeast-1.amazoncognito.com",
    )
    assert isinstance(adapter, AuthBackendAdapter)
    assert adapter.backend_name == "cognito"


def test_cognito_local_adapter_implements_protocol():
    adapter = CognitoLocalAuthAdapter(
        issuer_url="http://localhost:9229/local_xxx",
        app_client_id="fake-client",
    )
    assert isinstance(adapter, AuthBackendAdapter)
    assert adapter.backend_name == "cognito-local"
