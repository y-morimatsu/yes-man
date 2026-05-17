"""PollyTranscribeAdapter unit test (placeholder + 基本ケース、6 ケース想定).

ultrathink I3: poll_intervals=[0.001]*5 で CI 高速化、`asyncio.timeout` テストも短時間.
aioboto3 + botocore Stubber の組み合わせは aioboto3 内部で boto3 client を wrap するため、
実 stubber 接続は実 environment 依存. MVP では skip + TODO 形式で placeholder 化、
将来 moto 4 系で再実装、または mock.patch で AsyncMock 化.
"""
from __future__ import annotations

import pytest

pytestmark = pytest.mark.skip(
    reason="aws_adapter integration test placeholder. "
    "Requires aioboto3 + botocore Stubber harness, "
    "covered manually with VOICE_BACKEND=aws + real AWS in staging."
)


async def test_tts_success():
    """TTS 正常 (Polly stub → S3 PutObject stub → presigned URL 生成)."""
    # TODO: botocore Stubber で polly.synthesize_speech / s3.put_object / generate_presigned_url
    ...


async def test_tts_throttling_raises():
    """Polly ThrottlingException → VoiceError("tts_throttled")."""
    ...


async def test_stt_success_with_short_poll_intervals():
    """poll_intervals=[0.001]*5 で短時間 CI 完走 (ultrathink I3)."""
    ...


async def test_stt_failed_status_raises():
    """Transcribe FAILED → VoiceError("stt_failed")."""
    ...


async def test_stt_timeout_via_asyncio_timeout():
    """poll_intervals 消費 → VoiceError("stt_timeout")、asyncio.timeout 経路.

    ultrathink I2 (asyncio.timeout) + I3 (poll_intervals 注入) で実時間 ~5ms.
    """
    ...


async def test_stt_delete_object_failure_logged_not_raised():
    """input delete 失敗時 logger.warning のみ、結果は正常返却 (ultrathink Imp1)."""
    ...
