"""Persona owner 匿名化 (NFR-PRIV-06、ultrathink FD Imp1+Imp3 反映).

module-level 関数として独立 (PersonaCatalogService 内部実装ではなく公開 API).
頭 16 文字 (64-bit エントロピー) で collision 安全マージン確保.
"""
from __future__ import annotations

import hashlib
from uuid import UUID


def anonymize_owner(owner_user_id: UUID, salt: str) -> str:
    """owner_user_id を salt 付きで sha256 hash、頭 16 文字を匿名 ID とする.

    Args:
        owner_user_id: Persona.owner_user_id (= Cognito sub)
        salt: PERSONA_ANONYMIZER_SALT 環境変数値 (prod は Secrets Manager 経由)

    Returns:
        "yesman-<16-char-hex>" 形式の匿名 ID
    """
    h = hashlib.sha256((salt + str(owner_user_id)).encode("utf-8")).hexdigest()
    return f"yesman-{h[:16]}"


__all__ = ["anonymize_owner"]
