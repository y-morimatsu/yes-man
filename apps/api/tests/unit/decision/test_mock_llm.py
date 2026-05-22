"""MockLLMProvider — complete / stream / persona-aware routing / override."""
from __future__ import annotations

import pytest

from yesman_api.infrastructure.decision.llm_providers.mock_adapter import MockLLMProvider


@pytest.mark.asyncio
async def test_complete_unknown_prompt_returns_default_response():
    """persona でも proposal でもない system prompt は DEFAULT_RESPONSE を返す."""
    llm = MockLLMProvider()
    out = await llm.complete(system="s", messages=[{"role": "user", "content": "hi"}])
    assert out == MockLLMProvider.DEFAULT_RESPONSE


@pytest.mark.asyncio
async def test_complete_persona_prompt_returns_persona_response():
    """persona prompt (「慎重派」を含む) は per-persona canned response を返す."""
    llm = MockLLMProvider()
    out = await llm.complete(
        system="あなたは「慎重派」というペルソナです。",
        messages=[{"role": "user", "content": "どうする？"}],
    )
    assert out == MockLLMProvider.PERSONA_RESPONSES["慎重派"]


@pytest.mark.asyncio
async def test_complete_proposal_prompt_returns_proposal_response():
    """proposal prompt (「最終的な助言」を含む) は PROPOSAL_RESPONSE を返す."""
    llm = MockLLMProvider()
    out = await llm.complete(
        system="以下の意見を踏まえて、ユーザに対する **最終的な助言** を出してください。",
        messages=[{"role": "user", "content": "相談"}],
    )
    assert out == MockLLMProvider.PROPOSAL_RESPONSE


@pytest.mark.asyncio
async def test_stream_yields_chunks():
    """stream() は LLMProviderAdapter Protocol 要件。complete() に委譲して chunk 分割 yield。"""
    llm = MockLLMProvider(override="abcdefghij", chunk_size=3, stream_delay_seconds=0.0)
    chunks = []
    async for c in llm.stream(system="s", messages=[]):
        chunks.append(c)
    assert len(chunks) > 1
    assert "".join(chunks) == "abcdefghij"


@pytest.mark.asyncio
async def test_override_output():
    llm = MockLLMProvider(override="custom-output")
    out = await llm.complete(system="s", messages=[])
    assert out == "custom-output"


@pytest.mark.asyncio
async def test_aclose_is_noop():
    llm = MockLLMProvider()
    await llm.aclose()
