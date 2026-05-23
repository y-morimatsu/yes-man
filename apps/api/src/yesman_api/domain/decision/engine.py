"""DecisionEngine — 合議の中核オーケストレーター.

FD §5 + spec 2026-05-21 parallel-persona-consensus + I6 (Yes/No 両方発火) 反映.

責務:
- run(request): 非ストリーミング合議 (parallel persona calls + proposal)
- run_stream(...): ストリーミング合議 (parallel persona calls + proposal、SSE 配信)
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
    PreferenceProfileRepository,
    ProfileRepository,
    SilenceLogRepository,
    UserPersonaSelectionRepository,
)
from yesman_api.domain.decision.consensus import (
    ConsensusOrchestrator,
    clean_proposal_output,
    clean_utterance_output,
)
from yesman_api.domain.decision.errors import DecisionError
from yesman_api.domain.decision.models import (
    ConsensusOutput,
    DecisionRequest,
    PersonaUtterance,
    StreamEvent,
)
from yesman_api.domain.decision.silence_guard import SilenceGuard
from yesman_api.domain.persistence.constants import SYSTEM_USER_ID
from yesman_api.domain.persistence.models import Decision, SilenceLog
from yesman_api.infrastructure.config import AppConfig
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
        # Issue #4: Dynamic Persona Routing 用、persona_style_preference を参照
        preference_repo: PreferenceProfileRepository | None = None,
        # spec 2026-05-21 parallel-persona-consensus: per-persona / proposal timeout を参照
        config: AppConfig | None = None,
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
        self._preference_repo = preference_repo  # Issue #4 Dynamic Persona Routing
        self._config = config or AppConfig()
        self._logger = get_logger("decision.engine")

    # ============================================================
    # 非ストリーミング合議
    # ============================================================
    async def run(self, request: DecisionRequest) -> tuple[UUID, ConsensusOutput, int]:
        """非ストリーミング合議 (parallel consensus を sync 実行).

        spec 2026-05-21: 並列 persona call + proposal call を await し、ConsensusOutput を構築.
        """
        # 1. SilenceGuard
        verdict = await self._silence_guard.evaluate(user_input=request.user_input)
        if verdict.is_silenced:
            decision_id = uuid4()
            await self._record_silence(request, verdict.domain)
            silence_output = ConsensusOutput(
                domain_classification="silenced",
                utterances=[],
                proposal_text=verdict.response_text or "",
            )
            # 沈黙時は Decision を保存しない (FR-DM-SILENT、SilenceLog のみ)
            return decision_id, silence_output, 0

        # 2. ペルソナ + masked input
        personas = await self._resolve_personas(
            selected_ids=request.selected_persona_ids,
            user_id=request.user_id,
        )
        masked = mask_pii(request.user_input)
        messages = [{"role": "user", "content": masked}]

        # 3. persona 並列 LLM call (per-persona timeout 付き)
        per_persona_timeout = self._config.decision_llm_per_persona_timeout_seconds

        async def gen_p(persona):
            try:
                raw = await asyncio.wait_for(
                    self._llm.complete(
                        system=self._orchestrator.build_persona_prompt(persona),
                        messages=messages,
                    ),
                    timeout=per_persona_timeout,
                )
                return persona, clean_utterance_output(raw)
            except Exception:
                return persona, ""

        results = await asyncio.gather(*(gen_p(p) for p in personas))
        utterance_outputs = [(p, t) for p, t in results if t and not t.isspace()]

        if not utterance_outputs:
            raise DecisionError("all_personas_failed", "all persona LLM calls returned empty")

        # 4. proposal 生成 (timeout 付き)
        proposal_raw = await asyncio.wait_for(
            self._llm.complete(
                system=self._orchestrator.build_proposal_prompt(utterance_outputs),
                messages=messages,
            ),
            timeout=self._config.decision_llm_proposal_timeout_seconds,
        )
        proposal_text = clean_proposal_output(proposal_raw)

        # 5. ConsensusOutput + 永続化
        utterances_persist = [
            PersonaUtterance(persona_id=p.id, persona_name=p.name, text=t)
            for p, t in utterance_outputs
        ]
        consensus = ConsensusOutput(
            domain_classification="daily",
            utterances=utterances_persist,
            proposal_text=proposal_text,
        )
        decision_id = uuid4()
        await self._persist_decision(decision_id, request, consensus, personas)
        return decision_id, consensus, 0

    # ============================================================
    # ストリーミング合議
    # ============================================================
    async def run_stream(
        self,
        *,
        decision_id: UUID,
        request: DecisionRequest,
    ) -> AsyncIterator[StreamEvent]:
        """spec 2026-05-21 parallel-persona-consensus: persona 並列 LLM call + proposal 生成.

        start event は handler 側で送信済 (decision_id 事前確定).
        ここでは silence / utterance × N / proposal / complete / error を yield.
        """
        # 1. SilenceGuard
        verdict = await self._silence_guard.evaluate(user_input=request.user_input)
        if verdict.is_silenced:
            await self._record_silence(request, verdict.domain)
            yield StreamEvent("silence", {"text": verdict.response_text or ""})
            return

        # 2. ペルソナ取得
        personas = await self._resolve_personas(
            selected_ids=request.selected_persona_ids,
            user_id=request.user_id,
        )

        # 2.5 Post-CONSTRUCTION v3 (2026-05-23): personas 解決を frontend に通知。
        # bubble を id+name 付きで pre-render し、delta 到着前から persona header を可視化する。
        yield StreamEvent(
            "personas",
            {
                "personas": [
                    {"id": str(p.id), "name": p.name} for p in personas
                ]
            },
        )

        # 3. persona 並列 LLM stream call (per-persona timeout 付き)
        # spec Post-CONSTRUCTION v3 (2026-05-23): _llm.stream() 経由で
        # utterance_delta event を chunk 単位 yield、最後に cleaned text を
        # utterance event として送出 (backward compat + 最終確定)。
        masked_user_input = mask_pii(request.user_input)
        user_messages = [{"role": "user", "content": masked_user_input}]
        per_persona_timeout = self._config.decision_llm_per_persona_timeout_seconds
        proposal_timeout = self._config.decision_llm_proposal_timeout_seconds

        # Fan-in queue: 各 persona stream task が delta / end / error を put、
        # main loop が drain して SSE event を yield。
        queue: asyncio.Queue = asyncio.Queue()

        async def stream_persona(persona) -> None:
            system_prompt = self._orchestrator.build_persona_prompt(persona)
            accumulated_parts: list[str] = []
            try:
                async def consume() -> None:
                    async for chunk in self._llm.stream(
                        system=system_prompt,
                        messages=user_messages,
                    ):
                        if not chunk:
                            continue
                        accumulated_parts.append(chunk)
                        await queue.put(("delta", persona, chunk))

                await asyncio.wait_for(consume(), timeout=per_persona_timeout)
                cleaned = clean_utterance_output("".join(accumulated_parts))
                await queue.put(("end", persona, cleaned))
            except asyncio.TimeoutError:
                audit_log(
                    "audit.decision.persona_timeout",
                    decision_id=str(decision_id),
                    persona=persona.name,
                    timeout_seconds=per_persona_timeout,
                )
                await queue.put(("end", persona, ""))
            except Exception as exc:
                audit_log(
                    "audit.decision.persona_error",
                    decision_id=str(decision_id),
                    persona=persona.name,
                    error=str(exc),
                )
                await queue.put(("end", persona, ""))

        tasks = [asyncio.create_task(stream_persona(p)) for p in personas]

        # 4. Queue を drain して delta / 完了 utterance event を yield
        utterance_outputs: list[tuple] = []
        ended = 0
        try:
            while ended < len(personas):
                msg_type, persona, text = await queue.get()
                if msg_type == "delta":
                    yield StreamEvent(
                        "utterance_delta",
                        {
                            "persona_id": str(persona.id),
                            "persona_name": persona.name,
                            "text": text,
                        },
                    )
                else:  # "end"
                    ended += 1
                    # Post-CONSTRUCTION v3 (2026-05-23): empty text (= 失敗/timeout) でも
                    # utterance event を emit して frontend bubble の「発言中…」状態を解除する。
                    # utterance_outputs (proposal 入力 + 永続化対象) からは空テキストを除外。
                    yield StreamEvent(
                        "utterance",
                        {
                            "persona_id": str(persona.id),
                            "persona_name": persona.name,
                            "text": text,
                        },
                    )
                    if text and not text.isspace():
                        utterance_outputs.append((persona, text))
        finally:
            # 念のため取り残し task を await (例外伝播防止)
            for t in tasks:
                if not t.done():
                    t.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)

        # 5. 全 persona 失敗時は error event + early return (proposal call せず)
        if not utterance_outputs:
            yield StreamEvent(
                "error",
                {
                    "reason": "all_personas_failed",
                    "detail": "all persona LLM calls timed out or returned empty",
                },
            )
            return

        # 6. proposal 生成 (4 つ目の LLM call、timeout 付き)
        proposal_system = self._orchestrator.build_proposal_prompt(utterance_outputs)
        try:
            raw_proposal = await asyncio.wait_for(
                self._llm.complete(
                    system=proposal_system,
                    messages=user_messages,
                ),
                timeout=proposal_timeout,
            )
            proposal_text = clean_proposal_output(raw_proposal)
        except asyncio.TimeoutError:
            yield StreamEvent(
                "error",
                {
                    "reason": "proposal_timeout",
                    "detail": f"proposal LLM call exceeded {proposal_timeout}s",
                },
            )
            return

        yield StreamEvent("proposal", {"proposal_text": proposal_text})

        # 7. 永続化 (synchronous、complete event の前に実行)
        utterances_persist = [
            PersonaUtterance(
                persona_id=p.id,
                persona_name=p.name,
                text=text,
            )
            for p, text in utterance_outputs
        ]
        consensus = ConsensusOutput(
            domain_classification="daily",
            utterances=utterances_persist,
            proposal_text=proposal_text,
        )
        try:
            await self._persist_decision(decision_id, request, consensus, personas)
        except Exception as exc:
            self._logger.warning(
                "persist_failed",
                decision_id=str(decision_id),
                error=str(exc),
            )

        # 8. complete (success path での最後の event)
        yield StreamEvent("complete", {"decision_id": str(decision_id)})

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

        # builtin を取得 (Dynamic Persona Routing でも fallback でも使用)
        builtin = await self._persona_repo.list_by_owner(SYSTEM_USER_ID)
        if not builtin:
            raise DecisionError("no_personas", detail="builtin personas not seeded")

        # Issue #4: Dynamic Persona Routing — PreferenceProfile.persona_style_preference
        # の score 上位から builtin を並べ替えて top 3 を選ぶ.
        # user の Yes 採択履歴から学習された persona 親和度を反映する.
        if self._preference_repo is not None:
            try:
                pref = await self._preference_repo.get(user_id)
            except Exception as exc:
                self._logger.warning(
                    "preference_load_failed_in_persona_routing",
                    user_id=str(user_id),
                    error=str(exc),
                )
                pref = None
            if pref is not None and pref.persona_style_preference:
                # score 降順で sort、name → builtin persona に matching
                scored = sorted(
                    pref.persona_style_preference.items(),
                    key=lambda kv: -kv[1],
                )
                ordered_names = [name for name, _ in scored]
                scored_personas: list = []
                for name in ordered_names:
                    matched = next((p for p in builtin if p.name == name), None)
                    if matched and matched not in scored_personas:
                        scored_personas.append(matched)
                # score にない builtin で末尾を埋める (max 3)
                remaining = [p for p in builtin if p not in scored_personas]
                routed = (scored_personas + remaining)[:3]
                if routed and scored_personas:
                    self._logger.info(
                        "decision.persona_auto_recommended",
                        user_id=str(user_id),
                        names=[p.name for p in routed],
                        source="preference_style_top",
                    )
                    return routed

        # fallback: builtin 3 種そのまま
        return builtin[:3]

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
