"""UserPersonaSelection API endpoints (U-Persona FR-PERSONA-03/10).

3 endpoint: GET (取得 + builtin fallback) / PUT (上限 3 検証) / DELETE (リセット).
"""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from yesman_api.domain.auth.models import AuthenticatedUser
from yesman_api.domain.persona.catalog import PersonaCatalogService
from yesman_api.domain.persona.errors import PersonaError
from yesman_api.interface.deps import get_current_user, get_persona_catalog
from yesman_api.interface.http.dto.persona import (
    PersonaSelectionResponse,
    PersonaSelectionUpdateRequest,
)
from yesman_api.shared.logging import audit_log

router = APIRouter(prefix="/v1/persona-selections", tags=["persona-selections"])


@router.get("/me", response_model=PersonaSelectionResponse)
async def get_my_selection(
    user: AuthenticatedUser = Depends(get_current_user),
    catalog: PersonaCatalogService = Depends(get_persona_catalog),
) -> PersonaSelectionResponse:
    persona_ids = await catalog.get_selection(UUID(user.sub))
    return PersonaSelectionResponse(persona_ids=persona_ids)


@router.put("/me", response_model=PersonaSelectionResponse)
async def set_my_selection(
    payload: PersonaSelectionUpdateRequest,
    user: AuthenticatedUser = Depends(get_current_user),
    catalog: PersonaCatalogService = Depends(get_persona_catalog),
) -> PersonaSelectionResponse:
    user_id = UUID(user.sub)
    try:
        await catalog.set_selection(user_id=user_id, persona_ids=payload.persona_ids)
    except PersonaError as exc:
        if exc.reason in ("invalid_selection_size", "duplicate_personas"):
            raise HTTPException(status_code=422, detail={"reason": exc.reason})
        if exc.reason == "persona_not_accessible":
            raise HTTPException(
                status_code=422,
                detail={"reason": exc.reason, "persona_id": exc.detail},
            )
        raise HTTPException(status_code=400, detail={"reason": exc.reason})

    audit_log(
        "audit.persona_selection.updated",
        sub=user.sub,
        count=len(payload.persona_ids),
    )
    return PersonaSelectionResponse(persona_ids=payload.persona_ids)


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
async def reset_my_selection(
    user: AuthenticatedUser = Depends(get_current_user),
    catalog: PersonaCatalogService = Depends(get_persona_catalog),
) -> None:
    """ultrathink FD I5: DELETE 経由で builtin 3 種に戻す."""
    await catalog.reset_selection(UUID(user.sub))
    audit_log("audit.persona_selection.reset", sub=user.sub)
    return None


__all__ = ["router"]
