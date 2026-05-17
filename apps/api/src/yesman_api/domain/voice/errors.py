"""VoiceError — U6 voice の共通例外 (PersonaError パターン踏襲)."""
from __future__ import annotations


class VoiceError(Exception):
    """U6 voice 経路で発生する全エラーの共通親クラス.

    Args:
        reason: 短い識別子 (client_only_backend / tts_throttled / tts_failed /
                tts_text_too_long / stt_timeout / stt_failed / storage_failed /
                unsupported_audio_format / unsupported_language / audio_too_large)
        detail: サーバ側ログ用の追加情報
    """

    def __init__(self, reason: str, *, detail: str | None = None) -> None:
        super().__init__(reason)
        self.reason = reason
        self.detail = detail


__all__ = ["VoiceError"]
