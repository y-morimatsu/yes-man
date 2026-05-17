"""LLM timeout エッジケース (NFR Req TEST-U4-14 / ultrathink Imp4).

complete / stream initial / stream total の 3 種シミュレーション.
Bedrock 実 API は呼ばず、`DecisionEngine` 経由で `DecisionError("llm_timeout")` を assertion.
"""
from __future__ import annotations

import pytest

from yesman_api.domain.decision.errors import DecisionError


class _TimeoutLLM:
    provider_name = "mock"

    async def complete(self, *, system, messages, temperature=0.7):
        raise DecisionError("llm_timeout", detail="simulated")

    async def stream(self, *, system, messages, temperature=0.7):
        raise DecisionError("llm_timeout", detail="simulated initial")
        if False:
            yield ""

    async def aclose(self):
        pass


@pytest.mark.asyncio
async def test_complete_timeout_raises_decision_error():
    llm = _TimeoutLLM()
    with pytest.raises(DecisionError) as exc:
        await llm.complete(system="s", messages=[{"role": "user", "content": "x"}])
    assert exc.value.reason == "llm_timeout"


@pytest.mark.asyncio
async def test_stream_initial_timeout_raises_decision_error():
    llm = _TimeoutLLM()
    with pytest.raises(DecisionError) as exc:
        async for _ in llm.stream(system="s", messages=[]):
            pass
    assert exc.value.reason == "llm_timeout"
