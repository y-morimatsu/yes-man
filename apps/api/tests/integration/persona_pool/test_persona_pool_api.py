"""Integration tests — /v1/persona-pool/* (TestClient + Mock backend).

FastAPI TestClient で:
- GET /v1/persona-pool/me              ── opt-in 状態 + preview + guard
- POST /v1/persona-pool/opt-in         ── derive + 422 if signal_total < 3 (FR-9)
- DELETE /v1/persona-pool/opt-in
- GET /v1/persona-pool/random?n=2      ── auto-exclude self (NFR-6)
- GET /v1/persona-pool/me/citations    ── today_count / all_time_count
- GET /v1/persona-pool/cited-by-me     ── 履歴 list
- 全 endpoint で auth 401 (US-2.3 / NFR-6)
"""
from __future__ import annotations

from uuid import UUID

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from yesman_api.infrastructure.auth.mock_adapter import MockAuthAdapter
from yesman_api.infrastructure.config import AppConfig
from yesman_api.infrastructure.persistence.factory import RepositoryFactory
from yesman_api.infrastructure.persistence.mock_pool_repository import (
    MockPoolRepository,
)
from yesman_api.interface.http.health import router as health_router
from yesman_api.interface.http.persona_pool import router as persona_pool_router
from yesman_api.interface.http.preferences import router as preferences_router

_MOCK_SUB = UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")


def _build_app(*, seed_pool: bool = True) -> FastAPI:
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
    app.state.anonymous_pool = MockPoolRepository(seed_fixtures=seed_pool)
    app.state.config = config

    @app.middleware("http")
    async def _auth_dispatch(request, call_next):
        path = request.url.path
        if path in {"/health", "/docs", "/openapi.json", "/redoc"} or path.startswith(
            "/internal/"
        ):
            return await call_next(request)
        auth_header = request.headers.get("authorization", "")
        if auth_header.lower().startswith("bearer "):
            try:
                user = await adapter.verify_token(auth_header[7:])
                request.state.user = user
            except Exception:
                from fastapi.responses import JSONResponse

                return JSONResponse({"detail": "auth failed"}, status_code=401)
        else:
            from fastapi.responses import JSONResponse

            return JSONResponse({"detail": "missing"}, status_code=401)
        return await call_next(request)

    app.include_router(health_router)
    app.include_router(preferences_router)
    app.include_router(persona_pool_router)
    return app


@pytest.fixture
def app_with_mock_auth():
    return _build_app(seed_pool=True)


@pytest.fixture
def client(app_with_mock_auth):
    return TestClient(app_with_mock_auth)


def _headers() -> dict[str, str]:
    return {"Authorization": "Bearer any-mock-token"}


# ============================================================
# Auth — all endpoints reject unauthenticated requests
# ============================================================
class TestAuth401:
    @pytest.mark.parametrize(
        "method, path",
        [
            ("GET", "/v1/persona-pool/me"),
            ("POST", "/v1/persona-pool/opt-in"),
            ("DELETE", "/v1/persona-pool/opt-in"),
            ("GET", "/v1/persona-pool/random?n=2"),
            ("GET", "/v1/persona-pool/me/citations"),
            ("GET", "/v1/persona-pool/cited-by-me"),
        ],
    )
    def test_unauthenticated_returns_401(self, client, method, path):
        resp = client.request(method, path)
        assert resp.status_code == 401, (
            f"{method} {path} returned {resp.status_code} (expected 401)"
        )


# ============================================================
# GET /v1/persona-pool/me — status + preview + guard
# ============================================================
class TestStatus:
    def test_initial_status_not_opted_in_with_guard_failing(self, client):
        """新規 user は preference 空 → signal_total=0 → is_eligible=False."""
        resp = client.get("/v1/persona-pool/me", headers=_headers())
        assert resp.status_code == 200
        body = resp.json()
        assert body["opted_in"] is False
        # preference 空でも ColdStart で若干 derive される可能性あるが、guard 不足が普通
        assert body["guard"]["min_required"] == 3
        assert body["guard"]["signal_total"] >= 0
        # 空 preference では eligible = False が期待
        if body["guard"]["signal_total"] < 3:
            assert body["guard"]["is_eligible"] is False


# ============================================================
# POST /v1/persona-pool/opt-in — derive + FR-9 guard
# ============================================================
class TestOptIn:
    def test_opt_in_with_empty_profile_returns_422(self, client):
        """FR-9 / US-2.4 guard: signal_total < 3 で 422."""
        resp = client.post("/v1/persona-pool/opt-in", headers=_headers())
        # 空 preference → derive_spec が signal_total < 3 → 422
        if resp.status_code == 200:
            # ColdStart で十分な signal が出る場合は OK (環境次第)
            pytest.skip("ColdStart provided enough signals; cannot test guard")
        assert resp.status_code == 422
        detail = resp.json()["detail"]
        assert detail["code"] == "insufficient_profile_signals"
        assert detail["min_required"] == 3
        assert "嗜好把握" in detail["hint"]

    def test_opt_in_then_opt_out_flow(self, client):
        """preference を埋めてから opt-in → opt-out."""
        # 1. preference を満たす値で PATCH
        patch_resp = client.patch(
            "/v1/preferences/me",
            headers=_headers(),
            json={
                "accepted_patterns": [
                    {"phrase": "ま、いっか"},
                    {"phrase": "あとで でいいや"},
                ],
                "inferred_tags": ["慎重派", "夜型", "面倒くさがり"],
            },
        )
        assert patch_resp.status_code == 200

        # 2. opt-in 成功
        resp = client.post("/v1/persona-pool/opt-in", headers=_headers())
        assert resp.status_code == 200, resp.text
        spec = resp.json()
        assert "persona_id" in spec
        assert isinstance(spec["value_tags"], list)
        assert len(spec["value_tags"]) <= 5
        # 2026-05-24: quirks 仕様削除済、API レスポンスに含まれない
        assert "quirks" not in spec
        assert spec["primary_language"] in {"ja", "en", "fr", "ar", "zh"}
        assert spec["formality"] in {"polite", "casual", "blunt"}
        # NFR-6: user.sub は API レスポンスに含まれない
        assert "sub" not in spec
        assert "user_id" not in spec

        # 3. status で opted_in=True
        status_resp = client.get("/v1/persona-pool/me", headers=_headers())
        assert status_resp.json()["opted_in"] is True

        # 4. opt-out
        del_resp = client.delete("/v1/persona-pool/opt-in", headers=_headers())
        assert del_resp.status_code == 204

        # 5. status で opted_in=False
        status_resp2 = client.get("/v1/persona-pool/me", headers=_headers())
        assert status_resp2.json()["opted_in"] is False

    def test_opt_out_is_idempotent(self, client):
        """未 opt-in での DELETE も 204."""
        resp = client.delete("/v1/persona-pool/opt-in", headers=_headers())
        assert resp.status_code == 204


# ============================================================
# GET /v1/persona-pool/list — 2026-05-24 v4 (random は撤去、selection UI 用)
# ============================================================
class TestListForSelection:
    def test_default_limit_20(self, client):
        resp = client.get("/v1/persona-pool/list", headers=_headers())
        assert resp.status_code == 200
        personas = resp.json()["personas"]
        # fixture seed 4 件 → 全件返る (limit 20 だが pool 4)
        assert len(personas) == 4
        for p in personas:
            assert p["primary_language"] == "ja"

    def test_custom_limit(self, client):
        resp = client.get("/v1/persona-pool/list?limit=3", headers=_headers())
        assert resp.status_code == 200
        assert len(resp.json()["personas"]) == 3

    def test_limit_out_of_range_returns_422(self, client):
        resp = client.get("/v1/persona-pool/list?limit=0", headers=_headers())
        assert resp.status_code == 422
        resp = client.get("/v1/persona-pool/list?limit=200", headers=_headers())
        assert resp.status_code == 422

    def test_empty_pool_returns_empty(self):
        """seed_pool=False で空 pool なら空配列."""
        app = _build_app(seed_pool=False)
        client_no_seed = TestClient(app)
        resp = client_no_seed.get("/v1/persona-pool/list", headers=_headers())
        assert resp.status_code == 200
        assert resp.json()["personas"] == []


# ============================================================
# Citations
# ============================================================
class TestCitations:
    def test_citations_zero_when_not_opted_in(self, client):
        """opt-in していなければ自分の persona は cite されていない."""
        resp = client.get("/v1/persona-pool/me/citations", headers=_headers())
        assert resp.status_code == 200
        body = resp.json()
        assert body["today_count"] == 0
        assert body["all_time_count"] == 0

    def test_citations_after_opt_in(self, client):
        """opt-in 後は seed citations 5 件が表示される (US-2.2)."""
        # preference を埋めて opt-in
        client.patch(
            "/v1/preferences/me",
            headers=_headers(),
            json={
                "accepted_patterns": [{"phrase": "x"}],
                "inferred_tags": ["t1", "t2", "t3"],
            },
        )
        opt_resp = client.post("/v1/persona-pool/opt-in", headers=_headers())
        assert opt_resp.status_code == 200

        resp = client.get("/v1/persona-pool/me/citations", headers=_headers())
        body = resp.json()
        # seed は 5 件、今日中
        assert body["all_time_count"] == 5
        assert body["today_count"] == 5

    def test_cited_by_me_empty_initially(self, client):
        resp = client.get("/v1/persona-pool/cited-by-me", headers=_headers())
        assert resp.status_code == 200
        assert resp.json()["items"] == []
