"""Alembic async migration runner.

DATABASE_URL は環境変数から読込 (config.py の assemble ロジックを再利用)。
本番 (Aurora) では ECS Exec で `alembic upgrade head` を 1 回手動実行する。
"""
from __future__ import annotations

import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

# Ensure src/ is on sys.path so yesman_api imports resolve
import sys
from pathlib import Path

_HERE = Path(__file__).resolve().parent
_SRC = _HERE.parent / "src"
if str(_SRC) not in sys.path:
    sys.path.insert(0, str(_SRC))

from yesman_api.domain.persistence.models import SQLModel  # noqa: E402
from yesman_api.infrastructure.config import get_config  # noqa: E402

# Import all models so they register with SQLModel.metadata
import yesman_api.domain.persistence.models  # noqa: F401, E402

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Use assembled DATABASE_URL (Aurora parts or DATABASE_URL env var)
app_config = get_config()
config.set_main_option("sqlalchemy.url", app_config.assemble_database_url())

target_metadata = SQLModel.metadata


def run_migrations_offline() -> None:
    """Generate SQL for offline review."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    """Async engine + run_sync で migration を実行。"""
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
        future=True,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
