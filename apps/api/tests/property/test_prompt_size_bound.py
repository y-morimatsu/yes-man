"""PBT — 任意 persona description + prompt_text → persona prompt 長制約 (TEST-U4-05 / spec 2026-05-21).

legacy build_prompt (single XML prompt) は削除済み。
build_persona_prompt / build_proposal_prompt の長さ制約を検証する。
"""
from __future__ import annotations

from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st
from uuid import uuid4

from tests.fixtures.decision import builtin_personas
from yesman_api.domain.decision.consensus import ConsensusOrchestrator
from yesman_api.domain.persistence.constants import SYSTEM_USER_ID
from yesman_api.domain.persistence.models import Persona


def _persona(*, description: str, prompt_text: str) -> Persona:
    return Persona(
        id=uuid4(),
        owner_user_id=SYSTEM_USER_ID,
        name="テスト派",
        description=description,
        prompt_text=prompt_text,
        is_shared=False,
        is_builtin=True,
        usage_count=0,
        yes_count=0,
    )


@given(
    description=st.text(max_size=1000),
    prompt_text=st.text(max_size=1000),
)
@settings(max_examples=50, suppress_health_check=[HealthCheck.function_scoped_fixture])
def test_build_persona_prompt_size_bounded(description, prompt_text):
    """通常用途 (description ~1k, prompt_text ~1k) では persona prompt 全長 < 10k 文字を確認."""
    orch = ConsensusOrchestrator()
    persona = _persona(description=description, prompt_text=prompt_text)
    prompt = orch.build_persona_prompt(persona)
    assert len(prompt) < 10_000


@given(utterance_text=st.text(max_size=500))
@settings(max_examples=50, suppress_health_check=[HealthCheck.function_scoped_fixture])
def test_build_proposal_prompt_size_bounded(utterance_text):
    """proposal prompt が reasonable サイズ以下であることを確認."""
    orch = ConsensusOrchestrator()
    personas = builtin_personas()
    utterances = [(p, utterance_text) for p in personas]
    prompt = orch.build_proposal_prompt(utterances)
    assert len(prompt) < 20_000
