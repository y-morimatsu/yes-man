"""API endpoint tests via create_app() + TestClient (全 mock backend, 外部呼び出しなし).

main.py の create_app() / lifespan / 全 router / deps / middleware を、AWS 等の外部
サービスを一切呼ばずに (storage/auth/llm/voice=mock, event=sync) 統合的に検証する。
MOCK_AUTO_USER=true により、Bearer なしで固定 demo user として認証される。
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client(monkeypatch):  # noqa: ANN001
    env = {
        "APP_ENV": "dev",
        "AUTH_BACKEND": "mock",
        "STORAGE_BACKEND": "mock",
        "LLM_PROVIDER": "mock",
        "VOICE_BACKEND": "mock",
        "EVENT_BACKEND": "sync",
        "LEARNING_CONSUMER_ENABLED": "false",
        "MOCK_AUTO_USER": "true",
        "MOCK_SEED_DEMO_DECISIONS": "false",
        "MOCK_LLM_PERSONA_DELAY_SECONDS": "0",
        "SILENCE_HASH_SALT": "test-salt",
        "PERSONA_ANONYMIZER_SALT": "test-psalt",
        "CORS_ALLOWED_ORIGINS": '["http://localhost:5173"]',
    }
    for k, v in env.items():
        monkeypatch.setenv(k, v)

    from yesman_api.infrastructure.config import reset_config_cache

    reset_config_cache()
    from yesman_api.main import create_app

    app = create_app()
    with TestClient(app) as c:
        yield c
    reset_config_cache()


# ============================================================
# read endpoints
# ============================================================
def test_health(client: TestClient) -> None:
    r = client.get("/health")
    assert r.status_code == 200
    assert "status" in r.json()


def test_profile_me_get_or_create(client: TestClient) -> None:
    r = client.get("/v1/profiles/me")
    assert r.status_code == 200
    assert "email" in r.json()


def test_scores_me(client: TestClient) -> None:
    r = client.get("/v1/scores/me")
    assert r.status_code == 200
    body = r.json()
    assert "ratio" in body or "no_count" in body or "total" in body


def test_preferences_me(client: TestClient) -> None:
    r = client.get("/v1/preferences/me")
    assert r.status_code == 200


def test_personas_builtin_and_me(client: TestClient) -> None:
    r_builtin = client.get("/v1/personas/builtin")
    assert r_builtin.status_code == 200
    assert isinstance(r_builtin.json(), list)
    r_me = client.get("/v1/personas/me")
    assert r_me.status_code == 200


# ============================================================
# persona CRUD
# ============================================================
def test_persona_create_update_share_delete(client: TestClient) -> None:
    created = client.post(
        "/v1/personas/me",
        json={
            "name": "テスト人格",
            "description": "ユニットテスト用",
            "prompt_text": "あなたはテスト用の慎重な人格です。",
        },
    )
    assert created.status_code in (200, 201), created.text
    pid = created.json()["id"]

    patched = client.patch(f"/v1/personas/{pid}", json={"description": "更新済み"})
    assert patched.status_code == 200

    shared = client.patch(f"/v1/personas/{pid}/share", json={"shared": True})
    assert shared.status_code == 200

    deleted = client.delete(f"/v1/personas/{pid}")
    assert deleted.status_code in (200, 204)


# ============================================================
# persona selections
# ============================================================
def test_persona_selections_lifecycle(client: TestClient) -> None:
    builtin = client.get("/v1/personas/builtin").json()
    assert builtin, "builtin personas should be seeded"
    target_id = builtin[0]["id"]

    put = client.put("/v1/persona-selections/me", json={"persona_ids": [target_id]})
    assert put.status_code == 200

    got = client.get("/v1/persona-selections/me")
    assert got.status_code == 200

    delete = client.delete("/v1/persona-selections/me")
    assert delete.status_code in (200, 204)


# ============================================================
# voice
# ============================================================
def test_voice_config(client: TestClient) -> None:
    r = client.get("/v1/voice/config")
    assert r.status_code == 200
    assert "backend" in r.json()


def test_voice_tts(client: TestClient) -> None:
    r = client.post("/v1/voice/tts", json={"text": "読み上げテスト"})
    assert r.status_code == 200
    assert "audio_url" in r.json()


# ============================================================
# decision flow (mock LLM)
# ============================================================
def test_decision_request_and_choice(client: TestClient) -> None:
    req = client.post(
        "/v1/decisions/request",
        json={"user_input": "今日のランチを決めて", "persona_source": "builtin"},
    )
    assert req.status_code == 200, req.text
    decision_id = req.json()["decision_id"]

    choice = client.post(f"/v1/decisions/{decision_id}/choice", json={"choice": "yes"})
    assert choice.status_code == 200

    history = client.get("/v1/decisions")
    assert history.status_code == 200
