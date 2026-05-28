"""DemoLLMAdapter — demo user (email に "morimatsu") のときだけ scripted 応答を返すラッパ.

`get_decision_engine` が demo user のときのみ本物 adapter を包んで per-request 構築する。
demo user 以外では生成されないため、このクラスが使われる時点で常に demo コンテキスト。

挙動:
- persona prompt (「妻」「娘」「ワンコ」を含む) → scripted 発言
- proposal prompt (「最終的な助言」を含む) → scripted 最終提案 (外出着 / 深掘り)
- scripted トピック (外出着 / 最近の俺) に該当しない入力は本物 adapter へ委譲
  (= 家族ペルソナで Bedrock 合議が普通に走る)
"""
from __future__ import annotations

from typing import AsyncIterator

from yesman_api.application.decision.llm_provider import LLMProviderAdapter
from yesman_api.domain.decision import demo_mode


class DemoLLMAdapter:
    provider_name = "demo"

    def __init__(self, delegate: LLMProviderAdapter, *, chunk_size: int = 12) -> None:
        self._delegate = delegate
        self._chunk_size = chunk_size

    # --- 検出ヘルパ ---
    def _topic(self, messages: list[dict[str, str]]) -> str | None:
        joined = "\n".join(m.get("content", "") for m in messages)
        return demo_mode.match_topic(joined)

    def _detect_persona(self, system: str) -> str | None:
        # PERSONA_PROMPT_TEMPLATE は 「persona_name」 (鉤括弧付き) を含む
        for name in demo_mode.PERSONA_LINES:  # 妻 / 娘 / ワンコ
            if f"「{name}」" in system:
                return name
        return None

    @staticmethod
    def _is_proposal(system: str) -> bool:
        return "最終的な助言" in system or "最終助言" in system

    # --- LLMProviderAdapter Protocol ---
    async def complete(
        self,
        *,
        system: str,
        messages: list[dict[str, str]],
        temperature: float = 0.7,
    ) -> str:
        topic = self._topic(messages)
        # scripted トピックでなければ完全委譲 (家族ペルソナで本物合議が動く)
        if topic is None:
            return await self._delegate.complete(
                system=system, messages=messages, temperature=temperature
            )
        # persona 発言
        persona = self._detect_persona(system)
        if persona is not None:
            line = demo_mode.persona_line(topic, persona)
            if line is not None:
                return line
            return await self._delegate.complete(
                system=system, messages=messages, temperature=temperature
            )
        # 最終提案
        if self._is_proposal(system):
            prop = demo_mode.proposal_text(topic)
            if prop is not None:
                return prop
        # fallback: 委譲
        return await self._delegate.complete(
            system=system, messages=messages, temperature=temperature
        )

    async def stream(
        self,
        *,
        system: str,
        messages: list[dict[str, str]],
        temperature: float = 0.7,
    ) -> AsyncIterator[str]:
        full = await self.complete(system=system, messages=messages, temperature=temperature)
        for i in range(0, len(full), self._chunk_size):
            yield full[i : i + self._chunk_size]

    async def aclose(self) -> None:
        # delegate は app-scoped singleton (factory.dispose が管理) なのでここでは閉じない
        return None


__all__ = ["DemoLLMAdapter"]
