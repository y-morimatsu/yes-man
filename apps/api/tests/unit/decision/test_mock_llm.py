"""MockLLMProvider — complete / stream / stream_delay 可変 / chunk_size."""
from __future__ import annotations

import pytest

from yesman_api.infrastructure.decision.llm_providers.mock_adapter import MockLLMProvider


@pytest.mark.asyncio
async def test_complete_returns_default():
    llm = MockLLMProvider()
    out = await llm.complete(system="s", messages=[{"role": "user", "content": "hi"}])
    assert "<domain>" in out
    assert "<proposal>" in out


@pytest.mark.asyncio
async def test_stream_yields_chunks():
    llm = MockLLMProvider(chunk_size=20, stream_delay_seconds=0.0)
    chunks = []
    async for c in llm.stream(system="s", messages=[]):
        chunks.append(c)
    assert len(chunks) > 1
    assert "".join(chunks) == MockLLMProvider.DEFAULT_OUTPUT


@pytest.mark.asyncio
async def test_override_output():
    llm = MockLLMProvider(override="custom-output")
    out = await llm.complete(system="s", messages=[])
    assert out == "custom-output"


@pytest.mark.asyncio
async def test_aclose_is_noop():
    llm = MockLLMProvider()
    await llm.aclose()
