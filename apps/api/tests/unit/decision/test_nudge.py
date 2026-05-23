"""NudgeCache + NudgeMessageGenerator — pending/ready/failed / TTL / _maybe_evict."""
from __future__ import annotations

import time

import pytest

from tests.fixtures.decision import mock_llm_provider_factory
from yesman_api.domain.decision.nudge import NudgeCache, NudgeMessageGenerator


def test_cache_pending_ready_flow():
    c = NudgeCache(ttl=60)
    c.set_pending("d1")
    assert c.get("d1").status == "pending"
    c.set_ready("d1", "msg")
    assert c.get("d1").status == "ready"
    assert c.get("d1").message == "msg"


def test_cache_ttl_expiration():
    c = NudgeCache(ttl=0.01)
    c.set_ready("d1", "msg")
    time.sleep(0.05)
    assert c.get("d1") is None  # TTL 切れ


def test_cache_maybe_evict_clears_expired():
    c = NudgeCache(ttl=0.01)
    c.MAX_ENTRIES = 3  # type: ignore[misc]
    c.set_ready("a", "x")
    c.set_ready("b", "y")
    time.sleep(0.02)
    c.set_pending("c")  # _maybe_evict trigger
    assert c.get("a") is None
    assert c.get("b") is None


@pytest.mark.asyncio
async def test_generator_writes_ready_on_success():
    c = NudgeCache(ttl=60)
    gen = NudgeMessageGenerator(llm=mock_llm_provider_factory(override="generated"), cache=c)
    await gen.generate(decision_id="d1", proposal_text="x", choice="yes", no_streak=0)
    cached = c.get("d1")
    assert cached.status == "ready"


# issue #93: generate_yes_microcopy 単体テスト
class TestGenerateYesMicrocopy:
    @pytest.mark.asyncio
    async def test_returns_llm_text_on_success(self):
        c = NudgeCache(ttl=60)
        gen = NudgeMessageGenerator(
            llm=mock_llm_provider_factory(override="もう一案 どうぞ、 これなら きっと"),
            cache=c,
        )
        msg = await gen.generate_yes_microcopy(
            proposal_text="駅近の公園か商業施設を選べ",
            stage=1,
        )
        assert msg == "もう一案 どうぞ、 これなら きっと"

    @pytest.mark.asyncio
    async def test_caps_long_response_at_60_chars(self):
        long = "あ" * 200
        c = NudgeCache(ttl=60)
        gen = NudgeMessageGenerator(llm=mock_llm_provider_factory(override=long), cache=c)
        msg = await gen.generate_yes_microcopy(proposal_text="x", stage=1)
        assert len(msg) == 60

    @pytest.mark.asyncio
    async def test_returns_fallback_when_disabled(self):
        c = NudgeCache(ttl=60)
        gen = NudgeMessageGenerator(
            llm=mock_llm_provider_factory(override="x"),
            cache=c,
            enabled=False,
        )
        msg = await gen.generate_yes_microcopy(proposal_text="x", stage=1)
        assert msg == "もう一案 どうぞ"  # stage 1 fallback

    @pytest.mark.asyncio
    async def test_returns_fallback_on_llm_exception(self):
        class FailingLLM:
            async def complete(self, **_kw):
                raise RuntimeError("boom")

            async def stream(self, **_kw):
                yield ""

            async def aclose(self):
                pass

        c = NudgeCache(ttl=60)
        gen = NudgeMessageGenerator(llm=FailingLLM(), cache=c)
        msg = await gen.generate_yes_microcopy(proposal_text="x", stage=3)
        # stage 3 fallback
        assert msg == "ここまでの こだわり、 大切にしながら一案 どうぞ"

    @pytest.mark.asyncio
    async def test_stage_specific_fallbacks(self):
        class FailingLLM:
            async def complete(self, **_kw):
                raise RuntimeError("x")

            async def stream(self, **_kw):
                yield ""

            async def aclose(self):
                pass

        gen = NudgeMessageGenerator(llm=FailingLLM(), cache=NudgeCache(ttl=60))
        assert await gen.generate_yes_microcopy(proposal_text="x", stage=1) == "もう一案 どうぞ"
        assert await gen.generate_yes_microcopy(proposal_text="x", stage=2) == "今度は ご納得 いただけるかも"
        assert (
            await gen.generate_yes_microcopy(proposal_text="x", stage=3)
            == "ここまでの こだわり、 大切にしながら一案 どうぞ"
        )
        assert (
            await gen.generate_yes_microcopy(proposal_text="x", stage=5)
            == "ここまで考えた あなたなら、 任せてみる勇気を"
        )
        assert (
            await gen.generate_yes_microcopy(proposal_text="x", stage=10)
            == "ここまで考えた あなたなら、 任せてみる勇気を"
        )

    @pytest.mark.asyncio
    async def test_empty_llm_response_falls_back(self):
        c = NudgeCache(ttl=60)
        gen = NudgeMessageGenerator(llm=mock_llm_provider_factory(override="   "), cache=c)
        msg = await gen.generate_yes_microcopy(proposal_text="x", stage=2)
        assert msg == "今度は ご納得 いただけるかも"


@pytest.mark.asyncio
async def test_generator_writes_failed_on_exception():
    class FailingLLM:
        provider_name = "mock"

        async def complete(self, *, system, messages, temperature=0.7):
            raise RuntimeError("boom")

        async def stream(self, *, system, messages, temperature=0.7):
            if False:
                yield ""

        async def aclose(self):
            pass

    c = NudgeCache(ttl=60)
    gen = NudgeMessageGenerator(llm=FailingLLM(), cache=c)
    await gen.generate(decision_id="d1", proposal_text="x", choice="no", no_streak=2)
    cached = c.get("d1")
    assert cached.status == "failed"
    assert cached.message  # fallback メッセージ
