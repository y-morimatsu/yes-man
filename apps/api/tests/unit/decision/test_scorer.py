"""AutonomyScorer — total=0 null / pending 除外 / Yes 比率 ratio."""
from __future__ import annotations

from uuid import uuid4

import pytest

from yesman_api.domain.decision.scorer import AutonomyScorer


class _StubRepo:
    def __init__(self, *, no_count: int, total: int):
        self.no_count = no_count
        self.total = total

    async def count_no_by_user(self, user_id):
        return {"no_count": self.no_count, "total": self.total}

    async def list_by_user(self, user_id, limit=100, offset=0, order_by="created_at_desc"):
        # scorer._build_history からのみ呼ばれる; 履歴は別途検証するのでここでは空
        return []


@pytest.mark.asyncio
async def test_total_zero_returns_null_ratio():
    scorer = AutonomyScorer(decision_repo=_StubRepo(no_count=0, total=0))
    result = await scorer.compute(uuid4())
    assert result.ratio is None
    assert "履歴がありません" in result.message


@pytest.mark.asyncio
async def test_high_yes_ratio_message():
    scorer = AutonomyScorer(decision_repo=_StubRepo(no_count=1, total=10))
    result = await scorer.compute(uuid4())
    assert result.ratio == 0.9
    assert "信頼" in result.message


@pytest.mark.asyncio
async def test_low_yes_ratio_message():
    scorer = AutonomyScorer(decision_repo=_StubRepo(no_count=7, total=10))
    result = await scorer.compute(uuid4())
    assert result.ratio == 0.3
    assert "Yes" in result.message
