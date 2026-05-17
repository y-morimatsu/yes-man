"""Shared pytest fixtures for unit / integration / contract / property tests.

Backends:
- MOCK: in-memory MockStore (default for unit + contract + property)
- PostgreSQL: requires DATABASE_URL env var pointing at Docker PostgreSQL
   (only used for integration tests, marked with @pytest.mark.integration)
"""
from __future__ import annotations

import os
import uuid
from datetime import datetime, timezone
from typing import AsyncIterator

import pytest
import pytest_asyncio

from yesman_api.application.persistence.protocols import DatabaseHealth
from yesman_api.domain.persistence.models import Persona, Profile, SQLModel
from yesman_api.infrastructure.config import AppConfig
from yesman_api.infrastructure.persistence.engine import (
    make_engine,
    make_session_factory,
)
from yesman_api.infrastructure.persistence.factory import (
    RepositoryBundle,
    RepositoryFactory,
)
from yesman_api.infrastructure.persistence.mock_repositories import (
    MockDatabaseHealth,
    MockDecisionRepository,
    MockPersonaReportRepository,
    MockPersonaRepository,
    MockPreferenceProfileRepository,
    MockProfileRepository,
    MockSilenceLogRepository,
    MockStore,
    MockUserPersonaSelectionRepository,
)
from yesman_api.infrastructure.persistence.sqlmodel_repositories import (
    SqlModelDatabaseHealth,
    SqlModelDecisionRepository,
    SqlModelPersonaReportRepository,
    SqlModelPersonaRepository,
    SqlModelPreferenceProfileRepository,
    SqlModelProfileRepository,
    SqlModelSilenceLogRepository,
    SqlModelUserPersonaSelectionRepository,
)


# ============================================================
# MOCK fixtures
# ============================================================
@pytest.fixture
def mock_store() -> MockStore:
    return MockStore()


@pytest.fixture
def mock_bundle(mock_store: MockStore) -> RepositoryBundle:
    return RepositoryBundle(
        profile=MockProfileRepository(mock_store),
        decision=MockDecisionRepository(mock_store),
        preference=MockPreferenceProfileRepository(mock_store),
        silence=MockSilenceLogRepository(mock_store),
        persona=MockPersonaRepository(mock_store),
        persona_report=MockPersonaReportRepository(mock_store),
        user_persona_selection=MockUserPersonaSelectionRepository(mock_store),
        health=MockDatabaseHealth(),
    )


# ============================================================
# Sample data fixtures
# ============================================================
@pytest.fixture
def sample_user_id() -> uuid.UUID:
    return uuid.uuid4()


@pytest.fixture
def sample_profile(sample_user_id: uuid.UUID) -> Profile:
    return Profile(
        user_id=sample_user_id,
        email=f"{sample_user_id}@example.com",
        age_group="20s",
        occupation="engineer",
        value_tags=["growth", "stability"],
        life_stage="working",
    )


@pytest.fixture
def sample_profile_full(sample_user_id: uuid.UUID) -> Profile:
    """U3 で追加された gender + preferences を non-empty 値で持つ Profile fixture (Integration テスト用)."""
    return Profile(
        user_id=sample_user_id,
        email=f"{sample_user_id}@example.com",
        age_group="30s",
        gender=["female"],
        occupation="engineer",
        value_tags=["growth", "stability"],
        preferences={"theme": "dark", "lang": "ja"},
        life_stage="working",
    )


@pytest.fixture
def sample_persona(sample_user_id: uuid.UUID) -> Persona:
    return Persona(
        id=uuid.uuid4(),
        owner_user_id=sample_user_id,
        name="テスト派",
        description="test persona",
        prompt_text="You are a test persona.",
        is_shared=False,
        is_builtin=False,
    )


# ============================================================
# Integration: PostgreSQL session fixtures
# ============================================================
def _pg_url() -> str | None:
    """Return PostgreSQL URL if available, else None (skip integration tests)."""
    url = os.environ.get("YESMAN_TEST_DATABASE_URL") or os.environ.get(
        "DATABASE_URL_TEST"
    )
    if url and url.startswith("postgresql"):
        return url
    return None


@pytest_asyncio.fixture
async def pg_factory() -> AsyncIterator[RepositoryFactory]:
    """RepositoryFactory backed by Docker PostgreSQL — skip if URL not set."""
    url = _pg_url()
    if url is None:
        pytest.skip("YESMAN_TEST_DATABASE_URL not set; integration test skipped")

    config = AppConfig(
        storage_backend="docker-postgres",
        database_url=url,
    )
    factory = RepositoryFactory(config)
    # create_all (alembic-equivalent for tests)
    engine = make_engine(url)
    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)
    await engine.dispose()

    try:
        yield factory
    finally:
        # Drop after test for isolation
        engine2 = make_engine(url)
        async with engine2.begin() as conn:
            await conn.run_sync(SQLModel.metadata.drop_all)
        await engine2.dispose()
        await factory.dispose()


@pytest_asyncio.fixture
async def pg_bundle(
    pg_factory: RepositoryFactory,
) -> AsyncIterator[RepositoryBundle]:
    async with pg_factory.bundle() as bundle:
        yield bundle


__all__ = [
    "mock_store",
    "mock_bundle",
    "sample_user_id",
    "sample_profile",
    "sample_profile_full",
    "sample_persona",
    "pg_factory",
    "pg_bundle",
]
