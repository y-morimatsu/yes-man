"""Unit tests for NudgeCache / NudgeMessageGenerator (domain/decision/nudge.py).

LLM は AsyncMock。cache lifecycle / TTL 期限切れ / disabled fallback / 生成成功 /
LLM 失敗 fallback / yes-microcopy stage 別を、外部呼び出しなしで網羅する。
"""
from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from yesman_api.domain.decision.nudge import (
    NudgeCache,
    NudgeMessageGenerator,
    _yes_nudge_fallback,
)


@pytest.mark.parametrize(
    ("stage", "contains"),
    [(0, "もう一案"), (1, "もう一案"), (2, "ご納得"), (3, "こだわり"), (5, "任せてみる勇気")],
)
def test_yes_nudge_fallback(stage: int, contains: str) -> None:
    assert contains in _yes_nudge_fallback(stage)


def test_cache_lifecycle() -> None:
    cache = NudgeCache(ttl=100.0)
    assert cache.get("d") is None
    cache.set_pending("d")
    assert cache.get("d").status == "pending"
    cache.set_ready("d", "メッセージ")
    ready = cache.get("d")
    assert ready.status == "ready" and ready.message == "メッセージ"
    cache.set_failed("d", "fb")
    assert cache.get("d").status == "failed"


def test_cache_expiry_returns_none() -> None:
    cache = NudgeCache(ttl=-1.0)  # 即時期限切れ
    cache.set_ready("d", "msg")
    assert cache.get("d") is None


async def test_generate_disabled_sets_ready_fallback() -> None:
    cache = NudgeCache(ttl=100.0)
    gen = NudgeMessageGenerator(llm=AsyncMock(), cache=cache, enabled=False)
    await gen.generate(decision_id="d", proposal_text="p", choice="no", no_streak=1)
    assert cache.get("d").status == "ready"


async def test_generate_success_sets_ready() -> None:
    cache = NudgeCache(ttl=100.0)
    llm = AsyncMock()
    llm.complete = AsyncMock(return_value="  生成メッセージ  ")
    gen = NudgeMessageGenerator(llm=llm, cache=cache, enabled=True)
    await gen.generate(decision_id="d", proposal_text="p", choice="yes", no_streak=0)
    cached = cache.get("d")
    assert cached.status == "ready" and cached.message == "生成メッセージ"


@pytest.mark.parametrize("no_streak", [1, 2, 3])
async def test_generate_no_choice_branches(no_streak: int) -> None:
    cache = NudgeCache(ttl=100.0)
    llm = AsyncMock()
    llm.complete = AsyncMock(return_value="再考メッセージ")
    gen = NudgeMessageGenerator(llm=llm, cache=cache, enabled=True)
    await gen.generate(decision_id="d", proposal_text="p", choice="no", no_streak=no_streak)
    assert cache.get("d").status == "ready"


async def test_generate_llm_failure_sets_failed() -> None:
    cache = NudgeCache(ttl=100.0)
    llm = AsyncMock()
    llm.complete = AsyncMock(side_effect=RuntimeError("llm down"))
    gen = NudgeMessageGenerator(llm=llm, cache=cache, enabled=True)
    await gen.generate(decision_id="d", proposal_text="p", choice="no", no_streak=2)
    assert cache.get("d").status == "failed"


@pytest.mark.parametrize("stage", [0, 2, 3, 5])
async def test_yes_microcopy_disabled_returns_fallback(stage: int) -> None:
    gen = NudgeMessageGenerator(llm=AsyncMock(), cache=NudgeCache(ttl=10), enabled=False)
    out = await gen.generate_yes_microcopy(proposal_text="p", stage=stage)
    assert out == _yes_nudge_fallback(stage)


async def test_yes_microcopy_success() -> None:
    llm = AsyncMock()
    llm.complete = AsyncMock(return_value="Yes へ そっと一押し")
    gen = NudgeMessageGenerator(llm=llm, cache=NudgeCache(ttl=10), enabled=True)
    out = await gen.generate_yes_microcopy(proposal_text="p", stage=2)
    assert out == "Yes へ そっと一押し"


async def test_yes_microcopy_empty_falls_back() -> None:
    llm = AsyncMock()
    llm.complete = AsyncMock(return_value="   ")
    gen = NudgeMessageGenerator(llm=llm, cache=NudgeCache(ttl=10), enabled=True)
    out = await gen.generate_yes_microcopy(proposal_text="p", stage=1)
    assert out == _yes_nudge_fallback(1)


async def test_yes_microcopy_llm_failure_falls_back() -> None:
    llm = AsyncMock()
    llm.complete = AsyncMock(side_effect=RuntimeError("x"))
    gen = NudgeMessageGenerator(llm=llm, cache=NudgeCache(ttl=10), enabled=True)
    out = await gen.generate_yes_microcopy(proposal_text="p", stage=5)
    assert out == _yes_nudge_fallback(5)
