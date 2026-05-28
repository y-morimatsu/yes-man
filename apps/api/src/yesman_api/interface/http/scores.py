"""GET /v1/scores/me — 委任度スコア (FR-SCORE-01〜04、ratio = Yes 比率)."""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends

from yesman_api.domain.auth.models import AuthenticatedUser
from yesman_api.domain.decision.scorer import AutonomyScorer
from yesman_api.interface.deps import get_autonomy_scorer, get_current_user
from yesman_api.interface.http.dto.decision import (
    ScoreHistoryPointResponse,
    ScoreResponse,
)

router = APIRouter(prefix="/v1/scores", tags=["scores"])


@router.get("/me", response_model=ScoreResponse)
async def get_my_score(
    user: AuthenticatedUser = Depends(get_current_user),
    scorer: AutonomyScorer = Depends(get_autonomy_scorer),
) -> ScoreResponse:
    from yesman_api.domain.decision import demo_mode

    summary = await scorer.compute(UUID(user.sub))
    history = [
        ScoreHistoryPointResponse(date=p.date, yes_ratio=p.yes_ratio, total=p.total)
        for p in summary.history
    ]
    # Demo mode: 「人生の 73% を委任」+ ドメイン内訳 (履歴は実 seed を流用)
    if demo_mode.is_demo_user(user.email):
        return ScoreResponse(
            no_count=summary.no_count,
            total=summary.total,
            ratio=demo_mode.DEMO_SCORE_RATIO,
            message="あなたは人生の 73% を AI に委ねています。",
            history=history,
            breakdown=dict(demo_mode.DEMO_SCORE_BREAKDOWN),
        )
    return ScoreResponse(
        no_count=summary.no_count,
        total=summary.total,
        ratio=summary.ratio,
        message=summary.message,
        history=history,
    )


__all__ = ["router"]
