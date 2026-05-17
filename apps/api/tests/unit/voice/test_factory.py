"""VoiceProviderFactory unit test (3 backend 判別)."""
from __future__ import annotations

import pytest

from yesman_api.infrastructure.config import AppConfig
from yesman_api.infrastructure.voice.factory import VoiceProviderFactory
from yesman_api.infrastructure.voice.mock_adapter import MockVoiceAdapter
from yesman_api.infrastructure.voice.web_speech_api_adapter import WebSpeechApiAdapter


def _config(voice_backend: str) -> AppConfig:
    return AppConfig(
        voice_backend=voice_backend,
        voice_s3_bucket="test-bucket",  # aws 時必要
    )


async def test_factory_creates_mock_adapter():
    factory = VoiceProviderFactory(_config("mock"))
    adapter = await factory.create()
    assert isinstance(adapter, MockVoiceAdapter)
    await factory.dispose()


async def test_factory_creates_web_speech_api_adapter():
    factory = VoiceProviderFactory(_config("web-speech-api"))
    adapter = await factory.create()
    assert isinstance(adapter, WebSpeechApiAdapter)
    await factory.dispose()


async def test_factory_creates_aws_adapter():
    factory = VoiceProviderFactory(_config("aws"))
    adapter = await factory.create()
    # PollyTranscribeAdapter は aioboto3 import を要するため、attribute 検査で代替
    assert adapter.backend_name == "aws"
    assert adapter.tts_supported is True
    assert adapter.stt_supported is True
    await factory.dispose()


async def test_factory_unknown_backend_raises():
    """AppConfig は Pydantic Literal で 3 値のみ許可、それ以外は ValidationError.

    factory.create 内の ValueError は防御的、Pydantic layer で先に失敗する.
    ここでは monkey patch 経由で防御 path を確認.
    """
    config = _config("mock")
    config.voice_backend = "invalid"  # type: ignore[assignment]  # 防御 path テスト
    factory = VoiceProviderFactory(config)
    with pytest.raises(ValueError):
        await factory.create()
