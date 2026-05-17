"""SQLAlchemy AsyncEngine factory + session_factory (NFR Design §1.1).

Pool 設定 (Aurora ECS task ベース):
- pool_size=5, max_overflow=15 → 1 task あたり最大 20 connection
- pool_timeout=10s, pool_pre_ping=True (stale connection 自動破棄)
- pool_recycle=3600s (1h で再接続、Aurora idle timeout 対策)
- connect_args.timeout=5s (asyncpg connection timeout)

mock / sqlite モードでは pool 関連引数を渡さない (StaticPool default を使う)。
"""
from __future__ import annotations

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)


def make_engine(database_url: str) -> AsyncEngine:
    """Create AsyncEngine with appropriate pool config based on driver."""
    if database_url.startswith("sqlite"):
        # In-memory / test 用、pool 設定不要
        return create_async_engine(database_url, echo=False, future=True)

    # PostgreSQL (asyncpg) — Aurora / Docker 共通
    return create_async_engine(
        database_url,
        echo=False,
        future=True,
        pool_size=5,
        max_overflow=15,
        pool_timeout=10.0,
        pool_pre_ping=True,
        pool_recycle=3600,
        connect_args={
            "timeout": 5.0,
            "server_settings": {
                "application_name": "yesman-api",
            },
        },
    )


def make_session_factory(engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    """Create sessionmaker bound to the engine. expire_on_commit=False for async safety."""
    return async_sessionmaker(
        bind=engine,
        expire_on_commit=False,
        class_=AsyncSession,
    )


__all__ = ["make_engine", "make_session_factory"]
