"""U4 / decision のテストフィクスチャ (Infrastructure Design §6.1 + Imp2).

5 種類:
- decision_request_factory(user_input, selected_persona_ids=[]) -> DecisionRequest
- consensus_output_factory(domain="daily", proposal="...", utterances=[]) -> ConsensusOutput
- silence_verdict_factory(is_silenced=False, domain=None) -> SilenceVerdict
- mock_llm_provider_factory(override=None, stream_delay=0.0) -> MockLLMProvider
- builtin_personas() -> list[Persona] (system user 所有の 3 種を直接構築、DB アクセス不要)
"""
from __future__ import annotations

from uuid import UUID, uuid4

from yesman_api.domain.decision.models import (
    ConsensusOutput,
    DecisionRequest,
    PersonaUtterance,
    SilenceVerdict,
)
from yesman_api.domain.persistence.constants import SYSTEM_USER_ID
from yesman_api.domain.persistence.models import Persona
from yesman_api.infrastructure.decision.llm_providers.mock_adapter import MockLLMProvider


def decision_request_factory(
    *,
    user_id: UUID | None = None,
    user_input: str = "今日のランチを決めて",
    selected_persona_ids: list[UUID] | None = None,
) -> DecisionRequest:
    return DecisionRequest(
        user_id=user_id or uuid4(),
        user_input=user_input,
        selected_persona_ids=selected_persona_ids or [],
    )


def consensus_output_factory(
    *,
    domain: str = "daily",
    proposal: str = "Mock proposal",
    utterances: list[PersonaUtterance] | None = None,
) -> ConsensusOutput:
    return ConsensusOutput(
        domain_classification=domain,  # type: ignore[arg-type]
        utterances=utterances or [],
        proposal_text=proposal,
    )


def silence_verdict_factory(
    *,
    is_silenced: bool = False,
    domain=None,
    response_text: str | None = None,
) -> SilenceVerdict:
    return SilenceVerdict(
        is_silenced=is_silenced,
        domain=domain,
        response_text=response_text,
    )


def mock_llm_provider_factory(
    *,
    override: str | None = None,
    stream_delay: float = 0.0,
) -> MockLLMProvider:
    return MockLLMProvider(override=override, stream_delay_seconds=stream_delay)


def builtin_personas() -> list[Persona]:
    """U2 0002_builtin_personas migration で seed される 3 種を直接構築 (DB 不要)."""
    return [
        Persona(
            id=UUID("00000000-0000-0000-0000-000000000010"),
            owner_user_id=SYSTEM_USER_ID,
            name="慎重派",
            description="リスクを慎重に評価する",
            prompt_text="あなたは慎重派です。慎重に意見してください。",
            is_shared=True,
            is_builtin=True,
            usage_count=0,
            yes_count=0,
        ),
        Persona(
            id=UUID("00000000-0000-0000-0000-000000000011"),
            owner_user_id=SYSTEM_USER_ID,
            name="楽観派",
            description="前向きにポジティブに",
            prompt_text="あなたは楽観派です。前向きに意見してください。",
            is_shared=True,
            is_builtin=True,
            usage_count=0,
            yes_count=0,
        ),
        Persona(
            id=UUID("00000000-0000-0000-0000-000000000012"),
            owner_user_id=SYSTEM_USER_ID,
            name="効率派",
            description="効率重視",
            prompt_text="あなたは効率派です。効率を最優先に意見してください。",
            is_shared=True,
            is_builtin=True,
            usage_count=0,
            yes_count=0,
        ),
    ]


class _StubPreferenceLoader:
    """U5 PreferenceProfileLoader の軽量 stub (U4 test 用、依存逆転防止、Infra Design I2).

    実 PreferenceProfileLoader を import せず、U4 engine 内呼び出しを no-op 化.
    """

    async def load_for_prompt(self, user_id) -> str:
        return ""  # 空 YAML、preference 注入なし

    async def load(self, user_id):
        from yesman_api.domain.persistence.models import PreferenceProfile

        return PreferenceProfile(user_id=user_id)


def mock_preference_loader_factory():
    """U4 test_engine 用の軽量 stub factory."""
    return _StubPreferenceLoader()


__all__ = [
    "decision_request_factory",
    "consensus_output_factory",
    "silence_verdict_factory",
    "mock_llm_provider_factory",
    "builtin_personas",
    "mock_preference_loader_factory",
]
