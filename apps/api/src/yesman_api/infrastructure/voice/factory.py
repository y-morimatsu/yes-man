"""VoiceProviderFactory — 3 backend 切替 (FD §2 / NFR Design §7.1).

他の 3 factory (Auth / LLM / EventPublisher) と一貫した memoize パターン:
- create() は singleton adapter を返す
- dispose() で aclose 呼び出し + cache クリア
"""
from __future__ import annotations

from yesman_api.application.voice.protocols import VoiceProviderAdapter
from yesman_api.infrastructure.config import AppConfig


class VoiceProviderFactory:
    def __init__(self, config: AppConfig) -> None:
        self._config = config
        self._adapter: VoiceProviderAdapter | None = None

    async def create(self) -> VoiceProviderAdapter:
        if self._adapter is not None:
            return self._adapter
        backend = self._config.voice_backend
        if backend == "aws":
            from yesman_api.infrastructure.voice.aws_adapter import PollyTranscribeAdapter

            self._adapter = PollyTranscribeAdapter(
                polly_region=self._config.polly_region,
                transcribe_region=self._config.transcribe_region,
                voice_id=self._config.polly_voice_id,
                engine=self._config.polly_engine,
                bucket=self._config.voice_s3_bucket,
                presigned_ttl=self._config.voice_tts_presigned_ttl_seconds,
            )
        elif backend == "web-speech-api":
            from yesman_api.infrastructure.voice.web_speech_api_adapter import (
                WebSpeechApiAdapter,
            )

            self._adapter = WebSpeechApiAdapter()
        elif backend == "mock":
            from yesman_api.infrastructure.voice.mock_adapter import MockVoiceAdapter

            self._adapter = MockVoiceAdapter()
        else:
            raise ValueError(f"unknown voice_backend={backend!r}")
        return self._adapter

    async def dispose(self) -> None:
        if self._adapter is None:
            return
        # adapter に aclose が定義されていれば呼ぶ (Protocol 必須ではないため getattr 経由)
        aclose = getattr(self._adapter, "aclose", None)
        if aclose is not None:
            await aclose()
        self._adapter = None


__all__ = ["VoiceProviderFactory"]
