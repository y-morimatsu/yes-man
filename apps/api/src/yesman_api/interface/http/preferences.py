"""Preference CRUD endpoints — /v1/preferences/me (FR-LEARN-04).

NFR Design §6 + ultrathink FD Imp3 (PATCH clip) + Imp4 (DELETE → ColdStart 再推定) 反映.
"""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from yesman_api.application.persistence.protocols import PreferenceProfileRepository
from yesman_api.domain.auth.models import AuthenticatedUser
from yesman_api.domain.learning.cold_start import ColdStartEstimator
from yesman_api.domain.learning.loader import PreferenceProfileLoader
from yesman_api.domain.persistence.models import PreferenceProfile
from yesman_api.interface.deps import (
    ensure_demo_seeded_dep,
    get_current_user,
    get_preference_repo,
    get_profile_repo,
)
from yesman_api.interface.http.dto.preference import (
    PreferenceProfileResponse,
    PreferenceProfileUpdateRequest,
)

router = APIRouter(prefix="/v1/preferences", tags=["preferences"])


def _clip_persona_style(values: dict[str, float]) -> dict[str, float]:
    """ultrathink FD Imp3 + SEC-U5-06: persona_style_preference を [-1.0, 1.0] clip + 50 key 上限.

    50 key 超過時は |value| 降順で残す (insertion order ではなく強い嗜好を優先).
    同 |value| 内では元の insertion order を維持 (sort stability).
    """
    clipped = [(k, max(-1.0, min(1.0, float(v)))) for k, v in values.items()]
    if len(clipped) > 50:
        clipped.sort(key=lambda kv: abs(kv[1]), reverse=True)
        clipped = clipped[:50]
    return {k: v for k, v in clipped}


@router.get("/me", response_model=PreferenceProfileResponse)
async def get_my_preferences(
    user: AuthenticatedUser = Depends(get_current_user),
    pref_repo: PreferenceProfileRepository = Depends(get_preference_repo),
    profile_repo=Depends(get_profile_repo),
    _demo_seed: None = Depends(ensure_demo_seeded_dep),
) -> PreferenceProfileResponse:
    """ColdStart 一元発火 (Consumer 側では呼ばない、FD I1)."""
    user_id = UUID(user.sub)
    loader = PreferenceProfileLoader(
        preference_repo=pref_repo,
        profile_repo=profile_repo,
        cold_start=ColdStartEstimator(),
    )
    pref = await loader.load(user_id)
    return PreferenceProfileResponse.model_validate(pref)


@router.patch("/me", response_model=PreferenceProfileResponse)
async def update_my_preferences(
    payload: PreferenceProfileUpdateRequest,
    user: AuthenticatedUser = Depends(get_current_user),
    pref_repo: PreferenceProfileRepository = Depends(get_preference_repo),
    profile_repo=Depends(get_profile_repo),
) -> PreferenceProfileResponse:
    """部分更新 + サーバ側 clip 強制 (Imp3)."""
    user_id = UUID(user.sub)
    existing = await pref_repo.get(user_id)
    if existing is None:
        # まだ無ければ ColdStart で初期化
        loader = PreferenceProfileLoader(
            preference_repo=pref_repo,
            profile_repo=profile_repo,
            cold_start=ColdStartEstimator(),
        )
        existing = await loader.load(user_id)

    changes = payload.model_dump(exclude_unset=True)
    # persona_style_preference は clip 強制
    if "persona_style_preference" in changes and changes["persona_style_preference"] is not None:
        changes["persona_style_preference"] = _clip_persona_style(
            changes["persona_style_preference"]
        )
    for field, value in changes.items():
        if value is None:
            continue
        setattr(existing, field, value)
    saved = await pref_repo.upsert(existing)
    return PreferenceProfileResponse.model_validate(saved)


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
async def delete_my_preferences(
    user: AuthenticatedUser = Depends(get_current_user),
    pref_repo: PreferenceProfileRepository = Depends(get_preference_repo),
    profile_repo=Depends(get_profile_repo),
) -> None:
    """ultrathink FD Imp4: DELETE → ColdStart 再推定で再初期化 (完全空にしない)."""
    user_id = UUID(user.sub)
    profile = await profile_repo.get(user_id)
    if profile is None:
        await pref_repo.delete(user_id)
        return None
    estimator = ColdStartEstimator()
    fresh = estimator.estimate(profile)
    await pref_repo.upsert(fresh)
    return None


__all__ = ["router"]
