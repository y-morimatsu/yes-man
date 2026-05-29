"""Unit tests for MockLLMProvider._pick_proposal / aclose (drill-down chain 解析)."""
from __future__ import annotations

from yesman_api.infrastructure.decision.llm_providers.mock_adapter import MockLLMProvider


def test_pick_proposal_no_marker_returns_default() -> None:
    llm = MockLLMProvider()
    out = llm._pick_proposal([{"content": "マーカーなしの普通の入力"}])
    assert isinstance(out, str) and out


def test_pick_proposal_with_chain_marker() -> None:
    llm = MockLLMProvider()
    out = llm._pick_proposal(
        [{"content": "[これまでの絞り込み: 配信で観る → ドラマ]\n元の要望: 映画を観たい"}]
    )
    assert isinstance(out, str) and out


def test_pick_proposal_unclosed_marker_returns_default() -> None:
    llm = MockLLMProvider()
    out = llm._pick_proposal([{"content": "[これまでの絞り込み: 閉じ括弧なし"}])
    assert isinstance(out, str) and out


async def test_aclose_noop() -> None:
    llm = MockLLMProvider()
    assert await llm.aclose() is None
