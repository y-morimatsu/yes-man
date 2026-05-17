"""Profile CRUD endpoints — /v1/profiles/me (FR-AUTH-02, FR-AUTH-04).

FD §5 + §6 通り、ProfileRepository.upsert で create/update を兼ねる (U2 protocols.py L48-51)。
SEC-U3-10: PATCH/DELETE 時に `audit.profile.{action}` を構造化ログ出力 (email を出さない、sub のみ)。
"""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from yesman_api.application.persistence.protocols import ProfileRepository
from yesman_api.domain.auth.models import AuthenticatedUser
from yesman_api.domain.persistence.models import Profile
from yesman_api.interface.deps import get_current_user, get_profile_repo
from yesman_api.interface.http.dto.profile import ProfileResponse, ProfileUpdateRequest
from yesman_api.shared.logging import audit_log

router = APIRouter(prefix="/v1/profiles", tags=["profiles"])


@router.get("/me", response_model=ProfileResponse)
async def get_my_profile(
    user: AuthenticatedUser = Depends(get_current_user),
    repo: ProfileRepository = Depends(get_profile_repo),
) -> ProfileResponse:
    """自分の Profile を取得。未存在なら空 Profile を自動作成 (FD §5.1 get-or-create)."""
    user_id = UUID(user.sub)
    profile = await repo.get(user_id)
    if profile is None:
        profile = Profile(user_id=user_id, email=user.email)
        profile = await repo.upsert(profile)
    return ProfileResponse.model_validate(profile)


@router.patch("/me", response_model=ProfileResponse)
async def update_my_profile(
    payload: ProfileUpdateRequest,
    user: AuthenticatedUser = Depends(get_current_user),
    repo: ProfileRepository = Depends(get_profile_repo),
) -> ProfileResponse:
    """自分の Profile を部分更新。未存在なら 404 (= GET を先に呼ぶこと)."""
    user_id = UUID(user.sub)
    existing = await repo.get(user_id)
    if existing is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="profile not initialized",
        )
    changes = payload.model_dump(exclude_unset=True)
    for field, value in changes.items():
        setattr(existing, field, value)
    saved = await repo.upsert(existing)
    audit_log(
        "audit.profile.updated",
        sub=user.sub,
        backend=user.backend,
        changed_fields=sorted(changes.keys()),
    )
    return ProfileResponse.model_validate(saved)


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
async def delete_my_profile(
    user: AuthenticatedUser = Depends(get_current_user),
    repo: ProfileRepository = Depends(get_profile_repo),
) -> None:
    """自分の Profile を削除 (FR-AUTH-04)。関連レコードは U2 ForeignKey Cascade で連動削除。"""
    user_id = UUID(user.sub)
    await repo.delete(user_id)
    audit_log("audit.profile.deleted", sub=user.sub, backend=user.backend)
    return None


__all__ = ["router"]
