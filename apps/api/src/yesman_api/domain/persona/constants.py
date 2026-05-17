"""U-Persona 定数 (EXT-UP-01 推奨セット定義場所).

MVP では builtin 推奨セットは SYSTEM_USER_ID 経由で動的取得 (PersonaCatalogService.list_builtin_personas).
将来固定 ID で推奨セットを差替えたい場合は本ファイルで定義する.
"""
from __future__ import annotations

from typing import Final


# 1 ユーザーの選択 persona 上限 (FR-PERSONA-10)
MAX_SELECTION: Final[int] = 3


__all__ = ["MAX_SELECTION"]
