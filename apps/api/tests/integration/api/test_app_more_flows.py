"""追加 API フロー (全 mock backend) — nudge stages / 多段 No / preferences / prod app build.

engine.apply_choice の no_streak、yes-nudge の stage 別、preferences 更新、scores 履歴、
および prod 構成での create_app (OriginVerify middleware 設置) を外部サービスなしで通す。
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

_DEV_ENV = {
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


@pytest.fixture
def client(monkeypatch):  # noqa: ANN001
    for k, v in _DEV_ENV.items():
        monkeypatch.setenv(k, v)
    from yesman_api.infrastructure.config import reset_config_cache

    reset_config_cache()
    from yesman_api.main import create_app

    with TestClient(create_app()) as c:
        yield c
    reset_config_cache()


def test_multi_no_then_yes_nudge_stages(client: TestClient) -> None:
    # 複数の決定を生成し、No → yes-nudge を stage 別に叩く
    for stage in (1, 3, 5):
        decision = client.post(
            "/v1/decisions/request",
            json={"user_input": f"案 {stage} を決めて", "persona_source": "builtin"},
        ).json()
        did = decision["decision_id"]
        assert client.post(f"/v1/decisions/{did}/choice", json={"choice": "no"}).status_code == 200
        nudge = client.post(f"/v1/decisions/{did}/yes-nudge", json={"stage": stage})
        assert nudge.status_code == 200


def test_score_after_decisions_has_history(client: TestClient) -> None:
    for _ in range(3):
        d = client.post(
            "/v1/decisions/request",
            json={"user_input": "夕飯を決めて", "persona_source": "builtin"},
        ).json()
        client.post(f"/v1/decisions/{d['decision_id']}/choice", json={"choice": "yes"})
    r = client.get("/v1/scores/me")
    assert r.status_code == 200
    body = r.json()
    assert body.get("total", 0) >= 1


def test_preferences_full_update(client: TestClient) -> None:
    r = client.patch(
        "/v1/preferences/me",
        json={
            "accepted_patterns": [{"domain": "daily", "pattern_hash": "h", "weight": 0.8}],
            "rejected_patterns": [{"domain": "work", "pattern_hash": "g", "weight": -0.5}],
            "persona_style_preference": {"慎重派": 0.7, "楽観派": 0.4},
            "inferred_tags": ["即決傾向", "慎重派寄り"],
        },
    )
    assert r.status_code == 200
    got = client.get("/v1/preferences/me")
    assert got.status_code == 200


def test_persona_update_all_fields_and_unshare(client: TestClient) -> None:
    created = client.post(
        "/v1/personas/me",
        json={"name": "更新対象", "prompt_text": "あなたはテスト人格です。"},
    ).json()
    pid = created["id"]
    patched = client.patch(
        f"/v1/personas/{pid}",
        json={"name": "改名", "description": "説明更新", "prompt_text": "更新後の人格指示文です。"},
    )
    assert patched.status_code == 200
    client.patch(f"/v1/personas/{pid}/share", json={"shared": True})
    off = client.patch(f"/v1/personas/{pid}/share", json={"shared": False})
    assert off.status_code == 200


def test_decision_with_legacy_selected_persona_ids(client: TestClient) -> None:
    builtin = client.get("/v1/personas/builtin").json()
    ids = [builtin[0]["id"]]
    r = client.post(
        "/v1/decisions/request",
        json={"user_input": "夕飯を決めて", "selected_persona_ids": ids, "persona_source": "builtin"},
    )
    assert r.status_code == 200


# ============================================================
# prod 構成での create_app (OriginVerify middleware 設置パス)
# ============================================================
def test_prod_app_builds_and_health_ok(monkeypatch) -> None:  # noqa: ANN001
    env = {
        "APP_ENV": "prod",
        "AUTH_BACKEND": "cognito",
        "COGNITO_REGION": "ap-northeast-1",
        "COGNITO_USER_POOL_ID": "ap-northeast-1_x",
        "COGNITO_APP_CLIENT_ID": "client",
        "COGNITO_HOSTED_UI_URL": "https://x.auth.ap-northeast-1.amazoncognito.com",
        "STORAGE_BACKEND": "mock",
        "LLM_PROVIDER": "bedrock",
        "VOICE_BACKEND": "mock",
        "EVENT_BACKEND": "sync",
        "LEARNING_CONSUMER_ENABLED": "false",
        "SILENCE_HASH_SALT": "prod-salt",
        "PERSONA_ANONYMIZER_SALT": "prod-psalt",
        "CORS_ALLOWED_ORIGINS": '["https://app.example.com"]',
        "ORIGIN_VERIFY_SECRET": "origin-secret",
    }
    for k, v in env.items():
        monkeypatch.setenv(k, v)
    from yesman_api.infrastructure.config import reset_config_cache

    reset_config_cache()
    from yesman_api.main import create_app

    with TestClient(create_app()) as c:
        # /health は auth / origin-verify を bypass する
        assert c.get("/health").status_code == 200
    reset_config_cache()
