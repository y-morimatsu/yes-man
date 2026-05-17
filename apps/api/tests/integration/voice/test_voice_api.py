"""Integration test placeholder — /v1/voice/{config,tts,stt} endpoints (U6).

TODO: TestClient + Mock backend で実装:
- GET /v1/voice/config → {backend: "mock", tts_supported: true, stt_supported: true} + Cache-Control header
- POST /v1/voice/tts (正常): MockVoiceAdapter で audio_url="" + backend="mock"
- POST /v1/voice/tts (沈黙ドメイン): "宗教について" → 422 tts_silenced_domain (regex-only)
- POST /v1/voice/tts (上限超過): text >3000 → 422 Pydantic validation
- POST /v1/voice/stt (正常): multipart audio/webm → text="[mock-stt-<hash>]"
- POST /v1/voice/stt (content_type 不正): audio/amr → 415 unsupported_audio_format
- POST /v1/voice/stt (size 超過): >5MB → 413 audio_too_large
- web-speech-api backend: GET /config で tts_supported=false、POST /tts は 409 client_only_backend
"""
from __future__ import annotations

import pytest

pytestmark = pytest.mark.skip(reason="integration placeholder — see TODO in module docstring")
