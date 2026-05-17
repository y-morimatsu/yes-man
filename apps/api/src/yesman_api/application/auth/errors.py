"""AuthError — JWT 検証失敗の共通例外。

middleware が 401 にマップする際に `reason` フィールドで識別:
- missing / malformed / expired / invalid_signature / issuer_mismatch / audience_mismatch
- unknown_kid / token_use_unsupported / algorithm_mismatch / jwks_unavailable
- missing_email / userinfo_unavailable (CognitoAuthAdapter で発生、email lazy 取得失敗)
"""
from __future__ import annotations


class AuthError(Exception):
    """JWT 検証経路で発生する全エラーの共通親クラス。

    Args:
        reason: 短い識別子 (= 401 レスポンスの `reason` フィールドに入る)
        detail: 任意の追加情報 (= サーバ側ログ用、クライアントには出さない方が安全)
    """

    def __init__(self, reason: str, *, detail: str | None = None) -> None:
        super().__init__(reason)
        self.reason = reason
        self.detail = detail


__all__ = ["AuthError"]
