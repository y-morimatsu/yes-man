"""DecisionEngine — 合議の中核オーケストレーター.

FD §5 + NFR Design §8.2 (tee_chunks + best-effort background 永続化) + I6 (Yes/No 両方発火) 反映.

責務:
- run(request): 非ストリーミング合議
- run_stream(...): ストリーミング合議 (tee_chunks で SSE と永続化を分岐)
- apply_choice(...): Yes/No 採択 + EventPublisher.publish_decision_confirmed (両方発火)
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import AsyncIterator, Literal
from uuid import UUID, uuid4

from yesman_api.application.decision.event_publisher import EventPublisher
from yesman_api.application.decision.llm_provider import LLMProviderAdapter
from yesman_api.application.persistence.protocols import (
    DecisionRepository,
    PersonaRepository,
    ProfileRepository,
    SilenceLogRepository,
    UserPersonaSelectionRepository,
)
from yesman_api.domain.decision.consensus import ConsensusOrchestrator, tee_chunks
from yesman_api.domain.decision.errors import DecisionError
from yesman_api.domain.decision.models import (
    ConsensusOutput,
    DecisionRequest,
    StreamEvent,
)
from yesman_api.domain.decision.silence_guard import SilenceGuard
from yesman_api.domain.persistence.constants import SYSTEM_USER_ID
from yesman_api.domain.persistence.models import Decision, SilenceLog
from yesman_api.shared.logging import audit_log, get_logger
from yesman_api.shared.pii_filter import mask_pii


class DecisionEngine:
    def __init__(
        self,
        *,
        llm: LLMProviderAdapter,
        orchestrator: ConsensusOrchestrator,
        silence_guard: SilenceGuard,
        decision_repo: DecisionRepository,
        silence_repo: SilenceLogRepository,
        persona_repo: PersonaRepository,
        profile_repo: ProfileRepository,
        event_publisher: EventPublisher,
        preference_loader: object | None = None,  # U5 追加 (任意、U4 単体テストは None で動作)
        selection_repo: UserPersonaSelectionRepository | None = None,
    ) -> None:
        self._llm = llm
        self._orchestrator = orchestrator
        self._silence_guard = silence_guard
        self._decision_repo = decision_repo
        self._silence_repo = silence_repo
        self._persona_repo = persona_repo
        self._profile_repo = profile_repo
        self._event_publisher = event_publisher
        self._preference_loader = preference_loader  # U5 統合用
        self._selection_repo = selection_repo
        self._logger = get_logger("decision.engine")

    # ============================================================
    # 非ストリーミング合議
    # ============================================================
    async def run(self, request: DecisionRequest) -> tuple[UUID, ConsensusOutput, int]:
        """非ストリーミング: (decision_id, ConsensusOutput, no_attempt_count) を返す."""
        decision_id = uuid4()

        # 1. SilenceGuard
        verdict = await self._silence_guard.evaluate(user_input=request.user_input)
        if verdict.is_silenced:
            await self._record_silence(request, verdict.domain)
            silence_output = ConsensusOutput(
                domain_classification="silenced",
                utterances=[],
                proposal_text=verdict.response_text or "",
            )
            # 沈黙時は Decision を保存しない (FR-DM-SILENT、SilenceLog のみ)
            return decision_id, silence_output, 0

        # 2. ペルソナ取得
        personas = await self._resolve_personas(
            selected_ids=request.selected_persona_ids,
            user_id=request.user_id,
        )

        # 3. プロフィール + 嗜好プロファイル取得 (None なら空文字)
        profile = await self._profile_repo.get(request.user_id)
        profile_yaml = await self._format_profile_with_preferences(
            user_id=request.user_id, profile=profile
        )

        # 4. プロンプト構築 + LLM 呼び出し
        system = self._orchestrator.build_prompt(personas=personas, profile_yaml=profile_yaml)
        user_msg = self._orchestrator.wrap_user_input(mask_pii(request.user_input))
        llm_output = await self._llm.complete(
            system=system,
            messages=[{"role": "user", "content": user_msg}],
        )

        # 5. parse + 永続化
        consensus = self._orchestrator.parse(llm_output, personas=personas)
        if not consensus.utterances:
            audit_log(
                "audit.decision.parse_degraded",
                decision_id=str(decision_id),
                user_id=str(request.user_id),
            )

        decision = await self._persist_decision(decision_id, request, consensus, personas)
        return decision_id, consensus, decision.no_attempt_count

    # ============================================================
    # ストリーミング合議
    # ============================================================
    async def run_stream(
        self,
        *,
        decision_id: UUID,
        request: DecisionRequest,
    ) -> AsyncIterator[StreamEvent]:
        """ストリーミング合議 (tee_chunks + best-effort background 永続化、AVAIL-U4-07).

        最初に start event は handler 側で送信済 (decision_id 事前確定、Imp2).
        ここでは domain/utterance/proposal/complete を yield.
        """
        # 1. SilenceGuard
        verdict = await self._silence_guard.evaluate(user_input=request.user_input)
        if verdict.is_silenced:
            await self._record_silence(request, verdict.domain)
            yield StreamEvent("silence", {"text": verdict.response_text or ""})
            return

        # 2. ペルソナ取得 + プロフィール + 嗜好プロファイル
        personas = await self._resolve_personas(
            selected_ids=request.selected_persona_ids,
            user_id=request.user_id,
        )
        profile = await self._profile_repo.get(request.user_id)
        profile_yaml = await self._format_profile_with_preferences(
            user_id=request.user_id, profile=profile
        )

        # 3. プロンプト + LLM stream
        system = self._orchestrator.build_prompt(personas=personas, profile_yaml=profile_yaml)
        user_msg = self._orchestrator.wrap_user_input(mask_pii(request.user_input))
        try:
            llm_stream = self._llm.stream(
                system=system,
                messages=[{"role": "user", "content": user_msg}],
            )
        except DecisionError as exc:
            yield StreamEvent("error", {"reason": exc.reason, "detail": exc.detail})
            return

        # 4. tee_chunks で SSE / 永続化に fan-out
        chunks_for_sse, chunks_for_persist = tee_chunks(llm_stream, n=2)

        # background: 完全な LLM 出力を蓄積 → parse → DecisionRepository.insert
        async def consume_and_persist() -> None:
            try:
                buffer: list[str] = []
                async for c in chunks_for_persist:
                    buffer.append(c)
                consensus = self._orchestrator.parse("".join(buffer), personas=personas)
                if not consensus.utterances:
                    audit_log(
                        "audit.decision.parse_degraded",
                        decision_id=str(decision_id),
                        user_id=str(request.user_id),
                    )
                await self._persist_decision(decision_id, request, consensus, personas)
            except Exception as exc:
                self._logger.warning(
                    "background_persist_failed",
                    decision_id=str(decision_id),
                    error=str(exc),
                )

        asyncio.create_task(consume_and_persist())

        # SSE 側 (フロー前で error 出すと client が即座に把握できる)
        async for event in self._orchestrator.stream_parse(chunks_for_sse, personas=personas):
            yield event

    # ============================================================
    # Yes/No 採択
    # ============================================================
    async def apply_choice(
        self,
        *,
        decision_id: UUID,
        user_id: UUID,
        choice: Literal["yes", "no"],
    ) -> tuple[Decision, int]:
        """採択 + EventPublisher 発火. (Decision, no_attempt_count) を返す.

        ultrathink I6 反映: Yes/No 両方の採択時に発火 (FR-LEARN-01).
        """
        decision = await self._decision_repo.get(decision_id)
        if decision is None:
            raise DecisionError("decision_not_found")
        if decision.user_id != user_id:
            # SEC-U4-09: 所有者検証
            raise DecisionError("decision_not_found")  # leak 防止のため not_found

        summary = await self._decision_repo.count_no_by_user(user_id)
        new_no_count = summary["no_count"] + (1 if choice == "no" else 0)
        updated = await self._decision_repo.update_choice(
            decision_id=decision_id,
            choice=choice,
            no_count=new_no_count,
        )

        # Yes/No 両方発火 (FR-LEARN-01)
        await self._event_publisher.publish_decision_confirmed(
            user_id=str(user_id),
            decision_id=str(decision_id),
            choice=choice,
            domain=updated.domain_classification,
            timestamp=datetime.now(timezone.utc),
        )

        # U-Persona 統合: record_usage を選択 persona 全てに呼ぶ (best-effort、NFR Design I3)
        was_yes = choice == "yes"
        for pid in updated.selected_persona_ids or []:
            try:
                await self._persona_repo.record_usage(UUID(pid), was_yes=was_yes)
            except Exception as exc:
                # MVP では包括 catch + log (本来は U2 RepositoryError 分離が望ましい)
                self._logger.warning(
                    "persona_record_usage_failed",
                    persona_id=str(pid),
                    error=str(exc),
                )

        return updated, new_no_count

    # ============================================================
    # ヘルパー
    # ============================================================
    async def _resolve_personas(
        self,
        *,
        selected_ids: list[UUID],
        user_id: UUID,
    ) -> list:
        """U-Persona 統合: keyword-only signature (NFR Design I1) +
        UserPersonaSelection 経由解決 + can_access 検証.

        優先順位:
        1. selected_ids 指定あり → 個別解決 + can_access 検証
        2. selected_ids 空 + selection_repo あり → UserPersonaSelection を見る
        3. それ以外 → builtin 3 種 fallback
        """
        from yesman_api.domain.persona.access import can_access

        if not selected_ids and self._selection_repo is not None:
            selection = await self._selection_repo.get(user_id)
            if selection is not None and selection.persona_ids:
                # selection.persona_ids は list[str] (JSONB)、UUID 変換 (NFR Design C1)
                selected_ids = [UUID(pid) for pid in selection.persona_ids]

        if selected_ids:
            personas = []
            for pid in selected_ids:
                p = await self._persona_repo.get(pid)
                if p is None:
                    self._logger.warning("persona_not_found", persona_id=str(pid))
                    continue
                if not can_access(p, user_id):
                    self._logger.warning(
                        "persona_access_denied",
                        persona_id=str(pid),
                        user_id=str(user_id),
                    )
                    continue
                personas.append(p)
            if not personas:
                raise DecisionError("no_personas_available")
            return personas

        # builtin 3 種 fallback
        builtin = await self._persona_repo.list_by_owner(SYSTEM_USER_ID)
        if not builtin:
            raise DecisionError("no_personas", detail="builtin personas not seeded")
        return builtin

    @staticmethod
    def _format_profile(profile) -> str:
        if profile is None:
            return "(プロフィール未登録)"
        parts = []
        if profile.age_group:
            parts.append(f"age_group: {profile.age_group}")
        if profile.gender:
            parts.append(f"gender: {', '.join(profile.gender)}")
        if profile.occupation:
            parts.append(f"occupation: {profile.occupation}")
        if profile.value_tags:
            parts.append(f"value_tags: {', '.join(profile.value_tags)}")
        if profile.life_stage:
            parts.append(f"life_stage: {profile.life_stage}")
        return "\n".join(parts) if parts else "(プロフィール未入力)"

    async def _format_profile_with_preferences(
        self, *, user_id: UUID, profile
    ) -> str:
        """U5 統合: profile_yaml に preference_yaml を append (NFR Design §8.1).

        preference_loader が None (U4 単体 or stub) なら従来 profile_yaml のみ返却.
        keyword-only signature (ultrathink Imp3).
        """
        profile_yaml = self._format_profile(profile)
        if self._preference_loader is None:
            return profile_yaml
        try:
            preference_yaml = await self._preference_loader.load_for_prompt(user_id)
        except Exception as exc:
            self._logger.warning("preference_load_failed", error=str(exc), user_id=str(user_id))
            return profile_yaml
        if preference_yaml:
            return f"{profile_yaml}\n\n# 嗜好プロファイル\n{preference_yaml}"
        return profile_yaml

    async def _record_silence(self, request: DecisionRequest, domain) -> None:
        log = SilenceLog(
            user_id=request.user_id,
            detected_domain=str(domain or "unknown"),
            triggered_by="silence_guard",
            user_input_hash=self._silence_guard.compute_input_hash(
                user_id=str(request.user_id),
                user_input=request.user_input,
            ),
        )
        await self._silence_repo.insert(log)

    async def _persist_decision(
        self,
        decision_id: UUID,
        request: DecisionRequest,
        consensus: ConsensusOutput,
        personas: list,
    ) -> Decision:
        decision = Decision(
            id=decision_id,
            user_id=request.user_id,
            domain_classification=consensus.domain_classification,
            user_input=request.user_input,
            user_input_hash=self._silence_guard.compute_input_hash(
                user_id=str(request.user_id),
                user_input=request.user_input,
            ),
            proposal_text=consensus.proposal_text,
            persona_outputs={
                "utterances": [
                    {
                        "persona_id": str(u.persona_id),
                        "persona_name": u.persona_name,
                        "text": u.text,
                    }
                    for u in consensus.utterances
                ],
            },
            user_choice="pending",
            no_attempt_count=0,
            llm_provider=request.llm_provider,
            selected_persona_ids=[str(p.id) for p in personas],
        )
        return await self._decision_repo.insert(decision)


__all__ = ["DecisionEngine"]
