"""Domain-level constants for persistence layer.

U4 / decision で導入。U2 Alembic migration 0002_builtin_personas で確定済の
SYSTEM_USER_ID を Python コード側でも定数として参照可能にする。

注: Alembic ファイルへの import は不要 (Alembic は SQL を直接実行)。
値の一致 (= 文字列リテラルが同じ) で整合性を確保。
"""
from __future__ import annotations

from typing import Final
from uuid import UUID

SYSTEM_USER_ID: Final[UUID] = UUID("00000000-0000-0000-0000-000000000001")


__all__ = ["SYSTEM_USER_ID"]
