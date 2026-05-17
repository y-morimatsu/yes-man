"""VoiceProviderAdapter Protocol — U6 Strategy 抽象 (NFR Design §3)."""
from __future__ import annotations

from typing import Protocol

from yesman_api.domain.voice.models import STTRequest, STTResult, TTSRequest, TTSResult


class VoiceProviderAdapter(Protocol):
    backend_name: str         # "aws" | "web-speech-api" | "mock"
    tts_supported: bool
    stt_supported: bool

    async def synthesize(self, request: TTSRequest) -> TTSResult: ...
    async def transcribe(self, request: STTRequest) -> STTResult: ...


__all__ = ["VoiceProviderAdapter"]
