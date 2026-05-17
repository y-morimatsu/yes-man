"""Persona API endpoints (U-Persona FR-PERSONA-01〜10).

NFR Design §6 + ultrathink C1 (list_my/builtin 分離) + I3 (DuplicateReportError → 409) 反映.
"""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status

from yesman_api.application.persistence.protocols import (
    DuplicateReportError,
    PersonaReportRepository,
    PersonaRepository,
)
from yesman_api.domain.auth.models import AuthenticatedUser
from yesman_api.domain.persistence.models import PersonaReport
from yesman_api.domain.persona.catalog import PersonaCatalogService
from yesman_api.domain.persona.errors import PersonaError
from yesman_api.interface.deps import (
    get_current_user,
    get_persona_catalog,
    get_persona_report_repo,
    get_persona_repo,
)
from yesman_api.interface.http.dto.persona import (
    PersonaCreateRequest,
    PersonaReportRequest,
    PersonaResponse,
    PersonaShareRequest,
    PersonaUpdateRequest,
    SharedPersonaSummaryResponse,
    SharedSortLiteral,
)
from yesman_api.shared.logging import audit_log

router = APIRouter(prefix="/v1/personas", tags=["personas"])


# ============================================================
# Error mapping
# ============================================================
def _raise_for_persona_error(exc: PersonaError) -> None:
    if exc.reason == "not_found":
        raise HTTPException(status_code=404, detail="persona not found")
    if exc.reason == "builtin_immutable":
        raise HTTPException(status_code=403, detail="builtin persona is immutable")
    if exc.reason == "blocked_immutable":
        raise HTTPException(status_code=403, detail="blocked persona is immutable")
    if exc.reason == "rejected_by_moderator":
        raise HTTPException(
            status_code=422,
            detail={"reason": exc.reason, "message": exc.detail},
        )
    raise HTTPException(status_code=400, detail={"reason": exc.reason})


# ============================================================
# Listings
# ============================================================
@router.get("/me", response_model=list[PersonaResponse])
async def list_my_personas(
    user: AuthenticatedUser = Depends(get_current_user),
    catalog: PersonaCatalogService = Depends(get_persona_catalog),
) -> list[PersonaResponse]:
    personas = await catalog.list_my_personas(UUID(user.sub))
    return [PersonaResponse.model_validate(p) for p in personas]


@router.get("/builtin", response_model=list[PersonaResponse])
async def list_builtin_personas(
    catalog: PersonaCatalogService = Depends(get_persona_catalog),
) -> list[PersonaResponse]:
    personas = await catalog.list_builtin_personas()
    return [PersonaResponse.model_validate(p) for p in personas]


@router.get("/shared", response_model=list[SharedPersonaSummaryResponse])
async def list_shared_personas(
    page: int = Query(default=0, ge=0),
    page_size: int = Query(default=20, ge=1, le=100),
    sort: SharedSortLiteral = Query(default="popularity"),
    catalog: PersonaCatalogService = Depends(get_persona_catalog),
    _user: AuthenticatedUser = Depends(get_current_user),
) -> list[SharedPersonaSummaryResponse]:
    summaries = await catalog.list_shared(page=page, page_size=page_size, sort=sort)
    return [
        SharedPersonaSummaryResponse(
            id=s.id,
            name=s.name,
            description=s.description,
            avatar_url=s.avatar_url,
            usage_count=s.usage_count,
            yes_acceptance_rate=s.yes_acceptance_rate,
            creator_anonymous_id=s.creator_anonymous_id,
        )
        for s in summaries
    ]


# ============================================================
# CRUD
# ============================================================
@router.post("/me", response_model=PersonaResponse, status_code=status.HTTP_201_CREATED)
async def create_persona(
    payload: PersonaCreateRequest,
    user: AuthenticatedUser = Depends(get_current_user),
    catalog: PersonaCatalogService = Depends(get_persona_catalog),
) -> PersonaResponse:
    try:
        persona = await catalog.create(
            owner_user_id=UUID(user.sub),
            name=payload.name,
            description=payload.description,
            prompt_text=payload.prompt_text,
            avatar_url=payload.avatar_url,
        )
    except PersonaError as exc:
        _raise_for_persona_error(exc)
    audit_log("audit.persona.created", sub=user.sub, persona_id=str(persona.id))
    return PersonaResponse.model_validate(persona)


@router.patch("/{persona_id}", response_model=PersonaResponse)
async def update_persona(
    persona_id: UUID,
    payload: PersonaUpdateRequest,
    user: AuthenticatedUser = Depends(get_current_user),
    catalog: PersonaCatalogService = Depends(get_persona_catalog),
) -> PersonaResponse:
    try:
        persona = await catalog.update(
            persona_id=persona_id,
            owner_user_id=UUID(user.sub),
            name=payload.name,
            description=payload.description,
            prompt_text=payload.prompt_text,
            avatar_url=payload.avatar_url,
        )
    except PersonaError as exc:
        _raise_for_persona_error(exc)
    audit_log("audit.persona.updated", sub=user.sub, persona_id=str(persona_id))
    return PersonaResponse.model_validate(persona)


@router.delete("/{persona_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_persona(
    persona_id: UUID,
    user: AuthenticatedUser = Depends(get_current_user),
    catalog: PersonaCatalogService = Depends(get_persona_catalog),
) -> None:
    try:
        await catalog.delete(persona_id=persona_id, owner_user_id=UUID(user.sub))
    except PersonaError as exc:
        _raise_for_persona_error(exc)
    audit_log("audit.persona.deleted", sub=user.sub, persona_id=str(persona_id))
    return None


@router.patch("/{persona_id}/share", response_model=PersonaResponse)
async def set_share(
    persona_id: UUID,
    payload: PersonaShareRequest,
    user: AuthenticatedUser = Depends(get_current_user),
    catalog: PersonaCatalogService = Depends(get_persona_catalog),
) -> PersonaResponse:
    try:
        persona = await catalog.set_shared(
            persona_id=persona_id,
            owner_user_id=UUID(user.sub),
            shared=payload.shared,
        )
    except PersonaError as exc:
        _raise_for_persona_error(exc)
    audit_log(
        "audit.persona.share_changed",
        sub=user.sub,
        persona_id=str(persona_id),
        shared=payload.shared,
    )
    return PersonaResponse.model_validate(persona)


# ============================================================
# Report (FR-PERSONA-08)
# ============================================================
@router.post("/{persona_id}/report", status_code=status.HTTP_201_CREATED)
async def report_persona(
    persona_id: UUID,
    payload: PersonaReportRequest,
    request: Request,
    user: AuthenticatedUser = Depends(get_current_user),
    persona_repo: PersonaRepository = Depends(get_persona_repo),
    report_repo: PersonaReportRepository = Depends(get_persona_report_repo),
) -> dict:
    """悪用報告. UNIQUE 制約違反 (同一 reporter) は 409.

    閾値到達時の AUTO_BLOCK は ultrathink Imp4 反映: app.state.config の閾値で
    count_by_persona を確認、超過時に persona_repo.block を呼ぶ.
    """
    persona = await persona_repo.get(persona_id)
    if persona is None:
        raise HTTPException(status_code=404, detail="persona not found")

    report = PersonaReport(
        persona_id=persona_id,
        reporter_user_id=UUID(user.sub),
        reason=payload.reason,
        detail=payload.detail,
    )
    try:
        await report_repo.insert(report)
    except DuplicateReportError:
        raise HTTPException(status_code=409, detail="already reported")

    audit_log(
        "audit.persona.reported",
        sub=user.sub,
        persona_id=str(persona_id),
        reason=payload.reason,
    )

    # AUTO_BLOCK 閾値判定 (ultrathink Imp4)
    config = getattr(request.app.state, "config", None)
    threshold = (
        getattr(config, "persona_report_auto_block_threshold", 5)
        if config is not None
        else 5
    )
    pending = await report_repo.count_by_persona(persona_id, status="pending")
    if pending >= threshold and not persona.is_blocked:
        await persona_repo.block(persona_id)
        audit_log(
            "audit.persona.auto_blocked",
            persona_id=str(persona_id),
            pending_reports=pending,
            threshold=threshold,
        )

    return {"status": "accepted", "pending_reports": pending}


__all__ = ["router"]
