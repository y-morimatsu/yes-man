"""MockVoiceAdapter — テスト + dev 用 (FD §5 + ultrathink I4 反映).

silence_1s.mp3 fixture を起動時 1 回読み込み、TTS で固定 mp3 を返却.
STT は SHA-256 prefix を text に埋め込んで識別可能化.
fixture 欠落時は空 bytes で safe (backend_name で判定すること).
"""
from __future__ import annotations

import hashlib
from pathlib import Path

from yesman_api.domain.voice.models import STTRequest, STTResult, TTSRequest, TTSResult


# tests/fixtures/voice/silence_1s.mp3 を src からの相対 path で参照
# src/yesman_api/infrastructure/voice/mock_adapter.py → apps/api/tests/fixtures/voice/...
_FIXTURE_PATH = (
    Path(__file__).resolve().parent.parent.parent.parent.parent
    / "tests"
    / "fixtures"
    / "voice"
    / "silence_1s.mp3"
)


class MockVoiceAdapter:
    backend_name = "mock"
    tts_supported = True
    stt_supported = True

    def __init__(self) -> None:
        try:
            self._silent_mp3 = _FIXTURE_PATH.read_bytes()
        except FileNotFoundError:
            # FD §5 + Code Gen Plan §3.1: 3 段 fail-safe 最終層、空 bytes で例外なし
            self._silent_mp3 = b""

    async def synthesize(self, request: TTSRequest) -> TTSResult:
        return TTSResult(
            audio_url="",
            audio_bytes=self._silent_mp3,
            backend_name="mock",
            duration_seconds=1.0,
        )

    async def transcribe(self, request: STTRequest) -> STTResult:
        h = hashlib.sha256(request.audio_bytes).hexdigest()[:8]
        return STTResult(
            text=f"[mock-stt-{h}]",
            confidence=1.0,
            backend_name="mock",
        )


__all__ = ["MockVoiceAdapter"]
