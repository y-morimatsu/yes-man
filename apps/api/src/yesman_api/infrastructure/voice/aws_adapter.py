"""PollyTranscribeAdapter — aws backend 実装.

NFR Design §4.1-4.2 + ultrathink:
- I1 (Imp3): Polly Neural × Takumi
- I2 (NFR Design): asyncio.timeout で STT 全体 wrap、client 切断 cancellation 即終了
- I3 (Code Gen Plan): poll_intervals constructor 引数化で test 短縮
- Imp1 (NFR Design): finally 内 DeleteObject を try/except + logger.warning で wrap

aioboto3 ベース、Transcribe OutputKey="stt-output/" で prefix 化.
"""
from __future__ import annotations

import asyncio
import json
import uuid
from typing import Sequence

import aioboto3  # type: ignore[import-untyped]

from yesman_api.domain.voice.constants import _CONTENT_TYPE_TO_MEDIA_FORMAT, _LANG_TO_VOICE
from yesman_api.domain.voice.errors import VoiceError
from yesman_api.domain.voice.models import STTRequest, STTResult, TTSRequest, TTSResult
from yesman_api.shared.logging import get_logger


_DEFAULT_POLL_INTERVALS: tuple[float, ...] = tuple([0.5] * 10 + [1.0] * 25)  # 5s + 25s = 30s


def _content_type_ext(media_format: str) -> str:
    """Transcribe MediaFormat → S3 key 拡張子."""
    return media_format if media_format != "mp4" else "m4a"


class PollyTranscribeAdapter:
    backend_name = "aws"
    tts_supported = True
    stt_supported = True

    def __init__(
        self,
        *,
        polly_region: str,
        transcribe_region: str,
        voice_id: str,
        engine: str,
        bucket: str,
        presigned_ttl: int,
        poll_intervals: Sequence[float] | None = None,
        stt_total_timeout_seconds: float = 30.0,
    ) -> None:
        self._polly_region = polly_region
        self._transcribe_region = transcribe_region
        self._voice_id = voice_id
        self._engine = engine
        self._bucket = bucket
        self._presigned_ttl = presigned_ttl
        self._poll_intervals: tuple[float, ...] = (
            tuple(poll_intervals) if poll_intervals is not None else _DEFAULT_POLL_INTERVALS
        )
        self._stt_total_timeout = stt_total_timeout_seconds
        self._session = aioboto3.Session()
        self._logger = get_logger("voice.aws_adapter")

    # ============================================================
    # TTS
    # ============================================================
    async def synthesize(self, request: TTSRequest) -> TTSResult:
        voice_id = request.voice_id or _LANG_TO_VOICE.get(request.language_code)
        if voice_id is None:
            raise VoiceError("unsupported_language", detail=request.language_code)

        try:
            async with self._session.client("polly", region_name=self._polly_region) as polly:
                response = await polly.synthesize_speech(
                    Engine=self._engine,
                    LanguageCode=request.language_code,
                    OutputFormat="mp3",
                    SampleRate=str(request.sample_rate),
                    Text=request.text,
                    VoiceId=voice_id,
                )
                audio_bytes = await response["AudioStream"].read()
        except VoiceError:
            raise
        except Exception as exc:
            reason = "tts_throttled" if "Throttling" in type(exc).__name__ else "tts_failed"
            raise VoiceError(reason, detail=str(exc)) from exc

        key = f"tts/{uuid.uuid4()}.mp3"
        try:
            async with self._session.client("s3") as s3:
                await s3.put_object(
                    Bucket=self._bucket,
                    Key=key,
                    Body=audio_bytes,
                    ContentType="audio/mpeg",
                    ServerSideEncryption="AES256",
                )
                url = await s3.generate_presigned_url(
                    "get_object",
                    Params={"Bucket": self._bucket, "Key": key},
                    ExpiresIn=self._presigned_ttl,
                )
        except Exception as exc:
            raise VoiceError("storage_failed", detail=str(exc)) from exc

        return TTSResult(
            audio_url=url,
            audio_bytes=None,
            backend_name="aws-polly",
            duration_seconds=None,
        )

    # ============================================================
    # STT
    # ============================================================
    async def transcribe(self, request: STTRequest) -> STTResult:
        media_format = _CONTENT_TYPE_TO_MEDIA_FORMAT.get(request.content_type)
        if media_format is None:
            raise VoiceError("unsupported_audio_format", detail=request.content_type)
        if request.language_code not in _LANG_TO_VOICE:
            raise VoiceError("unsupported_language", detail=request.language_code)

        input_key = f"stt-input/{uuid.uuid4()}.{_content_type_ext(media_format)}"
        job_name = f"stt-{uuid.uuid4()}"
        output_key = f"stt-output/{job_name}.json"

        try:
            async with asyncio.timeout(self._stt_total_timeout):  # ultrathink I2
                try:
                    async with self._session.client("s3") as s3:
                        await s3.put_object(
                            Bucket=self._bucket,
                            Key=input_key,
                            Body=request.audio_bytes,
                            ContentType=request.content_type,
                            ServerSideEncryption="AES256",
                        )
                    async with self._session.client(
                        "transcribe", region_name=self._transcribe_region
                    ) as transcribe:
                        await transcribe.start_transcription_job(
                            TranscriptionJobName=job_name,
                            LanguageCode=request.language_code,
                            MediaFormat=media_format,
                            Media={"MediaFileUri": f"s3://{self._bucket}/{input_key}"},
                            OutputBucketName=self._bucket,
                            OutputKey="stt-output/",  # ultrathink I1: 末尾 "/" で prefix 化
                        )
                        result = await self._poll_transcribe(transcribe, job_name)
                    # fetch result JSON
                    async with self._session.client("s3") as s3:
                        obj = await s3.get_object(Bucket=self._bucket, Key=output_key)
                        body = await obj["Body"].read()
                    payload = json.loads(body)
                    text = payload["results"]["transcripts"][0]["transcript"]
                    items = payload["results"].get("items") or []
                    confidence = 0.0
                    if items:
                        alt = items[0].get("alternatives") or [{}]
                        confidence = float(alt[0].get("confidence", 0.0))
                    # delete output (try/except wrap、ultrathink Imp1)
                    try:
                        async with self._session.client("s3") as s3:
                            await s3.delete_object(Bucket=self._bucket, Key=output_key)
                    except Exception as exc:
                        self._logger.warning(
                            "stt_output_delete_failed", error=str(exc), key=output_key
                        )
                    return STTResult(text=text, confidence=confidence, backend_name="aws-transcribe")
                except VoiceError:
                    raise
                except Exception as exc:
                    raise VoiceError("stt_failed", detail=str(exc)) from exc
        except TimeoutError as exc:
            raise VoiceError("stt_timeout") from exc
        finally:
            # input audio は必ず削除 (ultrathink Imp1)
            try:
                async with self._session.client("s3") as s3:
                    await s3.delete_object(Bucket=self._bucket, Key=input_key)
            except Exception as exc:
                self._logger.warning(
                    "stt_input_delete_failed", error=str(exc), key=input_key
                )

    async def _poll_transcribe(self, transcribe_client, job_name: str):
        """ultrathink I3: poll_intervals (構成可能) で短時間 polling."""
        for interval in self._poll_intervals:
            await asyncio.sleep(interval)
            job = await transcribe_client.get_transcription_job(
                TranscriptionJobName=job_name
            )
            status = job["TranscriptionJob"]["TranscriptionJobStatus"]
            if status == "COMPLETED":
                return job
            if status == "FAILED":
                raise VoiceError(
                    "stt_failed",
                    detail=job["TranscriptionJob"].get("FailureReason"),
                )
        # poll_intervals 消費 = asyncio.timeout より早く到達した場合、stt_timeout 同等
        raise VoiceError("stt_timeout")


__all__ = ["PollyTranscribeAdapter"]
