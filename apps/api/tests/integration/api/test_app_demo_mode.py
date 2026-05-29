"""デモモード経路の API テスト (email に morimatsu を含む auto-user, 全 mock backend).

deps.get_decision_engine の demo 分岐 (DemoLLMAdapter ラップ + ensure_demo_seeded) と
demo の scripted 合議を、外部サービスなしで通す。
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def demo_client(monkeypatch):  # noqa: ANN001
    env = {
        "APP_ENV": "dev",
        "AUTH_BACKEND": "mock",
        "STORAGE_BACKEND": "mock",
        "LLM_PROVIDER": "mock",
        "VOICE_BACKEND": "mock",
        "EVENT_BACKEND": "sync",
        "LEARNING_CONSUMER_ENABLED": "false",
        "MOCK_AUTO_USER": "true",
        "MOCK_USER_SUB": "11111111-1111-1111-1111-111111111111",
        "MOCK_USER_EMAIL": "morimatsu@example.com",  # demo gate
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

    with TestClient(create_app()) as c:
        yield c
    reset_config_cache()


def test_demo_user_decision_request(demo_client: TestClient) -> None:
    r = demo_client.post(
        "/v1/decisions/request",
        json={"user_input": "今日の外出着を選んで", "persona_source": "builtin"},
    )
    assert r.status_code == 200, r.text
    assert "decision_id" in r.json()


def test_demo_user_score_seeded(demo_client: TestClient) -> None:
    # demo user は profile/score を取得できる (seed 経路含む)
    assert demo_client.get("/v1/scores/me").status_code == 200
    assert demo_client.get("/v1/profiles/me").status_code == 200


def test_demo_user_stream(demo_client: TestClient) -> None:
    r = demo_client.post(
        "/v1/decisions/request/stream",
        json={"user_input": "今日の外出着を選んで", "persona_source": "builtin"},
    )
    assert r.status_code == 200
    assert "event:" in r.text
