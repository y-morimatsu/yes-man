"""DecisionError — U4 / decision の共通例外.

reason フィールドで識別、middleware / handler が HTTPException にマップする際の根拠.
"""
from __future__ import annotations


class DecisionError(Exception):
    """合議処理経路で発生する全エラーの共通親クラス.

    Args:
        reason: 短い識別子 (= API レスポンスの `reason` フィールド)
        detail: サーバ側ログ用の追加情報 (クライアントには出さない方が安全)
    """

    def __init__(self, reason: str, *, detail: str | None = None) -> None:
        super().__init__(reason)
        self.reason = reason
        self.detail = detail


__all__ = ["DecisionError"]
