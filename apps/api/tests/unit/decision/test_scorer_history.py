"""Unit tests for AutonomyScorer._build_history / tier message (domain/decision/scorer.py).

MockDecisionRepository に Yes/No を投入し、30 日推移 history と tier 別 message を網羅する。
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

import pytest

from yesman_api.domain.decision.scorer import AutonomyScorer
from yesman_api.domain.persistence.models import Decision
from yesman_api.infrastructure.persistence.mock_repositories import (
    MockDecisionRepository,
    MockStore,
)


def _decision(uid: uuid.UUID, choice: str) -> Decision:
    return Decision(
        user_id=uid,
        domain_classification="daily",
        user_input="x",
        user_input_hash="h",
        proposal_text="p",
        user_choice=choice,
        llm_provider="mock",
        created_at=datetime.now(timezone.utc),
    )


async def _scorer_for(counts: dict[str, int]):  # noqa: ANN202
    store = MockStore()
    repo = MockDecisionRepository(store)
    uid = uuid.uuid4()
    for choice, n in counts.items():
        for _ in range(n):
            await repo.insert(_decision(uid, choice))
    return AutonomyScorer(decision_repo=repo), uid


async def test_compute_empty_history() -> None:
    scorer, uid = await _scorer_for({})
    summary = await scorer.compute(uid)
    assert summary.total == 0
    assert summary.ratio is None
    assert summary.history == []


async def test_compute_high_tier_with_history() -> None:
    scorer, uid = await _scorer_for({"yes": 8, "no": 2})
    summary = await scorer.compute(uid)
    assert summary.total == 10
    assert summary.no_count == 2
    assert summary.ratio == pytest.approx(0.8)
    assert "うまく任せられています" in summary.message
    assert len(summary.history) == 30
    assert summary.history[-1].total == 10
    assert summary.history[-1].yes_ratio == pytest.approx(0.8)


async def test_compute_mid_tier() -> None:
    scorer, uid = await _scorer_for({"yes": 5, "no": 5})
    summary = await scorer.compute(uid)
    assert summary.ratio == pytest.approx(0.5)
    assert "もう少し任せる余地" in summary.message


async def test_compute_low_tier() -> None:
    scorer, uid = await _scorer_for({"yes": 2, "no": 8})
    summary = await scorer.compute(uid)
    assert summary.ratio == pytest.approx(0.2)
    assert "もっと任せて" in summary.message
