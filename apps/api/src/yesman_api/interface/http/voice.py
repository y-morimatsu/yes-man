"""Voice API endpoints (U6 FR-VOICE-01〜04).

NFR Design §4.3.2 + §8 + §9 + ultrathink:
- I2 (NFR Design): regex-only SilenceGuard for TTS
- Imp2 (NFR Design): Retry-After: 2 header for tts_throttled (HTTPException headers param)
- Imp4 (FD): Cache-Control: private, max-age=3600 for /v1/voice/config
"""
from __future__ import annotations

import hashlib
import time

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Response,
    UploadFile,
    status,
)

from yesman_api.application.voice.protocols import VoiceProviderAdapter
from yesman_api.domain.auth.models import AuthenticatedUser
from yesman_api.domain.decision.silence_guard import SilenceGuard
from yesman_api.domain.voice.constants import (
    _CONTENT_TYPE_TO_MEDIA_FORMAT,
    MAX_STT_AUDIO_BYTES,
)
from yesman_api.domain.voice.errors import VoiceError
from yesman_api.domain.voice.models import STTRequest, TTSRequest
from yesman_api.interface.deps import (
    get_current_user,
    get_silence_guard,
    get_voice_provider,
)
from yesman_api.interface.http.dto.voice import (
    STTResponseDTO,
    TTSRequestDTO,
    TTSResponseDTO,
    VoiceConfigResponse,
)
from yesman_api.shared.logging import audit_log, get_logger


router = APIRouter(prefix="/v1/voice", tags=["voice"])
_logger = get_logger("voice.router")


# ============================================================
# Error mapping (NFR Design §9 + Imp2 Retry-After)
# ============================================================
_VOICE_ERROR_HTTP_MAP: dict[str, int] = {
    "client_only_backend": 409,
    "tts_throttled": 429,
    "tts_failed": 502,
    "tts_text_too_long": 422,
    "tts_silenced_domain": 422,
    "stt_timeout": 504,
    "stt_failed": 502,
    "storage_failed": 502,
    "unsupported_audio_format": 415,
    "unsupported_language": 415,
    "audio_too_large": 413,
}


def _raise_for_voice_error(exc: VoiceError) -> None:
    status_code = _VOICE_ERROR_HTTP_MAP.get(exc.reason, 500)
    headers: dict[str, str] | None = None
    if exc.reason == "tts_throttled":
        headers = {"Retry-After": "2"}  # NFR Req AVAIL-U6-02 + Imp2
    raise HTTPException(
        status_code=status_code,
        detail={"reason": exc.reason, "detail": exc.detail},
        headers=headers,
    )


# ============================================================
# /v1/voice/config
# ============================================================
@router.get("/config", response_model=VoiceConfigResponse)
async def get_config(
    response: Response,
    voice: VoiceProviderAdapter = Depends(get_voice_provider),
    _user: AuthenticatedUser = Depends(get_current_user),
) -> VoiceConfigResponse:
    # ultrathink FD Imp4: 1 hour client cache
    response.headers["Cache-Control"] = "private, max-age=3600"
    return VoiceConfigResponse(
        backend=voice.backend_name,  # type: ignore[arg-type]
        tts_supported=voice.tts_supported,
        stt_supported=voice.stt_supported,
    )


# ============================================================
# /v1/voice/tts
# ============================================================
@router.post("/tts", response_model=TTSResponseDTO)
async def tts(
    payload: TTSRequestDTO,
    user: AuthenticatedUser = Depends(get_current_user),
    voice: VoiceProviderAdapter = Depends(get_voice_provider),
    silence_guard: SilenceGuard = Depends(get_silence_guard),
) -> TTSResponseDTO:
    # ultrathink NFR Design I2: regex-only fast-path (LLM stage skip)
    verdict = silence_guard.evaluate_regex_only(user_input=payload.text)
    if verdict.is_silenced:
        raise HTTPException(
            status_code=422,
            detail={
                "reason": "tts_silenced_domain",
                "domain": verdict.domain,
            },
        )
    if not voice.tts_supported:
        raise HTTPException(
            status_code=409,
            detail={"reason": "client_only_backend"},
        )

    request = TTSRequest(
        text=payload.text,
        voice_id=payload.voice_id,
        language_code=payload.language_code,
    )
    t0 = time.monotonic()
    try:
        result = await voice.synthesize(request)
    except VoiceError as exc:
        _raise_for_voice_error(exc)

    duration_ms = int((time.monotonic() - t0) * 1000)
    audit_log(
        "audit.voice.tts_requested",
        sub=user.sub,
        text_hash=hashlib.sha256(payload.text.encode()).hexdigest()[:16],
        voice_id=payload.voice_id,
        duration_ms=duration_ms,
    )
    return TTSResponseDTO(
        audio_url=result.audio_url,
        backend=result.backend_name,
        duration_seconds=result.duration_seconds,
    )


# ============================================================
# /v1/voice/stt
# ============================================================
@router.post("/stt", response_model=STTResponseDTO)
async def stt(
    user: AuthenticatedUser = Depends(get_current_user),
    voice: VoiceProviderAdapter = Depends(get_voice_provider),
    audio: UploadFile = File(...),
    language_code: str = Form(default="ja-JP"),
) -> STTResponseDTO:
    content_type = audio.content_type or ""
    if content_type not in _CONTENT_TYPE_TO_MEDIA_FORMAT:
        raise HTTPException(
            status_code=415,
            detail={"reason": "unsupported_audio_format", "content_type": content_type},
        )

    audio_bytes = await audio.read()
    if len(audio_bytes) > MAX_STT_AUDIO_BYTES:
        raise HTTPException(
            status_code=413,
            detail={
                "reason": "audio_too_large",
                "size": len(audio_bytes),
                "max": MAX_STT_AUDIO_BYTES,
            },
        )

    if not voice.stt_supported:
        raise HTTPException(
            status_code=409,
            detail={"reason": "client_only_backend"},
        )

    request = STTRequest(
        audio_bytes=audio_bytes,
        content_type=content_type,
        language_code=language_code,
    )
    t0 = time.monotonic()
    try:
        result = await voice.transcribe(request)
    except VoiceError as exc:
        _raise_for_voice_error(exc)

    duration_ms = int((time.monotonic() - t0) * 1000)
    audit_log(
        "audit.voice.stt_requested",
        sub=user.sub,
        audio_hash=hashlib.sha256(audio_bytes).hexdigest()[:16],
        confidence=result.confidence,
        duration_ms=duration_ms,
    )
    return STTResponseDTO(
        text=result.text,
        confidence=result.confidence,
        backend=result.backend_name,
    )


__all__ = ["router"]
