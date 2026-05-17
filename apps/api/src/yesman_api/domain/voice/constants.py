"""U6 voice 定数.

- _LANG_TO_VOICE: language_code → Polly voice_id (NFR Req §5.1 + NFR Design §4.1.1)
- _CONTENT_TYPE_TO_MEDIA_FORMAT: content_type → Transcribe MediaFormat allowlist (FD §3.4)
- MAX_TTS_TEXT_LENGTH / MAX_STT_AUDIO_BYTES (NFR Req PERF-U6-02 / PERF-U6-05)
"""
from __future__ import annotations

from typing import Final


# MVP 段階 (NFR Design §4.1.1 で Polly Neural × Takumi 確定)
# Mizuki は Standard 専用、Neural engine では InvalidVoiceId のため Takumi を採用.
_LANG_TO_VOICE: Final[dict[str, str]] = {
    "ja-JP": "Takumi",  # Polly Neural 対応 ja-JP voice、FR-VOICE-03 中性的・断定的
}
# 将来候補:
# _LANG_TO_VOICE["en-US"] = "Joanna"
# _LANG_TO_VOICE["en-GB"] = "Amy"


# Transcribe MediaFormat allowlist (FD §3.4 + ultrathink I2 反映)
# Transcribe は 2023 以降 webm/opus 対応、ブラウザ MediaRecorder default で動作.
_CONTENT_TYPE_TO_MEDIA_FORMAT: Final[dict[str, str]] = {
    "audio/webm": "webm",
    "audio/ogg": "ogg",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/mp4": "mp4",
    "audio/m4a": "mp4",
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/flac": "flac",
}


MAX_TTS_TEXT_LENGTH: Final[int] = 3000          # Polly 1 req 上限 (NFR Req PERF-U6-02)
MAX_STT_AUDIO_BYTES: Final[int] = 5 * 1024 * 1024  # 5 MB (NFR Req PERF-U6-05)


__all__ = [
    "_LANG_TO_VOICE",
    "_CONTENT_TYPE_TO_MEDIA_FORMAT",
    "MAX_TTS_TEXT_LENGTH",
    "MAX_STT_AUDIO_BYTES",
]
