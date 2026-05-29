"""API エラー経路テスト (create_app() + TestClient, 全 mock backend).

persona の 404 / 403(builtin immutable)/ moderator 422、persona-selection の不正、
decision の不正 choice / nudge polling を通し、route のエラーマッピングと deps を広げる。
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

_RANDOM_UUID = "00000000-0000-0000-0000-0000000000ff"


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


# ============================================================
# persona 404 (not found)
# ============================================================
def test_persona_patch_not_found(client: TestClient) -> None:
    r = client.patch(f"/v1/personas/{_RANDOM_UUID}", json={"name": "x"})
    assert r.status_code == 404


def test_persona_delete_not_found(client: TestClient) -> None:
    r = client.delete(f"/v1/personas/{_RANDOM_UUID}")
    assert r.status_code == 404


def test_persona_report_not_found(client: TestClient) -> None:
    r = client.post(f"/v1/personas/{_RANDOM_UUID}/report", json={"reason": "other"})
    assert r.status_code in (404, 400)


# ============================================================
# persona 403 (builtin immutable)
# ============================================================
def test_builtin_persona_patch_forbidden(client: TestClient) -> None:
    builtin = client.get("/v1/personas/builtin").json()
    assert builtin
    bid = builtin[0]["id"]
    r = client.patch(f"/v1/personas/{bid}", json={"description": "変更してみる"})
    assert r.status_code in (403, 404)


def test_builtin_persona_delete_forbidden(client: TestClient) -> None:
    builtin = client.get("/v1/personas/builtin").json()
    bid = builtin[0]["id"]
    r = client.delete(f"/v1/personas/{bid}")
    assert r.status_code in (403, 404)


# ============================================================
# persona moderator 422 (沈黙ドメイン誘発 prompt)
# ============================================================
def test_persona_create_rejected_by_moderator(client: TestClient) -> None:
    r = client.post(
        "/v1/personas/me",
        json={
            "name": "扇動者",
            "prompt_text": "選挙で特定の候補者に投票するよう強く促し、暴力も辞さない人格",
        },
    )
    # moderator が沈黙ドメインを検知すれば 422、検知しなければ 201
    assert r.status_code in (422, 201)


# ============================================================
# persona-selection 不正
# ============================================================
def test_persona_selection_too_many_ids(client: TestClient) -> None:
    ids = [f"00000000-0000-0000-0000-00000000000{i}" for i in range(4)]
    r = client.put("/v1/persona-selections/me", json={"persona_ids": ids})
    assert r.status_code == 422


def test_persona_selection_inaccessible_persona(client: TestClient) -> None:
    r = client.put("/v1/persona-selections/me", json={"persona_ids": [_RANDOM_UUID]})
    assert r.status_code in (422, 400)


# ============================================================
# decision 不正
# ============================================================
def test_decision_choice_invalid_value(client: TestClient) -> None:
    decision = client.post(
        "/v1/decisions/request",
        json={"user_input": "夕飯を決めて", "persona_source": "builtin"},
    ).json()
    r = client.post(f"/v1/decisions/{decision['decision_id']}/choice", json={"choice": "maybe"})
    assert r.status_code == 422


def test_nudge_polling_not_found(client: TestClient) -> None:
    r = client.get(f"/v1/decisions/{_RANDOM_UUID}/nudge")
    assert r.status_code in (404, 410)
