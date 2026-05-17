"""WebSpeechApiAdapter — no-op (client_only_backend、NFR Design §5 + FD §4).

TTS / STT 共に VoiceError("client_only_backend") を raise.
FE はこのレスポンス (409) を見て Web Speech API (browser-native) を直接呼ぶ.
"""
from __future__ import annotations

from yesman_api.domain.voice.errors import VoiceError
from yesman_api.domain.voice.models import STTRequest, STTResult, TTSRequest, TTSResult


class WebSpeechApiAdapter:
    backend_name = "web-speech-api"
    tts_supported = False
    stt_supported = False

    async def synthesize(self, request: TTSRequest) -> TTSResult:
        raise VoiceError("client_only_backend")

    async def transcribe(self, request: STTRequest) -> STTResult:
        raise VoiceError("client_only_backend")


__all__ = ["WebSpeechApiAdapter"]
