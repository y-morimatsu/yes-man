"""GET /v1/scores/me — 主体性スコア (FR-SCORE-01〜04)."""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends

from yesman_api.domain.auth.models import AuthenticatedUser
from yesman_api.domain.decision.scorer import AutonomyScorer
from yesman_api.interface.deps import get_autonomy_scorer, get_current_user
from yesman_api.interface.http.dto.decision import ScoreResponse

router = APIRouter(prefix="/v1/scores", tags=["scores"])


@router.get("/me", response_model=ScoreResponse)
async def get_my_score(
    user: AuthenticatedUser = Depends(get_current_user),
    scorer: AutonomyScorer = Depends(get_autonomy_scorer),
) -> ScoreResponse:
    summary = await scorer.compute(UUID(user.sub))
    return ScoreResponse(
        no_count=summary.no_count,
        total=summary.total,
        ratio=summary.ratio,
        message=summary.message,
    )


__all__ = ["router"]
