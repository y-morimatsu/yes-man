"""U6 voice ドメインモデル — TTSRequest / TTSResult / STTRequest / STTResult.

NFR Design §2 + Imp3 (Polly Neural × Takumi) 整合.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class TTSRequest:
    text: str
    voice_id: str | None = None  # None → language_code から導出 (_LANG_TO_VOICE)
    language_code: str = "ja-JP"
    sample_rate: int = 22050


@dataclass(frozen=True, slots=True)
class TTSResult:
    audio_url: str
    audio_bytes: bytes | None
    backend_name: str
    duration_seconds: float | None = None


@dataclass(frozen=True, slots=True)
class STTRequest:
    audio_bytes: bytes
    content_type: str
    language_code: str = "ja-JP"


@dataclass(frozen=True, slots=True)
class STTResult:
    text: str
    confidence: float
    backend_name: str


__all__ = ["TTSRequest", "TTSResult", "STTRequest", "STTResult"]
