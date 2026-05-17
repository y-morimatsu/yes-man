"""Integration: Voice STT → Decision (U-Test FD §3.3).

Mock backend で MockVoiceAdapter.transcribe の出力テキストが
DecisionEngine.run の入力として正しく流せることを検証する.

HTTP 層ではなく domain-level の cross-unit flow を検証する.
"""
from __future__ import annotations

from uuid import UUID

import pytest

from yesman_api.domain.decision.consensus import ConsensusOrchestrator
from yesman_api.domain.decision.engine import DecisionEngine
from yesman_api.domain.decision.models import DecisionRequest
from yesman_api.domain.decision.silence_guard import SilenceGuard
from yesman_api.domain.persistence.constants import SYSTEM_USER_ID
from yesman_api.domain.persistence.models import Persona
from yesman_api.domain.voice.models import STTRequest
from yesman_api.infrastructure.decision.llm_providers.mock_adapter import MockLLMProvider
from yesman_api.infrastructure.voice.mock_adapter import MockVoiceAdapter


class _NullEventPublisher:
    backend_name = "test-null"

    async def publish_decision_confirmed(self, **kwargs) -> None:
        return None

    async def aclose(self) -> None:
        return None


@pytest.mark.asyncio
async def test_mock_voice_transcribe_returns_deterministic_text():
    """MockVoiceAdapter.transcribe は SHA-256 prefix を埋め込んだ識別可能 text を返す."""
    adapter = MockVoiceAdapter()
    req = STTRequest(audio_bytes=b"hello-audio", content_type="audio/webm")

    result = await adapter.transcribe(req)

    assert result.backend_name == "mock"
    assert result.confidence == 1.0
    assert result.text.startswith("[mock-stt-")
    assert result.text.endswith("]")

    # 同じ audio_bytes → 同じ hash (deterministic)
    result2 = await adapter.transcribe(req)
    assert result.text == result2.text


@pytest.mark.asyncio
async def test_mock_voice_transcribe_distinguishes_audio():
    """異なる audio_bytes は異なる hash prefix を返す."""
    adapter = MockVoiceAdapter()
    req_a = STTRequest(audio_bytes=b"audio-a", content_type="audio/webm")
    req_b = STTRequest(audio_bytes=b"audio-b", content_type="audio/webm")

    result_a = await adapter.transcribe(req_a)
    result_b = await adapter.transcribe(req_b)

    assert result_a.text != result_b.text


@pytest.mark.asyncio
async def test_voice_stt_text_drives_decision_engine(repo_bundle, test_user_id: str):
    """MockVoiceAdapter.transcribe の text を DecisionEngine.run に流し Decision 生成を検証."""
    user_id = UUID(test_user_id)

    # 1. builtin persona を seed (DecisionEngine fallback 経路に必要)
    builtin = Persona(
        owner_user_id=SYSTEM_USER_ID,
        name="慎重派",
        description="リスクを慎重に評価する",
        prompt_text="慎重に判断してください" * 2,
        is_shared=True,
        is_builtin=True,
    )
    await repo_bundle.persona.insert(builtin)

    # 2. Voice STT で text 取得
    voice = MockVoiceAdapter()
    stt = await voice.transcribe(
        STTRequest(audio_bytes=b"user-speech", content_type="audio/webm")
    )
    assert stt.text  # non-empty

    # 3. DecisionEngine 組み立て (Mock LLM + SilenceGuard regex のみ)
    llm = MockLLMProvider()
    silence_guard = SilenceGuard(llm=llm, salt="integration-salt")
    orchestrator = ConsensusOrchestrator()
    engine = DecisionEngine(
        llm=llm,
        orchestrator=orchestrator,
        silence_guard=silence_guard,
        decision_repo=repo_bundle.decision,
        silence_repo=repo_bundle.silence,
        persona_repo=repo_bundle.persona,
        profile_repo=repo_bundle.profile,
        event_publisher=_NullEventPublisher(),
        preference_loader=None,
    )

    # 4. STT 出力を user_input に流す
    request = DecisionRequest(user_id=user_id, user_input=stt.text)
    decision_id, consensus, no_count = await engine.run(request)

    # 5. 検証: Decision が永続化され parse 結果が取れる
    assert decision_id is not None
    assert consensus.domain_classification in ("daily", "work", "school", "major")
    assert consensus.proposal_text  # MockLLM の DEFAULT_OUTPUT に proposal あり
    assert no_count == 0  # 新規 Decision は pending、no_attempt_count = 0

    saved = await repo_bundle.decision.get(decision_id)
    assert saved is not None
    assert saved.user_id == user_id
    assert saved.user_input == stt.text
    assert saved.user_choice == "pending"
