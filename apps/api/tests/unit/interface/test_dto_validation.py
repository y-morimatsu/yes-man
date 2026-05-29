"""Unit tests for HTTP DTO validation (interface/http/dto/persona.py, voice.py).

外部サービス呼び出しなし。Pydantic のバリデーション (min/max length, Literal,
extra=forbid) を網羅し、Request/Response モデルの構築を検証する。
"""
from __future__ import annotations

import uuid

import pytest
from pydantic import ValidationError

from yesman_api.interface.http.dto.persona import (
    PersonaCreateRequest,
    PersonaReportRequest,
    PersonaResponse,
    PersonaSelectionResponse,
    PersonaSelectionUpdateRequest,
    PersonaShareRequest,
    PersonaUpdateRequest,
    SharedPersonaSummaryResponse,
)
from yesman_api.interface.http.dto.voice import (
    STTResponseDTO,
    TTSRequestDTO,
    TTSResponseDTO,
    VoiceConfigResponse,
)


# ============================================================
# Persona Response DTO
# ============================================================
def test_persona_response_construct() -> None:
    resp = PersonaResponse(
        id=uuid.uuid4(),
        owner_user_id=uuid.uuid4(),
        name="慎重派",
        description="リスクを重視",
        avatar_url="yesman-avatar:abc",
        prompt_text="You are cautious.",
        is_shared=False,
        is_builtin=True,
        is_blocked=False,
        usage_count=10,
        yes_count=7,
    )
    assert resp.name == "慎重派"
    assert resp.yes_count == 7


def test_shared_persona_summary_construct() -> None:
    summary = SharedPersonaSummaryResponse(
        id=uuid.uuid4(),
        name="楽観派",
        description=None,
        avatar_url=None,
        usage_count=3,
        yes_acceptance_rate=0.66,
        creator_anonymous_id="anon-xyz",
    )
    assert summary.yes_acceptance_rate == pytest.approx(0.66)
    assert summary.creator_anonymous_id == "anon-xyz"


def test_persona_selection_response_construct() -> None:
    ids = [uuid.uuid4(), uuid.uuid4()]
    resp = PersonaSelectionResponse(persona_ids=ids)
    assert resp.persona_ids == ids


# ============================================================
# Persona Request DTO
# ============================================================
def test_persona_create_valid() -> None:
    req = PersonaCreateRequest(
        name="効率派",
        description="最短ルート重視",
        prompt_text="最短ルートで効率的に決める人格",  # >= 10 chars
        avatar_url=None,
    )
    assert req.name == "効率派"


@pytest.mark.parametrize(
    "kwargs",
    [
        {"name": "", "prompt_text": "0123456789"},  # name min_length 1
        {"name": "x" * 51, "prompt_text": "0123456789"},  # name max_length 50
        {"name": "ok", "prompt_text": "short"},  # prompt_text min_length 10
        {"name": "ok", "prompt_text": "x" * 2001},  # prompt_text max_length 2000
        {"name": "ok", "prompt_text": "0123456789", "description": "x" * 201},  # desc max 200
        {"name": "ok", "prompt_text": "0123456789", "avatar_url": "x" * 501},  # avatar max 500
    ],
)
def test_persona_create_invalid(kwargs: dict) -> None:
    with pytest.raises(ValidationError):
        PersonaCreateRequest(**kwargs)


def test_persona_create_rejects_extra_field() -> None:
    with pytest.raises(ValidationError):
        PersonaCreateRequest(name="ok", prompt_text="0123456789", bogus="x")


def test_persona_update_all_optional() -> None:
    req = PersonaUpdateRequest()
    assert req.name is None and req.prompt_text is None


def test_persona_update_prompt_too_short() -> None:
    with pytest.raises(ValidationError):
        PersonaUpdateRequest(prompt_text="short")


def test_persona_share_request() -> None:
    assert PersonaShareRequest(shared=True).shared is True
    with pytest.raises(ValidationError):
        PersonaShareRequest()  # shared required


@pytest.mark.parametrize("reason", ["silence-domain", "malicious", "copyright", "other"])
def test_persona_report_valid_reasons(reason: str) -> None:
    req = PersonaReportRequest(reason=reason)
    assert req.reason == reason


def test_persona_report_invalid_reason() -> None:
    with pytest.raises(ValidationError):
        PersonaReportRequest(reason="not-a-reason")


def test_persona_report_detail_too_long() -> None:
    with pytest.raises(ValidationError):
        PersonaReportRequest(reason="other", detail="x" * 501)


def test_persona_selection_update_valid() -> None:
    req = PersonaSelectionUpdateRequest(persona_ids=[uuid.uuid4()])
    assert len(req.persona_ids) == 1


@pytest.mark.parametrize("count", [0, 4])
def test_persona_selection_update_invalid_size(count: int) -> None:
    with pytest.raises(ValidationError):
        PersonaSelectionUpdateRequest(persona_ids=[uuid.uuid4() for _ in range(count)])


# ============================================================
# Voice DTO
# ============================================================
def test_voice_config_response_valid() -> None:
    resp = VoiceConfigResponse(backend="mock", tts_supported=True, stt_supported=False)
    assert resp.backend == "mock"


def test_voice_config_response_invalid_backend() -> None:
    with pytest.raises(ValidationError):
        VoiceConfigResponse(backend="azure", tts_supported=True, stt_supported=True)


def test_tts_response_dto() -> None:
    dto = TTSResponseDTO(audio_url="https://x/a.mp3", backend="aws", duration_seconds=1.5)
    assert dto.duration_seconds == pytest.approx(1.5)
    # duration_seconds optional
    assert TTSResponseDTO(audio_url="u", backend="mock").duration_seconds is None


def test_stt_response_dto() -> None:
    dto = STTResponseDTO(text="こんにちは", confidence=0.9, backend="aws")
    assert dto.text == "こんにちは"


def test_tts_request_defaults_and_valid() -> None:
    req = TTSRequestDTO(text="読み上げる")
    assert req.language_code == "ja-JP"
    assert req.voice_id is None


@pytest.mark.parametrize(
    "kwargs",
    [
        {"text": ""},  # min_length 1
        {"text": "x" * 3001},  # max_length 3000
    ],
)
def test_tts_request_invalid_text(kwargs: dict) -> None:
    with pytest.raises(ValidationError):
        TTSRequestDTO(**kwargs)


def test_tts_request_rejects_extra() -> None:
    with pytest.raises(ValidationError):
        TTSRequestDTO(text="ok", bogus=1)
