"""DecisionEngine の深い分岐を SSE stream 経由で駆動する API テスト (全 mock backend).

run_stream の drill-down depth 別 guide (depth=1 / >=2 / MAX) と、selected_personas の
mixed (builtin + my) / anonymous 経路を、外部サービスなしで広くカバーする。
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

    with TestClient(create_app()) as c:
        yield c
    reset_config_cache()


@pytest.mark.parametrize("ctx_len", [1, 2, 3, 4])
def test_drilldown_depths_via_stream(client: TestClient, ctx_len: int) -> None:
    """chain_context 長を変えて run_stream の depth 別 guide (1 / >=2 / MAX) を網羅."""
    ctx = [f"前段の提案 {i}" for i in range(ctx_len)]
    r = client.post(
        "/v1/decisions/request/stream",
        json={
            "user_input": "観たい映画を決めて",
            "persona_source": "builtin",
            "chain_context": ctx,
        },
    )
    assert r.status_code == 200
    assert "event:" in r.text


def test_drilldown_final_non_stream(client: TestClient) -> None:
    r = client.post(
        "/v1/decisions/request",
        json={
            "user_input": "観たい映画を決めて",
            "persona_source": "builtin",
            "chain_context": ["a", "b", "c", "d"],
        },
    )
    assert r.status_code == 200


def test_stream_selected_personas_mixed(client: TestClient) -> None:
    builtin = client.get("/v1/personas/builtin").json()
    created = client.post(
        "/v1/personas/me",
        json={"name": "自作派", "prompt_text": "あなたは自作のテスト人格です。"},
    ).json()
    refs = [
        {"source": "builtin", "id": builtin[0]["id"]},
        {"source": "my", "id": created["id"]},
    ]
    r = client.post(
        "/v1/decisions/request/stream",
        json={"user_input": "夕飯を決めて", "selected_personas": refs},
    )
    assert r.status_code == 200
    assert "event:" in r.text


def test_stream_anonymous_source(client: TestClient) -> None:
    r = client.post(
        "/v1/decisions/request/stream",
        json={"user_input": "夕飯を決めて", "persona_source": "anonymous"},
    )
    assert r.status_code == 200


def test_stream_anonymous_with_drilldown(client: TestClient) -> None:
    r = client.post(
        "/v1/decisions/request/stream",
        json={
            "user_input": "夕飯を決めて",
            "persona_source": "anonymous",
            "chain_context": ["前段提案 A", "前段提案 B"],
        },
    )
    assert r.status_code == 200
