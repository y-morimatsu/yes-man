"""Persona アクセス検証 (module-level、ultrathink NFR Design I2 + Imp3).

Record 内フラグのみで判定 (DB 追加クエリ不要、NFR Req AVAIL-UP-05).
Phase B.5 として A.0b より前に実装 (engine.py の import 順序問題解消).
"""
from __future__ import annotations

from uuid import UUID

from yesman_api.domain.persistence.models import Persona


def can_access(persona: Persona, user_id: UUID) -> bool:
    """Persona へのアクセス検証 (SEC-UP-03).

    True を返す条件 (OR):
    - persona.is_builtin (= 全員アクセス可)
    - persona.owner_user_id == user_id (= 自分の作成)
    - persona.is_shared (= 共有プール公開)

    かつ AND で:
    - not persona.is_blocked (= 管理者 block されていない)
    """
    if persona.is_blocked:
        return False
    return (
        persona.is_builtin
        or persona.owner_user_id == user_id
        or persona.is_shared
    )


__all__ = ["can_access"]
