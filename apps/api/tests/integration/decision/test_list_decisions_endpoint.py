"""GET /v1/decisions — 履歴 endpoint (attempt_count + filter + limit).

Mock backend + TestClient で middleware + router + Mock Repository を統合検証。
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from yesman_api.domain.persistence.models import Decision
from yesman_api.infrastructure.auth.mock_adapter import MockAuthAdapter
from yesman_api.infrastructure.config import AppConfig
from yesman_api.infrastructure.persistence.factory import RepositoryFactory
from yesman_api.interface.http.decisions import router as decisions_router

_MOCK_SUB = UUID("11111111-1111-1111-1111-111111111111")


def _make_decision(
    *,
    user_id: UUID,
    user_input_hash: str,
    user_choice: str,
    created_at: datetime,
    user_input: str = "test input",
    proposal_text: str = "test proposal",
) -> Decision:
    return Decision(
        id=uuid4(),
        user_id=user_id,
        domain_classification="daily",
        user_input=user_input,
        user_input_hash=user_input_hash,
        proposal_text=proposal_text,
        persona_outputs={},
        user_choice=user_choice,
        no_attempt_count=0,
        llm_provider="mock",
        selected_persona_ids=[],
        created_at=created_at,
    )


@pytest.fixture
def app_with_mock():
    """TestClient 用に decisions router を mock auth/repo と一緒に組む。"""
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

    @app.middleware("http")
    async def auth_dispatch(request, call_next):
        auth_header = request.headers.get("authorization", "")
        if not auth_header.lower().startswith("bearer "):
            from fastapi.responses import JSONResponse
            return JSONResponse({"detail": "missing"}, status_code=401)
        user = await adapter.verify_token(auth_header[7:])
        request.state.user = user
        return await call_next(request)

    app.include_router(decisions_router)
    return app, repo_factory


def test_returns_empty_when_no_decisions(app_with_mock):
    app, _ = app_with_mock
    client = TestClient(app)
    resp = client.get("/v1/decisions", headers={"Authorization": "Bearer x"})
    assert resp.status_code == 200
    body = resp.json()
    assert body == {"items": [], "limit": 20}


def test_filter_choice_yes_only(app_with_mock):
    app, repo_factory = app_with_mock
    repo = repo_factory.mock_store
    now = datetime.now(timezone.utc)
    repo.decisions[uuid4()] = _make_decision(
        user_id=_MOCK_SUB, user_input_hash="h1",
        user_choice="yes", created_at=now - timedelta(minutes=1),
    )
    repo.decisions[uuid4()] = _make_decision(
        user_id=_MOCK_SUB, user_input_hash="h2",
        user_choice="no", created_at=now - timedelta(minutes=2),
    )
    repo.decisions[uuid4()] = _make_decision(
        user_id=_MOCK_SUB, user_input_hash="h3",
        user_choice="pending", created_at=now - timedelta(minutes=3),
    )
    client = TestClient(app)
    resp = client.get("/v1/decisions?choice=yes", headers={"Authorization": "Bearer x"})
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert len(items) == 1
    assert items[0]["user_choice"] == "yes"


def test_attempt_count_grouped_by_hash(app_with_mock):
    """同一 user_input_hash 内で created_at 順 1-indexed の attempt_count が付く。"""
    app, repo_factory = app_with_mock
    repo = repo_factory.mock_store
    now = datetime.now(timezone.utc)
    # session A: 3 attempts (2 no → yes)
    for i, choice in enumerate(["no", "no", "yes"]):
        repo.decisions[uuid4()] = _make_decision(
            user_id=_MOCK_SUB, user_input_hash="session-a",
            user_choice=choice, created_at=now - timedelta(seconds=10 - i),
        )
    # session B: single attempt (yes)
    repo.decisions[uuid4()] = _make_decision(
        user_id=_MOCK_SUB, user_input_hash="session-b",
        user_choice="yes", created_at=now,
    )
    client = TestClient(app)
    resp = client.get("/v1/decisions?choice=yes", headers={"Authorization": "Bearer x"})
    assert resp.status_code == 200
    items = resp.json()["items"]
    # 新しい順: session-b (attempt 1) → session-a yes (attempt 3)
    assert len(items) == 2
    assert items[0]["attempt_count"] == 1  # session-b
    assert items[1]["attempt_count"] == 3  # session-a, 3rd attempt


def test_limit_caps_returned_items(app_with_mock):
    app, repo_factory = app_with_mock
    repo = repo_factory.mock_store
    now = datetime.now(timezone.utc)
    for i in range(10):
        repo.decisions[uuid4()] = _make_decision(
            user_id=_MOCK_SUB, user_input_hash=f"h-{i}",
            user_choice="yes", created_at=now - timedelta(minutes=i),
        )
    client = TestClient(app)
    resp = client.get("/v1/decisions?limit=5", headers={"Authorization": "Bearer x"})
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert len(items) == 5
    assert resp.json()["limit"] == 5


def test_unauthenticated_returns_401(app_with_mock):
    app, _ = app_with_mock
    client = TestClient(app)
    resp = client.get("/v1/decisions")  # no Authorization header
    assert resp.status_code == 401
