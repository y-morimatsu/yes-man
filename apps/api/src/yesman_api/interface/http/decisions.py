"""Decision API endpoints (FR-AI, FR-CV, FR-NUDGE, FR-NO).

NFR Design §6 + ultrathink Imp2 (SSE start event 事前 decision_id) + Imp3 (Nudge TTL 切れ 410) 反映.
"""
from __future__ import annotations

import json
from collections import defaultdict
from typing import Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse

from yesman_api.application.persistence.protocols import DecisionRepository
from yesman_api.domain.auth.models import AuthenticatedUser
from yesman_api.domain.decision.engine import DecisionEngine
from yesman_api.domain.persistence.models import Decision
from yesman_api.domain.decision.errors import DecisionError
from yesman_api.domain.decision.models import DecisionRequest, SelectedPersonaRef
from yesman_api.domain.decision.nudge import NudgeCache, NudgeMessageGenerator
from yesman_api.interface.deps import (
    get_current_user,
    get_decision_engine,
    get_decision_repo,
    get_nudge_cache,
    get_nudge_generator,
)
from yesman_api.interface.http.dto.decision import (
    ChoiceRequest,
    ChoiceResponse,
    DecisionHistoryItemDTO,
    DecisionHistoryResponse,
    DecisionRequestDTO,
    DecisionResponse,
    NudgeResponse,
    UtteranceDTO,
    YesNudgeRequest,
    YesNudgeResponse,
)

router = APIRouter(prefix="/v1/decisions", tags=["decisions"])


def _build_domain_request(payload: DecisionRequestDTO, user_id: UUID) -> DecisionRequest:
    """2026-05-24 v4: DTO → DecisionRequest 変換. selected_personas を含めて伝搬."""
    selected_refs = tuple(
        SelectedPersonaRef(source=p.source, id=p.id)
        for p in (payload.selected_personas or [])
    )
    return DecisionRequest(
        user_id=user_id,
        user_input=payload.user_input,
        selected_persona_ids=payload.selected_persona_ids or [],
        chain_context=tuple(payload.chain_context or ()),
        persona_source=payload.persona_source,
        selected_personas=selected_refs,
    )


# ============================================================
# 非ストリーミング合議
# ============================================================
@router.post("/request", response_model=DecisionResponse)
async def request_decision(
    payload: DecisionRequestDTO,
    user: AuthenticatedUser = Depends(get_current_user),
    engine: DecisionEngine = Depends(get_decision_engine),
) -> DecisionResponse:
    request = _build_domain_request(payload, UUID(user.sub))
    try:
        decision_id, consensus, no_attempt_count = await engine.run(request)
    except DecisionError as exc:
        raise HTTPException(status_code=502, detail={"reason": exc.reason, "detail": exc.detail})
    return DecisionResponse(
        decision_id=decision_id,
        domain=consensus.domain_classification,
        utterances=[
            UtteranceDTO(persona_id=u.persona_id, persona_name=u.persona_name, text=u.text)
            for u in consensus.utterances
        ],
        proposal_text=consensus.proposal_text,
        nudge_url=f"/v1/decisions/{decision_id}/nudge",
        no_attempt_count=no_attempt_count,
    )


# ============================================================
# SSE ストリーミング合議
# ============================================================
def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


@router.post("/request/stream")
async def request_decision_stream(
    payload: DecisionRequestDTO,
    user: AuthenticatedUser = Depends(get_current_user),
    engine: DecisionEngine = Depends(get_decision_engine),
) -> StreamingResponse:
    request = _build_domain_request(payload, UUID(user.sub))
    decision_id = uuid4()  # ultrathink Imp2: SSE start event で client に事前通知

    async def event_stream():
        yield _sse("start", {"decision_id": str(decision_id)})
        try:
            async for event in engine.run_stream(decision_id=decision_id, request=request):
                yield _sse(event.type, event.data)
        except DecisionError as exc:
            yield _sse("error", {"reason": exc.reason, "detail": exc.detail})

    return StreamingResponse(event_stream(), media_type="text/event-stream")


# ============================================================
# Yes/No 採択
# ============================================================
@router.post("/{decision_id}/choice", response_model=ChoiceResponse)
async def choose(
    decision_id: UUID,
    payload: ChoiceRequest,
    background_tasks: BackgroundTasks,
    user: AuthenticatedUser = Depends(get_current_user),
    engine: DecisionEngine = Depends(get_decision_engine),
    nudge_gen: NudgeMessageGenerator = Depends(get_nudge_generator),
) -> ChoiceResponse:
    try:
        decision, no_count = await engine.apply_choice(
            decision_id=decision_id,
            user_id=UUID(user.sub),
            choice=payload.choice,
        )
    except DecisionError as exc:
        if exc.reason == "decision_not_found":
            raise HTTPException(status_code=404, detail="decision not found")
        raise HTTPException(status_code=502, detail={"reason": exc.reason})

    # Nudge は非同期生成 (NFR Req I5 / FR-NUDGE-05)
    no_streak = no_count if payload.choice == "no" else 0
    background_tasks.add_task(
        nudge_gen.generate,
        decision_id=str(decision_id),
        proposal_text=decision.proposal_text,
        choice=payload.choice,
        no_streak=no_streak,
    )

    return ChoiceResponse(
        decision_id=decision_id,
        nudge_url=f"/v1/decisions/{decision_id}/nudge",
        no_attempt_count=decision.no_attempt_count,
    )


# ============================================================
# Nudge polling
# ============================================================
# ============================================================
# issue #93: YES nudge microcopy (No 採択 → 別案到着後の Yes 後押し)
# ============================================================
@router.post(
    "/{decision_id}/yes-nudge",
    response_model=YesNudgeResponse,
)
async def generate_yes_nudge(
    decision_id: UUID,
    payload: YesNudgeRequest,
    user: AuthenticatedUser = Depends(get_current_user),
    decision_repo: DecisionRepository = Depends(get_decision_repo),
    nudge_gen: NudgeMessageGenerator = Depends(get_nudge_generator),
) -> YesNudgeResponse:
    """No 採択 → 新 proposal 到着直後に呼ばれる同期 endpoint。

    decision_id は **新 proposal** の decision_id。stage は frontend が把握する No 累積回数。
    LLM で <= 30 字の Yes nudge microcopy を生成、2s timeout 超過や失敗時は stage 別 fallback。
    """
    decision = await decision_repo.get(decision_id)
    if decision is None or decision.user_id != UUID(user.sub):
        raise HTTPException(status_code=404, detail="decision not found")
    message = await nudge_gen.generate_yes_microcopy(
        proposal_text=decision.proposal_text,
        stage=payload.stage,
    )
    return YesNudgeResponse(message=message)


@router.get("/{decision_id}/nudge")
async def get_nudge(
    decision_id: UUID,
    request: Request,
    user: AuthenticatedUser = Depends(get_current_user),
    cache: NudgeCache = Depends(get_nudge_cache),
    decision_repo: DecisionRepository = Depends(get_decision_repo),
):
    """ultrathink Imp3 反映: TTL 切れは 410 Gone (FE 再発火抑止)."""
    # SEC-U4-09: 所有者検証
    decision = await decision_repo.get(decision_id)
    if decision is None or decision.user_id != UUID(user.sub):
        raise HTTPException(status_code=404, detail="decision not found")

    cached = cache.get(str(decision_id))
    if cached is None:
        # decision はあるが nudge cache に無い → TTL 切れ
        raise HTTPException(status_code=410, detail="nudge expired")

    if cached.status == "pending":
        return _json_response({"status": "pending", "message": None}, status_code=202)
    return NudgeResponse(status=cached.status, message=cached.message)


def _json_response(data: dict, *, status_code: int):
    from fastapi.responses import JSONResponse

    return JSONResponse(content=data, status_code=status_code)


# ============================================================
# 履歴一覧 (FR-HIST-01)
# ============================================================
RAW_CAP_FOR_ATTEMPT_COUNT = 1000


@router.get("", response_model=DecisionHistoryResponse)
async def list_decisions(
    user: AuthenticatedUser = Depends(get_current_user),
    repo: DecisionRepository = Depends(get_decision_repo),
    limit: int = Query(default=20, ge=1, le=100),
    choice: Literal["yes", "no", "all"] = Query(default="yes"),
) -> DecisionHistoryResponse:
    """Yes 採択履歴 (デフォルト 20 件) + attempt_count (同 user_input_hash 内の試行順)."""
    user_id = UUID(user.sub)

    # Step 1: 全 decision を created_at 昇順で fetch (cap 1000 件)
    all_raw = await repo.list_by_user(
        user_id, limit=RAW_CAP_FOR_ATTEMPT_COUNT, order_by="created_at_asc",
    )

    # Step 2: user_input_hash で group して attempt_count を 1-indexed で計算
    attempt_idx: dict[str, int] = defaultdict(int)
    enriched: list[tuple[Decision, int]] = []
    for d in all_raw:
        attempt_idx[d.user_input_hash] += 1
        enriched.append((d, attempt_idx[d.user_input_hash]))

    # Step 3: choice filter + created_at 降順
    filtered = [
        (d, idx) for d, idx in enriched
        if choice == "all" or d.user_choice == choice
    ]
    filtered.sort(key=lambda x: x[0].created_at, reverse=True)

    # Step 4: limit 件 → DTO
    items = [
        DecisionHistoryItemDTO(
            id=str(d.id),
            user_input=d.user_input,
            proposal_text=d.proposal_text,
            user_choice=d.user_choice,
            attempt_count=idx,
            created_at=d.created_at,
        )
        for d, idx in filtered[:limit]
    ]
    return DecisionHistoryResponse(items=items, limit=limit)


__all__ = ["router"]
