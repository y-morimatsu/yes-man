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
from typing import Any, AsyncIterator, Literal
from uuid import UUID, uuid4

import json

from yesman_api.application.decision.event_publisher import EventPublisher
from yesman_api.application.decision.llm_provider import LLMProviderAdapter
from yesman_api.application.learning.anonymous_seed import derive_spec
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
from yesman_api.domain.persona_pool.models import AnonymousPersonaSpec
from yesman_api.domain.persona_pool.protocols import PoolRepository
from yesman_api.fixtures.anonymous_pool_seed import fixture_utterances
from yesman_api.infrastructure.config import AppConfig
from yesman_api.shared.logging import audit_log, get_logger
from yesman_api.shared.pii_filter import mask_pii


# v3-γ anonymous-strangers: in-engine 用 duck-typed proxy.
# Persona (SQLModel) と AnonymousPersonaSpec の seam として .id + .name を持つ.
class _AnonymousProxy:
    """anonymous persona を既存 utterance loop に渡すための薄 proxy.

    属性:
        id   = AnonymousPersonaSpec.persona_id (UUID)
        name = display 表示用ラベル (「あなたの声」 / 「世界の誰か #1」 等)
        spec = 派生元 spec (LLM prompt 用 metadata + primary_language / formality)
    """

    __slots__ = ("id", "name", "spec")

    def __init__(self, id_, name, spec):
        self.id = id_
        self.name = name
        self.spec = spec


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
        # v3-γ anonymous-strangers: 「世界の誰か」persona source (任意、None で builtin only)
        pool_repo: PoolRepository | None = None,
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
        self._pool_repo = pool_repo  # v3-γ anonymous-strangers

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

        v3-γ anonymous-strangers (2026-05-24): persona_source="anonymous" の場合は
        `_run_stream_anonymous` に dispatch (token streaming なし、fixture+LLM hybrid).

        v4 (2026-05-24): request.selected_personas (3 source mix) が指定されていれば
        `_run_stream_mixed` に dispatch. 旧 persona_source / selected_persona_ids は
        backward compat 用. self_spec injection なし (「自分を discussion から除外」).
        """
        # v4 dispatch: selected_personas (3 source mix) を最優先
        if request.selected_personas:
            async for event in self._run_stream_mixed(
                decision_id=decision_id, request=request
            ):
                yield event
            return

        # v3-γ dispatch: anonymous source は別 path
        if request.persona_source == "anonymous":
            if self._pool_repo is None:
                yield StreamEvent(
                    "error",
                    {
                        "reason": "anonymous_pool_unavailable",
                        "detail": "pool repository not configured in engine",
                    },
                )
                return
            async for event in self._run_stream_anonymous(
                decision_id=decision_id, request=request
            ):
                yield event
            return

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
        # 2026-05-23 Drill-down chain: chain_context があれば user_input に prepend して
        # 段階別の指示 (粒度ガイド) を加える。
        # depth 0: domain choice (映画 / 旅行 / 洋服 等)
        # depth 1: service routing (Amazon Prime / Netflix / ユニクロ 等で探す?)
        # depth 2: subtype 絞り込み (ホラー / メンズ / カジュアル 等)
        # depth 3 以上: specific instance (商品名 / 作品名 / 店舗名 — final)
        depth = len(request.chain_context)
        if request.chain_context:
            context_line = " → ".join(request.chain_context)
            if depth == 1:
                guide = (
                    "次の段階は『どの service / 経路で実現するか』。"
                    "例: 『Amazon Prime で 探しますか?』『Netflix で 見ますか?』『出前館 で 注文しますか?』。"
                    "短い疑問形 1 文 (~30 字)。"
                )
            elif depth == 2:
                guide = (
                    "次の段階は『subtype の 絞り込み』。"
                    "例: 『ホラー』『メンズ』『カジュアル』『M サイズ』。"
                    "1 単語 or 短いフレーズで。"
                )
            else:
                guide = (
                    "次は最も具体的な instance (商品名 / 作品名 / 店舗名 / 品名)。"
                    "例: 『貞子 on the Movie』『AMAZON Basic T シャツ 5 枚セット』。"
                    "これが最終決定。"
                )
            enriched_input = (
                f"[これまでの絞り込み: {context_line}]\n"
                f"{guide}\n"
                f"元の要望: {request.user_input}"
            )
            masked_user_input = mask_pii(enriched_input)
        else:
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

        # 2026-05-23 Drill-down chain: is_final + service を proposal event に同梱.
        # is_final = chain depth >= MAX_DRILL_DEPTH (3) のみ。
        # service routing 質問 (depth=1) は終了させず、4 段目 (depth=3) で必ず final.
        # service 情報は depth 問わず付与し、final で CTA、それまでは「ヒント」表示に使える。
        from yesman_api.domain.decision.service_catalog import pick_service
        MAX_DRILL_DEPTH = 3
        combined_text = (
            proposal_text + " " + " ".join(request.chain_context)
        ).strip()
        service = pick_service(combined_text)
        service_payload: dict | None = None
        if service is not None:
            service_payload = {
                "name": service.name,
                "url": service.url,
                "emoji": service.emoji,
            }
        # 2026-05-24 C-2 fix (Task 8 ultrathink): mockup §6 通り「root 1 回 Yes で完結」を default.
        # depth=0 (root) または depth>=MAX_DRILL_DEPTH で is_final=true.
        # drill-down (0 < depth < MAX) は user が明示的に「もっと詳しく」 ボタンで opt-in する
        # 設計 (frontend で別途実装). default 動作は mockup と整合し、NudgeBanner 完結.
        is_final = depth == 0 or depth >= MAX_DRILL_DEPTH
        yield StreamEvent(
            "proposal",
            {
                "proposal_text": proposal_text,
                "is_final": is_final,
                "depth": depth,
                "service": service_payload,
            },
        )

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
        *,
        is_anonymous: bool = False,
    ) -> Decision:
        # v3-γ: anonymous 経路は selected_persona_ids を空にする
        # (anonymous persona の UUID は personas table に存在しないため、
        # apply_choice の record_usage で persona_repo.get → not_found を起こさない).
        selected_ids = [] if is_anonymous else [str(p.id) for p in personas]
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
                "source": "anonymous" if is_anonymous else "builtin",
            },
            user_choice="pending",
            no_attempt_count=0,
            llm_provider=request.llm_provider,
            selected_persona_ids=selected_ids,
        )
        return await self._decision_repo.insert(decision)

    # ============================================================
    # v3-γ anonymous-strangers helpers
    # ============================================================
    def _build_anonymous_prompt(
        self,
        *,
        spec: AnonymousPersonaSpec,
        chain_context: tuple[str, ...] = (),
    ) -> str:
        """anonymous persona 用 LLM prompt (system message).

        chain_context があれば drill-down 段階別ガイドを inject (I-4 fix).
        depth に応じて「service routing」「subtype 絞り込み」「specific instance」
        の方向性を示し、builtin path と同じ深堀り段階を再現する.
        """
        tags_str = "、".join(spec.value_tags) if spec.value_tags else "(未設定)"
        formality_hint = {
            "polite": "polite=丁寧な ですます調",
            "casual": "casual=フランクな タメ口",
            "blunt": "blunt=短文・断定調",
        }.get(spec.formality, spec.formality)
        base = (
            f"あなたは {tags_str} の価値観を持つ人物です。\n"
            f"日常会話で {spec.primary_language} を話します。\n"
            f"話し方は {formality_hint} です。"
        )
        # I-4: chain_context を inject (builtin path の depth-aware ガイドと整合)
        chain_section = ""
        if chain_context:
            depth = len(chain_context)
            context_line = " → ".join(chain_context)
            if depth == 1:
                guide = (
                    "次は『どの service / 経路で実現するか』を提案してください "
                    "(例: Amazon Prime / Netflix / ユニクロ 等)."
                )
            elif depth == 2:
                guide = "次は subtype を絞り込んでください (例: ホラー / メンズ / カジュアル)."
            else:
                guide = (
                    "最も具体的な instance (商品名 / 作品名 / 店舗名) を提案 — これが最終決定."
                )
            chain_section = (
                f"\n\nこれまでの絞り込み: {context_line}\n{guide}"
            )
        return (
            f"{base}{chain_section}\n\n"
            "ユーザーの相談に対し、自分の価値観を反映して短く日本語で 1-2 文で意見を述べてください。\n"
            "前置きや JSON 等の構造化は不要、自然な日本語の発話だけを返してください。"
        )

    @staticmethod
    def _fallback_spec_for_empty_preference(
        empty_spec: AnonymousPersonaSpec,
    ) -> AnonymousPersonaSpec:
        """I-5 fix: signal_total=0 (新規 user / onboarding 未完了) の self_spec を
        意味のある default 値で埋め直す.

        persona_id / primary_language / seed_at は保持、value_tags のみ default 適用.
        これにより blank persona ("(未設定)" だらけ) を LLM に渡すことを避け、UX 崩れを防止.
        """
        return AnonymousPersonaSpec(
            persona_id=empty_spec.persona_id,
            value_tags=("迷い中", "新規"),
            primary_language=empty_spec.primary_language,
            formality=empty_spec.formality,
            seed_at=empty_spec.seed_at,
        )

    @staticmethod
    def _clean_anonymous_text(raw: str) -> str:
        """LLM 出力を anonymous bubble 用に寛容に正規化.

        - ```...``` code fence を除去
        - 旧 JSON 形式 {"original":..., "translation_ja":...} で返ってきた場合は
          translation_ja を抽出 (LLM の癖で稀に発生する後方互換)
        - それ以外はそのまま trim して返す
        """
        s = (raw or "").strip()
        if s.startswith("```"):
            lines = s.split("\n")
            tail = -1 if lines and lines[-1].strip().startswith("```") else None
            s = "\n".join(lines[1:tail] if tail is not None else lines[1:]).strip()
        if s.startswith("{") and s.endswith("}"):
            try:
                data = json.loads(s)
                if isinstance(data, dict):
                    ja = data.get("translation_ja") or data.get("text") or ""
                    return str(ja or "").strip()
            except (json.JSONDecodeError, ValueError):
                pass
        return s

    async def _run_stream_anonymous(
        self,
        *,
        decision_id: UUID,
        request: DecisionRequest,
    ) -> AsyncIterator[StreamEvent]:
        """v3-γ anonymous-strangers: 漫画ステージ用 utterance 生成.

        - token streaming は emit しない (FR-3 / NFR-2): bubble は完成 text fade-in
        - fixture spec は LLM 呼ばず hardcoded 発話を即 emit (FR-3 hybrid)
        - その他は LLM が日本語で短い発話を返す (2026-05-24: 原文表示機能削除に伴い JSON 廃止)
        - utterance event payload:
            { persona_id, persona_name, text, primary_language, formality }
        - drill-down chain_context は anonymous prompt に inject される (I-4 fix)
        - signal_total=0 の self_spec (新規 user) は default fallback (I-5 fix)
        - 永続化は selected_persona_ids 空 + persona_outputs.source="anonymous"
        """
        assert self._pool_repo is not None
        pool = self._pool_repo

        # 1. SilenceGuard (builtin path と共通)
        verdict = await self._silence_guard.evaluate(user_input=request.user_input)
        if verdict.is_silenced:
            await self._record_silence(request, verdict.domain)
            yield StreamEvent("silence", {"text": verdict.response_text or ""})
            return

        # 2. self spec (derive_spec) + pool sample 2 = 3 specs
        sub = str(request.user_id)
        profile = await self._profile_repo.get(request.user_id)
        pref = None
        if self._preference_repo is not None:
            try:
                pref = await self._preference_repo.get(request.user_id)
            except Exception as exc:
                self._logger.warning(
                    "anonymous.preference_load_failed",
                    user_id=sub,
                    error=str(exc),
                )
        if pref is None:
            from yesman_api.domain.persistence.models import PreferenceProfile
            pref = PreferenceProfile(
                user_id=request.user_id,
                accepted_patterns=[],
                rejected_patterns=[],
                persona_style_preference={},
                inferred_tags=[],
            )
        self_spec = derive_spec(sub=sub, preference=pref, profile=profile)
        # I-5 fix: 空 preference user (signal_total=0) は default fallback で blank 防止
        if self_spec.signal_total == 0:
            self_spec = self._fallback_spec_for_empty_preference(self_spec)
            self._logger.info(
                "anonymous.self_spec_fallback_applied",
                user_id=sub,
                reason="empty_preference_signals",
            )
        sampled = pool.sample(n=2, excluding_sub=sub)
        specs: list[AnonymousPersonaSpec] = [self_spec, *sampled]
        proxies: list[_AnonymousProxy] = []
        for idx, spec in enumerate(specs):
            name = "あなたの声" if idx == 0 else f"世界の誰か #{idx}"
            proxies.append(_AnonymousProxy(id_=spec.persona_id, name=name, spec=spec))

        # 3. personas event (frontend で bubble pre-render)
        yield StreamEvent(
            "personas",
            {
                "personas": [
                    {"id": str(p.id), "name": p.name} for p in proxies
                ]
            },
        )

        # 4. utterance 順次生成 (token streaming なし、漫画ステージは完成 text fade-in)
        masked_user_input = mask_pii(request.user_input)
        user_messages = [{"role": "user", "content": masked_user_input}]
        fixtures = fixture_utterances()
        per_persona_timeout = self._config.decision_llm_per_persona_timeout_seconds
        utterance_outputs: list[tuple] = []

        for proxy in proxies:
            spec = proxy.spec
            fixture_ut = fixtures.get(spec.persona_id)
            if fixture_ut is not None:
                # fixture 経路: LLM 呼ばずに hardcoded を即 emit
                yield StreamEvent(
                    "utterance",
                    {
                        "persona_id": str(proxy.id),
                        "persona_name": proxy.name,
                        "text": fixture_ut.text,
                        "primary_language": spec.primary_language,
                        "formality": spec.formality,
                    },
                )
                utterance_outputs.append((proxy, fixture_ut.text))
                continue

            # LLM 経路 (self_spec or 他 user の opt-in spec)
            # I-4 fix: chain_context を inject して drill-down 段階別ガイドを反映
            prompt = self._build_anonymous_prompt(
                spec=spec,
                chain_context=request.chain_context,
            )
            text = ""
            try:
                raw = await asyncio.wait_for(
                    self._llm.complete(system=prompt, messages=user_messages),
                    timeout=per_persona_timeout,
                )
                text = self._clean_anonymous_text(raw)
            except asyncio.TimeoutError:
                audit_log(
                    "audit.decision.anonymous_timeout",
                    decision_id=str(decision_id),
                    persona=proxy.name,
                    timeout_seconds=per_persona_timeout,
                )
            except Exception as exc:
                audit_log(
                    "audit.decision.anonymous_error",
                    decision_id=str(decision_id),
                    persona=proxy.name,
                    error=str(exc),
                )
            # text 空でも utterance event は emit (frontend bubble loading 解除)
            yield StreamEvent(
                "utterance",
                {
                    "persona_id": str(proxy.id),
                    "persona_name": proxy.name,
                    "text": text,
                    "primary_language": spec.primary_language,
                    "formality": spec.formality,
                },
            )
            if text and not text.isspace():
                utterance_outputs.append((proxy, text))

        # 5. 全 persona 失敗時は early return
        if not utterance_outputs:
            yield StreamEvent(
                "error",
                {
                    "reason": "all_personas_failed",
                    "detail": "all anonymous personas returned empty",
                },
            )
            return

        # 6. proposal 生成 (builtin path と同じ orchestrator を流用)
        proposal_system = self._orchestrator.build_proposal_prompt(utterance_outputs)
        proposal_timeout = self._config.decision_llm_proposal_timeout_seconds
        try:
            raw_proposal = await asyncio.wait_for(
                self._llm.complete(system=proposal_system, messages=user_messages),
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

        # 7. drill-down chain depth + service catalog (builtin path と同じ)
        from yesman_api.domain.decision.service_catalog import pick_service

        MAX_DRILL_DEPTH = 3
        depth = len(request.chain_context)
        combined_text = (
            proposal_text + " " + " ".join(request.chain_context)
        ).strip()
        service = pick_service(combined_text)
        service_payload: dict | None = None
        if service is not None:
            service_payload = {
                "name": service.name,
                "url": service.url,
                "emoji": service.emoji,
            }
        # 2026-05-24 C-2 fix (Task 8 ultrathink): mockup §6 通り「root 1 回 Yes で完結」を default.
        # depth=0 (root) または depth>=MAX_DRILL_DEPTH で is_final=true.
        # drill-down (0 < depth < MAX) は user が明示的に「もっと詳しく」 ボタンで opt-in する
        # 設計 (frontend で別途実装). default 動作は mockup と整合し、NudgeBanner 完結.
        is_final = depth == 0 or depth >= MAX_DRILL_DEPTH
        yield StreamEvent(
            "proposal",
            {
                "proposal_text": proposal_text,
                "is_final": is_final,
                "depth": depth,
                "service": service_payload,
            },
        )

        # 8. 永続化 (anonymous は selected_persona_ids 空)
        utterances_persist = [
            PersonaUtterance(persona_id=p.id, persona_name=p.name, text=text)
            for p, text in utterance_outputs
        ]
        consensus = ConsensusOutput(
            domain_classification="daily",
            utterances=utterances_persist,
            proposal_text=proposal_text,
        )
        try:
            await self._persist_decision(
                decision_id, request, consensus, [], is_anonymous=True
            )
        except Exception as exc:
            self._logger.warning(
                "anonymous.persist_failed",
                decision_id=str(decision_id),
                error=str(exc),
            )

        # 9. complete
        yield StreamEvent("complete", {"decision_id": str(decision_id)})

    # ============================================================
    # v4 (2026-05-24): 3 source mix selection 統合 flow
    # ============================================================
    async def _run_stream_mixed(
        self,
        *,
        decision_id: UUID,
        request: DecisionRequest,
    ) -> AsyncIterator[StreamEvent]:
        """selected_personas (3 source mix) を resolve して合議.

        - source ごとに spec/persona を取得 (builtin/my: persona_repo, anonymous: pool_repo)
        - self_spec injection なし (「自分を discussion から除外」)
        - 全 persona 非 streaming (anonymous flow と整合)
        - anonymous の caller persona は exclude (NFR-6 + pool.get_by_id 内で拒否)
        """
        # 1. SilenceGuard
        verdict = await self._silence_guard.evaluate(user_input=request.user_input)
        if verdict.is_silenced:
            await self._record_silence(request, verdict.domain)
            yield StreamEvent("silence", {"text": verdict.response_text or ""})
            return

        # 2. Resolve each selected_persona
        sub = str(request.user_id)
        # resolved: list of (source, id_str, display_name, spec_or_persona)
        resolved: list[tuple[str, str, str, object]] = []
        for ref in request.selected_personas:
            if ref.source == "anonymous":
                if self._pool_repo is None:
                    continue
                spec = self._pool_repo.get_by_id(ref.id, excluding_sub=sub)
                if spec is not None:
                    # display name: 「世界の誰か #N」
                    idx = sum(1 for r in resolved if r[0] == "anonymous") + 1
                    resolved.append(
                        ("anonymous", str(spec.persona_id), f"世界の誰か #{idx}", spec)
                    )
            else:
                # builtin or my
                persona = await self._persona_repo.get(ref.id)
                if persona is not None:
                    resolved.append((ref.source, str(persona.id), persona.name, persona))

        if not resolved:
            yield StreamEvent(
                "error",
                {
                    "reason": "no_personas_resolved",
                    "detail": "selected_personas を解決できませんでした (削除済 / 不正 ID)",
                },
            )
            return

        # 3. personas event (frontend で bubble pre-render)
        yield StreamEvent(
            "personas",
            {
                "personas": [
                    {"id": id_str, "name": name} for (_, id_str, name, _) in resolved
                ]
            },
        )

        # 4. utterances 順次生成 (non-streaming for all sources)
        masked_user_input = mask_pii(request.user_input)
        user_messages = [{"role": "user", "content": masked_user_input}]
        per_persona_timeout = self._config.decision_llm_per_persona_timeout_seconds
        fixtures = fixture_utterances()
        utterance_outputs: list[tuple] = []  # (proxy or persona, text)

        for source, id_str, name, item in resolved:
            event_extras: dict[str, Any] = {}
            text = ""

            if source == "anonymous":
                spec: AnonymousPersonaSpec = item  # type: ignore[assignment]
                event_extras["primary_language"] = spec.primary_language
                event_extras["formality"] = spec.formality
                # fixture 経路: LLM 呼ばず hardcoded
                fixture_ut = fixtures.get(spec.persona_id)
                if fixture_ut is not None:
                    text = fixture_ut.text
                else:
                    prompt = self._build_anonymous_prompt(
                        spec=spec, chain_context=request.chain_context
                    )
                    try:
                        raw = await asyncio.wait_for(
                            self._llm.complete(system=prompt, messages=user_messages),
                            timeout=per_persona_timeout,
                        )
                        text = self._clean_anonymous_text(raw)
                    except (asyncio.TimeoutError, Exception) as exc:
                        audit_log(
                            "audit.decision.mixed_anonymous_failed",
                            decision_id=str(decision_id),
                            persona=name,
                            error=str(exc),
                        )
            else:
                # builtin or my: 既存 builtin prompt builder を使う
                prompt = self._orchestrator.build_persona_prompt(item)
                try:
                    raw = await asyncio.wait_for(
                        self._llm.complete(system=prompt, messages=user_messages),
                        timeout=per_persona_timeout,
                    )
                    text = (raw or "").strip()
                except (asyncio.TimeoutError, Exception) as exc:
                    audit_log(
                        "audit.decision.mixed_builtin_failed",
                        decision_id=str(decision_id),
                        persona=name,
                        error=str(exc),
                    )

            yield StreamEvent(
                "utterance",
                {
                    "persona_id": id_str,
                    "persona_name": name,
                    "text": text,
                    **event_extras,
                },
            )
            if text and not text.isspace():
                # proposal 用 proxy: id/name 持てば proposal builder で参照可
                proxy = _AnonymousProxy(
                    id_=UUID(id_str), name=name, spec=item if source == "anonymous" else None  # type: ignore[arg-type]
                ) if source == "anonymous" else item
                utterance_outputs.append((proxy, text))

        # 5. early return if all personas failed
        if not utterance_outputs:
            yield StreamEvent(
                "error",
                {
                    "reason": "all_personas_failed",
                    "detail": "all selected personas returned empty",
                },
            )
            return

        # 6. proposal 生成
        proposal_system = self._orchestrator.build_proposal_prompt(utterance_outputs)
        proposal_timeout = self._config.decision_llm_proposal_timeout_seconds
        try:
            raw_proposal = await asyncio.wait_for(
                self._llm.complete(system=proposal_system, messages=user_messages),
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

        # 7. drill-down + service catalog
        from yesman_api.domain.decision.service_catalog import pick_service

        MAX_DRILL_DEPTH = 3
        depth = len(request.chain_context)
        combined_text = (
            proposal_text + " " + " ".join(request.chain_context)
        ).strip()
        service = pick_service(combined_text)
        service_payload: dict | None = None
        if service is not None:
            service_payload = {
                "name": service.name,
                "url": service.url,
                "emoji": service.emoji,
            }
        is_final = depth == 0 or depth >= MAX_DRILL_DEPTH

        yield StreamEvent(
            "proposal",
            {
                "proposal_text": proposal_text,
                "is_final": is_final,
                "depth": depth,
                "service": service_payload,
            },
        )

        # 8. persistence (anonymous + builtin 混在のため selected_persona_ids を builtin/my のみで構成)
        builtin_my_ids = [
            UUID(r[1]) for r in resolved if r[0] in ("builtin", "my")
        ]
        utterances_persist = [
            PersonaUtterance(
                persona_id=proxy.id if hasattr(proxy, "id") else proxy.persona_id,
                persona_name=proxy.name if hasattr(proxy, "name") else proxy.persona_name,
                text=text,
            )
            for proxy, text in utterance_outputs
        ]
        consensus = ConsensusOutput(
            domain_classification="daily",
            utterances=utterances_persist,
            proposal_text=proposal_text,
        )
        # selected_persona_ids を builtin/my のみで一時的に inject (persist 側で参照される)
        persist_request = DecisionRequest(
            user_id=request.user_id,
            user_input=request.user_input,
            selected_persona_ids=builtin_my_ids,
            chain_context=request.chain_context,
            persona_source=request.persona_source,
            selected_personas=request.selected_personas,
        )
        try:
            # anonymous が含まれていれば is_anonymous=True で永続化 (record_usage 404 を回避)
            has_anonymous = any(r[0] == "anonymous" for r in resolved)
            await self._persist_decision(
                decision_id,
                persist_request,
                consensus,
                # builtin/my personas のみを persona list として渡す
                [r[3] for r in resolved if r[0] in ("builtin", "my")],
                is_anonymous=has_anonymous,
            )
        except Exception as exc:
            self._logger.warning(
                "mixed.persist_failed",
                decision_id=str(decision_id),
                error=str(exc),
            )

        # 9. complete
        yield StreamEvent("complete", {"decision_id": str(decision_id)})


__all__ = ["DecisionEngine"]
