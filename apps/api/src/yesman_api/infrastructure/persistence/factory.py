"""RepositoryFactory — backend swap entry point (FR-AI-01..03 / FR-HIST-04).

選択ロジック:
- storage_backend == "aurora" / "docker-postgres" → SqlModel* (AsyncSession を session_factory から作成)
- storage_backend == "mock" → Mock* (in-memory MockStore 共有)

各 request scope で `with factory.session() as session:` パターンで使う (interface/deps.py)。
"""
from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from yesman_api.application.persistence.protocols import (
    DatabaseHealth,
    DecisionRepository,
    PersonaReportRepository,
    PersonaRepository,
    PreferenceProfileRepository,
    ProfileRepository,
    SilenceLogRepository,
    UserPersonaSelectionRepository,
)
from yesman_api.infrastructure.config import AppConfig
from yesman_api.infrastructure.persistence.engine import (
    make_engine,
    make_session_factory,
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


class RepositoryBundle:
    """Per-request collection of repositories + health, bound to one session (or shared MockStore)."""

    def __init__(
        self,
        profile: ProfileRepository,
        decision: DecisionRepository,
        preference: PreferenceProfileRepository,
        silence: SilenceLogRepository,
        persona: PersonaRepository,
        persona_report: PersonaReportRepository,
        user_persona_selection: UserPersonaSelectionRepository,
        health: DatabaseHealth,
    ) -> None:
        self.profile = profile
        self.decision = decision
        self.preference = preference
        self.silence = silence
        self.persona = persona
        self.persona_report = persona_report
        self.user_persona_selection = user_persona_selection
        self.health = health


class RepositoryFactory:
    """Factory creating RepositoryBundle per request (SqlModel) or shared (Mock)."""

    def __init__(self, config: AppConfig) -> None:
        self._config = config
        self._engine: AsyncEngine | None = None
        self._session_factory: async_sessionmaker[AsyncSession] | None = None
        self._mock_store: MockStore | None = None

        if config.storage_backend in ("aurora", "docker-postgres"):
            self._engine = make_engine(config.assemble_database_url())
            self._session_factory = make_session_factory(self._engine)
        else:
            # Production Mock backend: builtin personas を alembic 0002 と等価で seed
            # (DecisionEngine の SYSTEM_USER_ID fallback path を機能させる)
            # 2026-05-27: AWS Lambda multi-instance 対応で S3 永続化を有効化
            # (env 未設定なら in-memory のまま動作).
            self._mock_store = MockStore(
                seed_builtin=True,
                s3_bucket=config.mock_store_s3_bucket,
                s3_key=config.mock_store_s3_key,
            )

    @asynccontextmanager
    async def bundle(self) -> AsyncIterator[RepositoryBundle]:
        """Yield a RepositoryBundle scoped to one session (SqlModel) or shared MockStore."""
        if self._session_factory is not None:
            async with self._session_factory() as session:
                try:
                    yield RepositoryBundle(
                        profile=SqlModelProfileRepository(session),
                        decision=SqlModelDecisionRepository(session),
                        preference=SqlModelPreferenceProfileRepository(session),
                        silence=SqlModelSilenceLogRepository(session),
                        persona=SqlModelPersonaRepository(session),
                        persona_report=SqlModelPersonaReportRepository(session),
                        user_persona_selection=SqlModelUserPersonaSelectionRepository(
                            session
                        ),
                        health=SqlModelDatabaseHealth(session),
                    )
                    await session.commit()
                except Exception:
                    await session.rollback()
                    raise
        else:
            assert self._mock_store is not None
            store = self._mock_store
            # 2026-05-27 fix: AWS Lambda multi-instance による mock storage 分断回避.
            # bundle 開始時に S3 から最新 state を load、終了時に save. 単一 instance
            # 環境 (local dev / unit test) では mock_store_s3_bucket 未設定で no-op.
            store.load_from_s3()
            try:
                yield RepositoryBundle(
                    profile=MockProfileRepository(store),
                    decision=MockDecisionRepository(store),
                    preference=MockPreferenceProfileRepository(store),
                    silence=MockSilenceLogRepository(store),
                    persona=MockPersonaRepository(store),
                    persona_report=MockPersonaReportRepository(store),
                    user_persona_selection=MockUserPersonaSelectionRepository(store),
                    health=MockDatabaseHealth(),
                )
            finally:
                store.save_to_s3()

    async def dispose(self) -> None:
        """Dispose engine on shutdown."""
        if self._engine is not None:
            await self._engine.dispose()

    @property
    def mock_store(self) -> MockStore | None:
        """For test fixtures: access MockStore directly to seed data."""
        return self._mock_store


__all__ = ["RepositoryFactory", "RepositoryBundle"]
