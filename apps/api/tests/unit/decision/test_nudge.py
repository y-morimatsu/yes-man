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
