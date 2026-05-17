"""WebSpeechApiAdapter unit test (2 ケース)."""
from __future__ import annotations

import pytest

from yesman_api.domain.voice.errors import VoiceError
from yesman_api.domain.voice.models import STTRequest, TTSRequest
from yesman_api.infrastructure.voice.web_speech_api_adapter import WebSpeechApiAdapter


async def test_synthesize_raises_client_only_backend():
    adapter = WebSpeechApiAdapter()
    with pytest.raises(VoiceError) as exc:
        await adapter.synthesize(TTSRequest(text="テスト"))
    assert exc.value.reason == "client_only_backend"


async def test_transcribe_raises_client_only_backend():
    adapter = WebSpeechApiAdapter()
    with pytest.raises(VoiceError) as exc:
        await adapter.transcribe(
            STTRequest(audio_bytes=b"x", content_type="audio/webm")
        )
    assert exc.value.reason == "client_only_backend"


def test_supported_flags():
    adapter = WebSpeechApiAdapter()
    assert adapter.tts_supported is False
    assert adapter.stt_supported is False
    assert adapter.backend_name == "web-speech-api"
