"""Integration test conftest (cross-unit、U-Test NFR Design §4).

Mock backend で外部依存ゼロ、Docker 不要.
"""
from __future__ import annotations

import os

# env を mock 強制 (yesman_api import 前に必要)
os.environ.update(
    {
        "APP_ENV": "dev",
        "AUTH_BACKEND": "mock",
        "STORAGE_BACKEND": "mock",
        "LLM_PROVIDER": "mock",
        "VOICE_BACKEND": "mock",
        "EVENT_BACKEND": "sync",
        "LEARNING_CONSUMER_ENABLED": "false",
        "SILENCE_HASH_SALT": "integration-salt",
        "PERSONA_ANONYMIZER_SALT": "integration-persona-salt",
    }
)

import pytest_asyncio  # noqa: E402

from yesman_api.infrastructure.config import get_config, reset_config_cache  # noqa: E402
from yesman_api.infrastructure.persistence.factory import RepositoryFactory  # noqa: E402

# 先に他テストで cached される前にここで env を読み直すよう保証
reset_config_cache()


@pytest_asyncio.fixture
async def repo_bundle():
    """Per-test RepositoryBundle (Mock backend で in-memory)."""
    config = get_config()
    factory = RepositoryFactory(config)
    async with factory.bundle() as bundle:
        yield bundle
    await factory.dispose()


@pytest_asyncio.fixture
def test_user_id() -> str:
    """Mock backend の default test user sub."""
    return "11111111-1111-1111-1111-111111111111"
