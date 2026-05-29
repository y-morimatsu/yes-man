"""Unit tests for AppConfig.validate_runtime / assemble_database_url / get_config.

外部呼び出しなし。条件付き必須バリデーションの各分岐を、prod 有効構成をベースに
1 条件ずつ違反させて網羅する。
"""
from __future__ import annotations

import pytest

from yesman_api.infrastructure import config as config_mod
from yesman_api.infrastructure.config import AppConfig, get_config, reset_config_cache


def _prod_base(**overrides) -> dict:  # noqa: ANN003
    base = dict(
        app_env="prod",
        auth_backend="cognito",
        cognito_region="ap-northeast-1",
        cognito_user_pool_id="ap-northeast-1_x",
        cognito_app_client_id="client",
        cognito_hosted_ui_url="https://x.auth.ap-northeast-1.amazoncognito.com",
        cors_allowed_origins=["https://app.example.com"],
        llm_provider="bedrock",
        silence_hash_salt="salt",
        event_backend="sync",
        persona_anonymizer_salt="psalt",
        voice_backend="mock",
    )
    base.update(overrides)
    return base


def test_valid_prod_config_does_not_raise() -> None:
    AppConfig(**_prod_base()).validate_runtime()  # no raise


def test_valid_dev_mock_config_does_not_raise() -> None:
    AppConfig(app_env="dev", auth_backend="mock", llm_provider="mock").validate_runtime()


@pytest.mark.parametrize(
    ("overrides", "match"),
    [
        ({"auth_backend": "mock"}, "AUTH_BACKEND=mock"),
        ({"cognito_user_pool_id": ""}, "AUTH_BACKEND=cognito requires"),
        ({"cognito_hosted_ui_url": "http://insecure"}, "must use https"),
        (
            {"auth_backend": "cognito-local", "cognito_local_issuer_url": ""},
            "COGNITO_LOCAL_ISSUER_URL",
        ),
        (
            {
                "auth_backend": "cognito-local",
                "cognito_local_issuer_url": "http://localhost:9229/x",
                "cognito_app_client_id": "",
            },
            "COGNITO_APP_CLIENT_ID",
        ),
        ({"cors_allowed_origins": []}, "CORS_ALLOWED_ORIGINS"),
        ({"llm_provider": "mock"}, "LLM_PROVIDER=mock"),
        ({"silence_hash_salt": ""}, "SILENCE_HASH_SALT"),
        ({"event_backend": "eventbridge", "event_bus_name": ""}, "EVENT_BUS_NAME"),
        (
            {
                "event_backend": "eventbridge",
                "event_bus_name": "bus",
                "learning_consumer_enabled": True,
                "decision_events_queue_url": "",
            },
            "DECISION_EVENTS_QUEUE_URL",
        ),
        ({"persona_anonymizer_salt": ""}, "PERSONA_ANONYMIZER_SALT"),
        ({"persona_report_auto_block_threshold": 0}, "AUTO_BLOCK_THRESHOLD"),
        ({"voice_backend": "aws", "voice_s3_bucket": ""}, "VOICE_S3_BUCKET"),
        (
            {
                "voice_backend": "aws",
                "voice_s3_bucket": "bucket",
                "voice_tts_presigned_ttl_seconds": 4000,
            },
            "PRESIGNED_TTL",
        ),
    ],
)
def test_validate_runtime_failures(overrides: dict, match: str) -> None:
    cfg = AppConfig(**_prod_base(**overrides))
    with pytest.raises(RuntimeError, match=match):
        cfg.validate_runtime()


def test_assemble_database_url_aurora() -> None:
    cfg = AppConfig(
        storage_backend="aurora",
        aurora_host="db.example.com",
        database_username="user",
        database_password="p@ss/word",
        aurora_dbname="yesman",
    )
    url = cfg.assemble_database_url()
    assert url.startswith("postgresql+asyncpg://user:")
    assert "db.example.com" in url and "yesman" in url
    # password は URL エンコードされる
    assert "p%40ss" in url


def test_assemble_database_url_non_aurora_returns_database_url() -> None:
    cfg = AppConfig(storage_backend="mock", database_url="sqlite://x")
    assert cfg.assemble_database_url() == "sqlite://x"


def test_get_config_singleton_and_reset() -> None:
    reset_config_cache()
    try:
        c1 = get_config()
        c2 = get_config()
        assert c1 is c2
        reset_config_cache()
        assert config_mod._config is None
        c3 = get_config()
        assert c3 is not c1
    finally:
        reset_config_cache()
