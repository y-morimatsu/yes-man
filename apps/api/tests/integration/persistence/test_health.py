"""DatabaseHealth integration test — Docker PostgreSQL での SELECT 1 動作確認."""
from __future__ import annotations

import pytest

from yesman_api.infrastructure.persistence.factory import RepositoryFactory

pytestmark = pytest.mark.integration


async def test_pg_database_health_ping(pg_factory: RepositoryFactory):
    async with pg_factory.bundle() as bundle:
        assert await bundle.health.ping() is True
