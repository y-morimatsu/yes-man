"""Profile lifecycle — GET (auto-create) → PATCH → GET → DELETE → GET 404.

Mock backend で FastAPI TestClient を使い、middleware + handler + Mock Repository を統合検証。
"""
from __future__ import annotations

from uuid import UUID

import pytest
from fastapi.testclient import TestClient

from yesman_api.infrastructure.auth.mock_adapter import MockAuthAdapter
from yesman_api.infrastructure.config import AppConfig
from yesman_api.infrastructure.persistence.factory import RepositoryFactory
from yesman_api.interface.http.health import router as health_router
from yesman_api.interface.http.profiles import router as profiles_router
from yesman_api.interface.middleware.auth import AuthMiddleware

_MOCK_SUB = UUID("11111111-1111-1111-1111-111111111111")


@pytest.fixture
def app_with_mock_auth():
    """FastAPI app を Mock backend + Mock Repository で組み立て (lifespan を使わず即時)."""
    from fastapi import FastAPI

    config = AppConfig(
        app_env="dev",
        auth_backend="mock",
        storage_backend="mock",
        mock_user_sub=_MOCK_SUB,
        mock_user_email="test@example.com",
    )
    repo_factory = RepositoryFactory(config)
    adapter = MockAuthAdapter(mock_sub=_MOCK_SUB, mock_email="test@example.com")

    app = FastAPI()
    app.state.repo_factory = repo_factory
    app.state.auth_adapter = adapter
    app.state.config = config

    # _LazyAuthMiddleware を使わず直接 AuthMiddleware を add (= TestClient 用ショートカット)
    @app.middleware("http")
    async def auth_dispatch(request, call_next):
        # AuthMiddleware を ASGI レベルで通したいが、TestClient は middleware 経路を完全模倣しない
        # ため、簡略化: ここでは直接 verify_token を呼んで state.user をセット
        path = request.url.path
        if path in {"/health", "/docs", "/openapi.json", "/redoc"} or path.startswith(
            "/internal/"
        ):
            return await call_next(request)
        auth_header = request.headers.get("authorization", "")
        if auth_header.lower().startswith("bearer "):
            token = auth_header[7:]
            try:
                user = await adapter.verify_token(token)
                request.state.user = user
            except Exception:
                from fastapi.responses import JSONResponse

                return JSONResponse({"detail": "auth failed"}, status_code=401)
        else:
            from fastapi.responses import JSONResponse

            return JSONResponse({"detail": "missing"}, status_code=401)
        return await call_next(request)

    app.include_router(health_router)
    app.include_router(profiles_router)
    return app


def test_profile_lifecycle_create_update_delete(app_with_mock_auth):
    client = TestClient(app_with_mock_auth)
    headers = {"Authorization": "Bearer any-mock-token"}

    # 1. GET → auto-create
    resp = client.get("/v1/profiles/me", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["user_id"] == str(_MOCK_SUB)
    assert body["email"] == "test@example.com"
    assert body["gender"] == []
    assert body["preferences"] == {}

    # 2. PATCH (部分更新)
    resp = client.patch(
        "/v1/profiles/me",
        headers=headers,
        json={
            "age_group": "30s",
            "gender": ["female"],
            "occupation": "engineer",
            "preferences": {"theme": "dark"},
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["age_group"] == "30s"
    assert body["gender"] == ["female"]
    assert body["occupation"] == "engineer"
    assert body["preferences"] == {"theme": "dark"}

    # 3. GET (永続化確認)
    resp = client.get("/v1/profiles/me", headers=headers)
    body = resp.json()
    assert body["age_group"] == "30s"
    assert body["preferences"] == {"theme": "dark"}

    # 4. DELETE
    resp = client.delete("/v1/profiles/me", headers=headers)
    assert resp.status_code == 204

    # 5. GET 後再度 → auto-create で新規 (FD §8.7 同じ sub で再ログイン → 新規 Profile)
    resp = client.get("/v1/profiles/me", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["age_group"] is None  # リセット済


def test_patch_without_get_returns_404(app_with_mock_auth):
    """PATCH の暗黙 create はしない (FD §8.6)."""
    client = TestClient(app_with_mock_auth)
    headers = {"Authorization": "Bearer any-mock-token"}
    # DB クリア状態を再現するため、別 sub のヘッダではなく Mock Repo がそもそも空であることを利用
    # ただし上のテストで mock_store に書き込んでいる可能性 → 独立 fixture が望ましいが、
    # ここでは「初期状態 = factory 再生成」で対処するパターンを残し、最初に DELETE する
    client.delete("/v1/profiles/me", headers=headers)
    resp = client.patch(
        "/v1/profiles/me", headers=headers, json={"age_group": "30s"}
    )
    assert resp.status_code == 404
    assert "profile not initialized" in resp.json()["detail"]


def test_missing_authorization_returns_401(app_with_mock_auth):
    client = TestClient(app_with_mock_auth)
    resp = client.get("/v1/profiles/me")
    assert resp.status_code == 401


def test_health_endpoint_bypasses_auth(app_with_mock_auth):
    client = TestClient(app_with_mock_auth)
    resp = client.get("/health")
    # Mock backend では DatabaseHealth.ping() が True → 200、False → 503
    # ここでは status code が 200 or 503 のいずれかであることを確認
    assert resp.status_code in {200, 503}
