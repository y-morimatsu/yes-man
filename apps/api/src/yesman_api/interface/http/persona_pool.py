"""/v1/persona-pool/* endpoints (anonymous-strangers Task 1).

派生元: aidlc-docs/inception/anonymous-strangers/application-design.md §3 Architecture.

5 endpoint + 1 status endpoint:
  GET    /v1/persona-pool/me            — 現在 opt-in 状態 + preview + guard
  POST   /v1/persona-pool/opt-in        — derive + 422 if signal_total < MIN_SIGNAL_TOTAL
  DELETE /v1/persona-pool/opt-in
  GET    /v1/persona-pool/random?n=2    — server 側で exclude=user.sub 自動 (NFR-6)
  GET    /v1/persona-pool/me/citations  — 今日 N 件 / all_time
  GET    /v1/persona-pool/cited-by-me   — 過去合議で呼んだ anonymous persona list
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status

from pydantic import BaseModel, ConfigDict, Field

from yesman_api.application.learning.anonymous_seed import derive_spec
from yesman_api.application.persistence.protocols import (
    PreferenceProfileRepository,
    ProfileRepository,
)
from yesman_api.domain.auth.models import AuthenticatedUser
from yesman_api.domain.persona_pool.models import (
    MIN_SIGNAL_TOTAL,
    AnonymousPersonaSpec,
)
from yesman_api.domain.persona_pool.protocols import PoolRepository
from yesman_api.interface.deps import (
    get_current_user,
    get_preference_repo,
    get_profile_repo,
)
from yesman_api.interface.http.dto.persona_pool import (
    AnonymousPersonaDTO,
    CitationCountResponse,
    CitedHistoryResponse,
    PoolGuardInfo,
    PoolStatusResponse,
    RandomPoolResponse,
)


# ============================================================
# Error response DTO (I-3 fix: OpenAPI docs に 422 schema を明示)
# ============================================================
class InsufficientSignalsDetail(BaseModel):
    model_config = ConfigDict(frozen=True)

    code: str = Field(default="insufficient_profile_signals")
    signal_total: int = Field(ge=0)
    min_required: int = Field(default=MIN_SIGNAL_TOTAL, ge=0)
    hint: str


class InsufficientSignalsResponse(BaseModel):
    """422 response body for opt-in when FR-9 guard fails."""

    model_config = ConfigDict(frozen=True)

    detail: InsufficientSignalsDetail

router = APIRouter(prefix="/v1/persona-pool", tags=["persona-pool"])


def get_anonymous_pool(request: Request) -> PoolRepository:
    """app-scoped MockPoolRepository (main.py lifespan で初期化)."""
    pool = getattr(request.app.state, "anonymous_pool", None)
    if pool is None:
        raise RuntimeError(
            "anonymous_pool not initialized. Check main.py lifespan setup."
        )
    return pool


async def _derive_preview(
    *,
    sub: str,
    pref_repo: PreferenceProfileRepository,
    profile_repo: ProfileRepository,
) -> AnonymousPersonaSpec | None:
    """preference + profile から spec を派生 (preview / opt-in 共通).

    I-1 fix: sub を derive_spec に渡すことで persona_id を deterministic に確定.
    """
    from uuid import UUID as _UUID

    from yesman_api.domain.learning.cold_start import ColdStartEstimator
    from yesman_api.domain.learning.loader import PreferenceProfileLoader

    user_id = _UUID(sub)
    profile = await profile_repo.get(user_id)
    loader = PreferenceProfileLoader(
        preference_repo=pref_repo,
        profile_repo=profile_repo,
        cold_start=ColdStartEstimator(),
    )
    pref = await loader.load(user_id)
    return derive_spec(sub=sub, preference=pref, profile=profile)


@router.get("/me", response_model=PoolStatusResponse)
async def get_my_pool_status(
    user: AuthenticatedUser = Depends(get_current_user),
    pool: PoolRepository = Depends(get_anonymous_pool),
    pref_repo: PreferenceProfileRepository = Depends(get_preference_repo),
    profile_repo: ProfileRepository = Depends(get_profile_repo),
) -> PoolStatusResponse:
    """opt-in 状態 + 流通対象 preview + FR-9 guard 情報を返す.

    US-2.3 AC-1: OFF 状態でも preview 表示
    US-2.4 AC-1/2: guard 不足時 is_eligible=false
    """
    opted = pool.has_optin(user.sub)
    current = pool.get_spec_for_sub(user.sub) if opted else None
    # preview は always derive (opt-out 中でも UI で見せる、US-2.3 AC-1)
    preview = current or await _derive_preview(
        sub=user.sub, pref_repo=pref_repo, profile_repo=profile_repo
    )
    signal_total = preview.signal_total if preview else 0
    return PoolStatusResponse(
        opted_in=opted,
        preview=AnonymousPersonaDTO.from_spec(preview) if preview else None,
        guard=PoolGuardInfo(
            signal_total=signal_total,
            min_required=MIN_SIGNAL_TOTAL,
            is_eligible=signal_total >= MIN_SIGNAL_TOTAL,
        ),
    )


@router.post(
    "/opt-in",
    response_model=AnonymousPersonaDTO,
    status_code=status.HTTP_200_OK,
    responses={
        422: {
            "model": InsufficientSignalsResponse,
            "description": "FR-9 guard: signal_total < MIN_SIGNAL_TOTAL",
        }
    },
)
async def opt_in_my_persona(
    user: AuthenticatedUser = Depends(get_current_user),
    pool: PoolRepository = Depends(get_anonymous_pool),
    pref_repo: PreferenceProfileRepository = Depends(get_preference_repo),
    profile_repo: ProfileRepository = Depends(get_profile_repo),
) -> AnonymousPersonaDTO:
    """preference + profile から spec を derive → guard チェック → pool 登録.

    FR-9 / US-2.4: signal_total < MIN_SIGNAL_TOTAL は 422.
    """
    spec = await _derive_preview(
        sub=user.sub, pref_repo=pref_repo, profile_repo=profile_repo
    )
    if spec is None or spec.signal_total < MIN_SIGNAL_TOTAL:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "insufficient_profile_signals",
                "signal_total": spec.signal_total if spec else 0,
                "min_required": MIN_SIGNAL_TOTAL,
                "hint": "嗜好把握が足りないので公開できません。何回か決定を試してみてください",
            },
        )
    saved = pool.opt_in(user.sub, spec)
    return AnonymousPersonaDTO.from_spec(saved)


@router.delete("/opt-in", status_code=status.HTTP_204_NO_CONTENT)
async def opt_out_my_persona(
    user: AuthenticatedUser = Depends(get_current_user),
    pool: PoolRepository = Depends(get_anonymous_pool),
) -> None:
    """Pool から除外 (idempotent: 未 opt-in でも 204)."""
    pool.opt_out(user.sub)
    return None


@router.get("/list", response_model=RandomPoolResponse)
async def list_for_selection(
    limit: int = Query(default=20, ge=1, le=100),
    user: AuthenticatedUser = Depends(get_current_user),
    pool: PoolRepository = Depends(get_anonymous_pool),
) -> RandomPoolResponse:
    """2026-05-24 v4: selection UI 用 — caller exclude した anonymous persona 一覧.

    NFR-6 + 「自分を世界の誰かから除外」整合: caller 自身の persona は含めない.
    response 形式は /random と同じ RandomPoolResponse を流用.
    """
    specs = pool.list_for_selection(excluding_sub=user.sub, limit=limit)
    return RandomPoolResponse(
        personas=[AnonymousPersonaDTO.from_spec(s) for s in specs]
    )


@router.get("/me/citations", response_model=CitationCountResponse)
async def get_my_citations(
    user: AuthenticatedUser = Depends(get_current_user),
    pool: PoolRepository = Depends(get_anonymous_pool),
) -> CitationCountResponse:
    """US-2.2 「今日 N 件」 + 累計."""
    today_start = datetime.now(timezone.utc) - timedelta(hours=24)
    return CitationCountResponse(
        today_count=pool.count_citations_for_sub(user.sub, since=today_start),
        all_time_count=pool.count_citations_for_sub(user.sub),
    )


@router.get("/cited-by-me", response_model=CitedHistoryResponse)
async def get_cited_by_me(
    user: AuthenticatedUser = Depends(get_current_user),
    pool: PoolRepository = Depends(get_anonymous_pool),
) -> CitedHistoryResponse:
    """US-3.1 過去の世界の誰か list (自分の合議で召喚した persona の履歴)."""
    citations = pool.list_citations_by_user(user.sub)
    # persona spec を lookup table 化
    spec_lookup: dict[UUID, AnonymousPersonaSpec] = {
        spec.persona_id: spec for spec in pool.list_all()
    }
    return CitedHistoryResponse.build(citations=citations, spec_lookup=spec_lookup)


__all__ = ["get_anonymous_pool", "router"]
