"""PersonaError — U-Persona の共通例外."""
from __future__ import annotations


class PersonaError(Exception):
    """U-Persona 経路で発生する全エラーの共通親クラス.

    Args:
        reason: 短い識別子 (not_found / builtin_immutable / blocked_immutable /
                rejected_by_moderator / invalid_selection_size / duplicate_personas /
                persona_not_accessible / duplicate_report)
        detail: サーバ側ログ用の追加情報
    """

    def __init__(self, reason: str, *, detail: str | None = None) -> None:
        super().__init__(reason)
        self.reason = reason
        self.detail = detail


__all__ = ["PersonaError"]
