"""Unit tests for PollyTranscribeAdapter (infrastructure/voice/aws_adapter.py).

aioboto3 未インストール環境でも動くよう、sys.modules に fake aioboto3 を注入してから
adapter を import し、adapter._session を fake session に差し替えて Polly/Transcribe/S3 を
一切呼ばずに synthesize / transcribe / poll / 各エラー分岐を網羅する。
"""
from __future__ import annotations

import json
import sys
import types
from unittest.mock import AsyncMock

import pytest

from yesman_api.domain.voice.errors import VoiceError
from yesman_api.domain.voice.models import STTRequest, TTSRequest


@pytest.fixture
def adapter_cls(monkeypatch):  # noqa: ANN001
    try:
        import aioboto3  # noqa: F401
    except ImportError:
        fake = types.ModuleType("aioboto3")

        class _Session:  # placeholder。実際の session は adapter._session 差し替えで制御
            def __init__(self, *a, **k) -> None:  # noqa: ANN002, ANN003
                pass

        fake.Session = _Session
        monkeypatch.setitem(sys.modules, "aioboto3", fake)
    import importlib

    mod = importlib.import_module("yesman_api.infrastructure.voice.aws_adapter")
    return mod.PollyTranscribeAdapter


# ============================================================
# fake aioboto3 client primitives
# ============================================================
class _AsyncReader:
    def __init__(self, data: bytes) -> None:
        self._data = data

    async def read(self) -> bytes:
        return self._data


class _ClientCtx:
    def __init__(self, client) -> None:  # noqa: ANN001
        self._client = client

    async def __aenter__(self):  # noqa: ANN204
        return self._client

    async def __aexit__(self, *exc) -> bool:  # noqa: ANN002
        return False


class _FakeSession:
    def __init__(self, clients: dict) -> None:
        self._clients = clients

    def client(self, name: str, **kwargs):  # noqa: ANN003, ANN201
        return _ClientCtx(self._clients[name])


def _make_adapter(adapter_cls, clients: dict):  # noqa: ANN001, ANN201
    adapter = adapter_cls(
        polly_region="ap-northeast-1",
        transcribe_region="ap-northeast-1",
        voice_id="Takumi",
        engine="neural",
        bucket="voice-bucket",
        presigned_ttl=3600,
        poll_intervals=[0.0],
        stt_total_timeout_seconds=5.0,
    )
    adapter._session = _FakeSession(clients)
    return adapter


def _polly(ok: bool = True, exc: BaseException | None = None):  # noqa: ANN201
    polly = types.SimpleNamespace()
    if exc is not None:
        polly.synthesize_speech = AsyncMock(side_effect=exc)
    else:
        polly.synthesize_speech = AsyncMock(
            return_value={"AudioStream": _AsyncReader(b"mp3-bytes")}
        )
    return polly


def _s3(*, get_body: bytes | None = None, put_exc: BaseException | None = None):  # noqa: ANN201
    s3 = types.SimpleNamespace()
    s3.put_object = AsyncMock(side_effect=put_exc)
    s3.generate_presigned_url = AsyncMock(return_value="https://signed.example/audio.mp3")
    s3.get_object = AsyncMock(return_value={"Body": _AsyncReader(get_body or b"{}")})
    s3.delete_object = AsyncMock()
    return s3


def _transcribe(status: str = "COMPLETED"):  # noqa: ANN201
    tr = types.SimpleNamespace()
    tr.start_transcription_job = AsyncMock()
    tr.get_transcription_job = AsyncMock(
        return_value={"TranscriptionJob": {"TranscriptionJobStatus": status, "FailureReason": "x"}}
    )
    return tr


_OK_TRANSCRIPT = json.dumps(
    {
        "results": {
            "transcripts": [{"transcript": "音声認識の結果です"}],
            "items": [{"alternatives": [{"confidence": "0.95"}]}],
        }
    }
).encode("utf-8")


# ============================================================
# synthesize (TTS)
# ============================================================
async def test_synthesize_success(adapter_cls) -> None:  # noqa: ANN001
    s3 = _s3()
    adapter = _make_adapter(adapter_cls, {"polly": _polly(), "s3": s3})
    result = await adapter.synthesize(TTSRequest(text="こんにちは"))
    assert result.audio_url == "https://signed.example/audio.mp3"
    assert result.backend_name == "aws-polly"
    s3.put_object.assert_awaited_once()


async def test_synthesize_unsupported_language(adapter_cls) -> None:  # noqa: ANN001
    adapter = _make_adapter(adapter_cls, {})
    with pytest.raises(VoiceError) as ei:
        await adapter.synthesize(TTSRequest(text="x", voice_id=None, language_code="xx-XX"))
    assert ei.value.reason == "unsupported_language"


async def test_synthesize_throttling(adapter_cls) -> None:  # noqa: ANN001
    class ThrottlingException(Exception):
        pass

    adapter = _make_adapter(adapter_cls, {"polly": _polly(exc=ThrottlingException("slow down"))})
    with pytest.raises(VoiceError) as ei:
        await adapter.synthesize(TTSRequest(text="x"))
    assert ei.value.reason == "tts_throttled"


async def test_synthesize_generic_failure(adapter_cls) -> None:  # noqa: ANN001
    adapter = _make_adapter(adapter_cls, {"polly": _polly(exc=ValueError("boom"))})
    with pytest.raises(VoiceError) as ei:
        await adapter.synthesize(TTSRequest(text="x"))
    assert ei.value.reason == "tts_failed"


async def test_synthesize_s3_failure(adapter_cls) -> None:  # noqa: ANN001
    adapter = _make_adapter(
        adapter_cls, {"polly": _polly(), "s3": _s3(put_exc=RuntimeError("s3 down"))}
    )
    with pytest.raises(VoiceError) as ei:
        await adapter.synthesize(TTSRequest(text="x"))
    assert ei.value.reason == "storage_failed"


# ============================================================
# transcribe (STT)
# ============================================================
async def test_transcribe_success(adapter_cls) -> None:  # noqa: ANN001
    s3 = _s3(get_body=_OK_TRANSCRIPT)
    adapter = _make_adapter(
        adapter_cls, {"s3": s3, "transcribe": _transcribe("COMPLETED")}
    )
    result = await adapter.transcribe(
        STTRequest(audio_bytes=b"audio", content_type="audio/webm")
    )
    assert result.text == "音声認識の結果です"
    assert result.confidence == pytest.approx(0.95)
    assert result.backend_name == "aws-transcribe"
    # input + output の delete が呼ばれる
    assert s3.delete_object.await_count >= 2


async def test_transcribe_unsupported_format(adapter_cls) -> None:  # noqa: ANN001
    adapter = _make_adapter(adapter_cls, {})
    with pytest.raises(VoiceError) as ei:
        await adapter.transcribe(STTRequest(audio_bytes=b"x", content_type="audio/aiff"))
    assert ei.value.reason == "unsupported_audio_format"


async def test_transcribe_unsupported_language(adapter_cls) -> None:  # noqa: ANN001
    adapter = _make_adapter(adapter_cls, {})
    with pytest.raises(VoiceError) as ei:
        await adapter.transcribe(
            STTRequest(audio_bytes=b"x", content_type="audio/webm", language_code="xx-XX")
        )
    assert ei.value.reason == "unsupported_language"


async def test_transcribe_job_failed(adapter_cls) -> None:  # noqa: ANN001
    adapter = _make_adapter(
        adapter_cls, {"s3": _s3(get_body=_OK_TRANSCRIPT), "transcribe": _transcribe("FAILED")}
    )
    with pytest.raises(VoiceError) as ei:
        await adapter.transcribe(STTRequest(audio_bytes=b"x", content_type="audio/webm"))
    assert ei.value.reason == "stt_failed"


async def test_transcribe_poll_exhaustion_times_out(adapter_cls) -> None:  # noqa: ANN001
    adapter = _make_adapter(
        adapter_cls, {"s3": _s3(get_body=_OK_TRANSCRIPT), "transcribe": _transcribe("IN_PROGRESS")}
    )
    with pytest.raises(VoiceError) as ei:
        await adapter.transcribe(STTRequest(audio_bytes=b"x", content_type="audio/webm"))
    assert ei.value.reason in ("stt_timeout", "stt_failed")


async def test_transcribe_s3_put_failure_wrapped(adapter_cls) -> None:  # noqa: ANN001
    adapter = _make_adapter(
        adapter_cls,
        {"s3": _s3(get_body=_OK_TRANSCRIPT, put_exc=RuntimeError("put fail")), "transcribe": _transcribe()},
    )
    with pytest.raises(VoiceError) as ei:
        await adapter.transcribe(STTRequest(audio_bytes=b"x", content_type="audio/webm"))
    assert ei.value.reason == "stt_failed"
