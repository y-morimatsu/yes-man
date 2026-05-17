"""Voice API DTO (U6 FR-VOICE-01〜04).

NFR Design §8 + FD §6.2.
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


# ============================================================
# Response
# ============================================================
class VoiceConfigResponse(BaseModel):
    backend: Literal["aws", "web-speech-api", "mock"]
    tts_supported: bool
    stt_supported: bool


class TTSResponseDTO(BaseModel):
    audio_url: str
    backend: str
    duration_seconds: float | None = None


class STTResponseDTO(BaseModel):
    text: str
    confidence: float
    backend: str


# ============================================================
# Request
# ============================================================
class TTSRequestDTO(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str = Field(min_length=1, max_length=3000)  # NFR Req PERF-U6-02
    voice_id: str | None = None
    language_code: str = "ja-JP"


__all__ = [
    "VoiceConfigResponse",
    "TTSResponseDTO",
    "STTResponseDTO",
    "TTSRequestDTO",
]
