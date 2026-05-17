"""Integration: 5 連続 No → score danger (U-Test FD §3.4).

Mock backend で Decision を 5 件直接 insert、count_no_by_user で no_count >= 5 + ratio = 1.0 を確認.
DecisionEngine の run 経由ではなく、Decision モデルを直接 insert する高速 path.
"""
from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID, uuid4

import pytest

from yesman_api.domain.persistence.models import Decision


@pytest.mark.asyncio
async def test_no_streak_5_triggers_danger(repo_bundle, test_user_id: str):
    """5 連続 No 採択 → no_count=5 / total=5 / ratio=1.0."""
    user_id = UUID(test_user_id)

    for i in range(5):
        decision = Decision(
            id=uuid4(),
            user_id=user_id,
            domain_classification="daily",
            user_input=f"テスト {i}",
            user_input_hash=f"hash-{i}",
            proposal_text=f"提案 {i}",
            persona_outputs={"効率派": "意見"},
            user_choice="no",
            no_attempt_count=1,
            llm_provider="mock",
            selected_persona_ids=[],
            created_at=datetime.now(timezone.utc),
        )
        await repo_bundle.decision.insert(decision)

    summary = await repo_bundle.decision.count_no_by_user(user_id)
    assert summary["no_count"] == 5
    assert summary["total"] == 5

    ratio = summary["no_count"] / summary["total"]
    assert ratio == 1.0
    # U7d ScorePage.scoreLevel.ts: no_count >= 5 → "danger"
    assert summary["no_count"] >= 5


@pytest.mark.asyncio
async def test_pending_decisions_excluded_from_score(repo_bundle, test_user_id: str):
    """pending 状態の Decision は count_no_by_user の total に含まれない (FD §8.3)."""
    user_id = UUID(test_user_id)

    for choice in ["pending", "pending", "yes", "no"]:
        await repo_bundle.decision.insert(
            Decision(
                user_id=user_id,
                domain_classification="daily",
                user_input="x",
                user_input_hash="h",
                proposal_text="p",
                persona_outputs={},
                user_choice=choice,
                no_attempt_count=0,
                llm_provider="mock",
                selected_persona_ids=[],
            )
        )

    summary = await repo_bundle.decision.count_no_by_user(user_id)
    # total は 2 (yes + no のみ、pending 除外)
    assert summary["total"] == 2
    assert summary["no_count"] == 1
