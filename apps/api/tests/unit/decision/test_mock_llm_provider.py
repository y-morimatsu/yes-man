"""MockLLMProvider — parallel consensus 対応 (spec 2026-05-21)."""
import asyncio
import pytest
from yesman_api.infrastructure.decision.llm_providers.mock_adapter import (
    MockLLMProvider,
)


class TestMockLLMComplete:
    async def test_returns_shincho_response_when_prompt_mentions_shincho(self):
        mock = MockLLMProvider()
        out = await mock.complete(
            system="あなたは「慎重派」というペルソナです。...",
            messages=[{"role": "user", "content": "test"}],
        )
        assert "慎重派" in out or "リスク" in out or "もう少し" in out

    async def test_returns_rakukan_response_when_prompt_mentions_rakukan(self):
        mock = MockLLMProvider()
        out = await mock.complete(
            system="あなたは「楽観派」というペルソナです。...",
            messages=[{"role": "user", "content": "test"}],
        )
        assert "楽観派" in out or "前向き" in out or "最高" in out

    async def test_returns_kouritsu_response_when_prompt_mentions_kouritsu(self):
        mock = MockLLMProvider()
        out = await mock.complete(
            system="あなたは「効率派」というペルソナです。...",
            messages=[{"role": "user", "content": "test"}],
        )
        assert "効率派" in out or "短時間" in out or "ROI" in out

    async def test_returns_proposal_when_prompt_mentions_proposal(self):
        mock = MockLLMProvider()
        out = await mock.complete(
            system="以下の意見を踏まえて、最終助言を 100 字以内で...",
            messages=[{"role": "user", "content": "test"}],
        )
        assert "進めて" in out or "選択" in out or len(out) <= 100

    async def test_override_takes_precedence(self):
        mock = MockLLMProvider(override="CUSTOM RESPONSE")
        out = await mock.complete(
            system="あなたは「慎重派」というペルソナです。",
            messages=[{"role": "user", "content": "test"}],
        )
        assert out == "CUSTOM RESPONSE"


class TestMockLLMCompleteWithDelay:
    async def test_per_persona_delay(self):
        """spec §11.2: deterministic delay で persona 順序を制御可能."""
        mock = MockLLMProvider(persona_delays={"慎重派": 0.05, "楽観派": 0.01})
        start = asyncio.get_event_loop().time()
        await mock.complete(
            system="あなたは「慎重派」というペルソナです",
            messages=[{"role": "user", "content": "test"}],
        )
        elapsed = asyncio.get_event_loop().time() - start
        assert elapsed >= 0.04  # 50ms delay was applied
