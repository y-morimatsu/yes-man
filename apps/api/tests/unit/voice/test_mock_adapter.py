"""MockVoiceAdapter unit test (5 ケース)."""
from __future__ import annotations

import pytest

from yesman_api.domain.voice.models import STTRequest, TTSRequest
from yesman_api.infrastructure.voice.mock_adapter import MockVoiceAdapter


@pytest.fixture
def adapter() -> MockVoiceAdapter:
    return MockVoiceAdapter()


async def test_synthesize_returns_silent_mp3(adapter):
    result = await adapter.synthesize(TTSRequest(text="テスト"))
    assert result.backend_name == "mock"
    assert result.duration_seconds == 1.0
    # silence_1s.mp3 fixture が読み込めれば bytes > 0、欠落でも空 bytes で OK
    assert result.audio_bytes is not None


async def test_transcribe_returns_mock_prefix(adapter):
    result = await adapter.transcribe(
        STTRequest(audio_bytes=b"fake-audio", content_type="audio/webm")
    )
    assert result.backend_name == "mock"
    assert result.text.startswith("[mock-stt-")
    assert result.confidence == 1.0


async def test_transcribe_same_audio_same_text(adapter):
    audio = b"identical-audio"
    r1 = await adapter.transcribe(STTRequest(audio_bytes=audio, content_type="audio/webm"))
    r2 = await adapter.transcribe(STTRequest(audio_bytes=audio, content_type="audio/webm"))
    assert r1.text == r2.text


async def test_transcribe_different_audio_different_text(adapter):
    r1 = await adapter.transcribe(STTRequest(audio_bytes=b"audio-A", content_type="audio/webm"))
    r2 = await adapter.transcribe(STTRequest(audio_bytes=b"audio-B", content_type="audio/webm"))
    assert r1.text != r2.text


async def test_backend_name_and_supported_flags(adapter):
    assert adapter.backend_name == "mock"
    assert adapter.tts_supported is True
    assert adapter.stt_supported is True
