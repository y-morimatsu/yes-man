"""GET /v1/scores/me — 委任度スコア (FR-SCORE-01〜04、ratio = Yes 比率)."""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends

from yesman_api.domain.auth.models import AuthenticatedUser
from yesman_api.domain.decision.scorer import AutonomyScorer
from yesman_api.interface.deps import (
    ensure_demo_seeded_dep,
    get_autonomy_scorer,
    get_current_user,
)
from yesman_api.interface.http.dto.decision import (
    ScoreHistoryPointResponse,
    ScoreResponse,
)

router = APIRouter(prefix="/v1/scores", tags=["scores"])


@router.get("/me", response_model=ScoreResponse)
async def get_my_score(
    user: AuthenticatedUser = Depends(get_current_user),
    scorer: AutonomyScorer = Depends(get_autonomy_scorer),
    _demo_seed: None = Depends(ensure_demo_seeded_dep),
) -> ScoreResponse:
    from yesman_api.domain.decision import demo_mode

    summary = await scorer.compute(UUID(user.sub))
    history = [
        ScoreHistoryPointResponse(date=p.date, yes_ratio=p.yes_ratio, total=p.total)
        for p in summary.history
    ]
    # Demo mode: 「人生の 73% を委任」+ ドメイン内訳。total は実 seed 件数、
    # Yes/No は ratio 0.73 と整合するよう導出 (総決定 = Yes + No が 73% に一致)。
    if demo_mode.is_demo_user(user.email):
        total = summary.total
        no_count = round(total * (1 - demo_mode.DEMO_SCORE_RATIO)) if total else 0
        # 推移グラフは開始日 (DEMO_SEED_START_DATE) 以降に絞る
        # (scorer は固定 30 日窓を返すため、demo では 5/15 起点に truncate)
        start_iso = demo_mode.DEMO_SEED_START_DATE.isoformat()
        demo_history = [h for h in history if str(h.date) >= start_iso]
        return ScoreResponse(
            no_count=no_count,
            total=total,
            ratio=demo_mode.DEMO_SCORE_RATIO,
            message="あなたは人生の 73% を AI に委ねています。",
            history=demo_history,
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
