"""MockLLMProvider — CI / 自動テスト / オフライン開発用 (FR-AUTH-06 相当).

spec 2026-05-21 parallel-persona-consensus 対応:
- complete() は system prompt 内の persona 名を検出して該当 utterance を返す
- proposal prompt (「最終的な助言」を含む) は proposal canned text を返す
- override 指定があれば最優先 (test 用)
- persona_delays で per-persona delay を制御 (順序検証 test 用)
- stream() は LLMProviderAdapter Protocol 要件のため保持 (complete() に委譲)
"""
from __future__ import annotations

import asyncio
from typing import AsyncIterator


class MockLLMProvider:
    provider_name = "mock"

    # spec 2026-05-21 §9: persona ごと canned response
    PERSONA_RESPONSES = {
        "慎重派": "慎重派の意見: もう少し情報を集めてから決めるべきです。",
        "楽観派": "楽観派の意見: その選択肢は前向きで良いと思います。",
        "効率派": "効率派の意見: 短時間で完了する案を選ぶのが効率的です。",
    }
    # 2026-05-25 外部サービス誘導: root proposal も action 志向で次段 (Amazon サービス) に繋がりやすく.
    PROPOSAL_RESPONSE = "映画を 観ましょう。"
    # 2026-05-25 外部サービス誘導 (MAX_DRILL_DEPTH=4): 自然な絞り込みを 4 段で展開.
    # root proposal (chain_len=0) → action 志向、Yes 連鎖で genre → service → subtype → instance.
    # 最終 (chain_len=4) で Amazon サービス + 固有名に到達して CTA 表示.
    DRILL_DOWN_PROPOSALS: dict[int, str] = {
        # depth=1: 一段だけ具体化 (ジャンル / subtype 1 軸)
        1: "ホラー映画は どうですか?",
        # depth=2: もう一段 (subtype 詳細)
        2: "ジャパニーズホラーが 気分転換に おすすめです。",
        # depth=3: service routing (Amazon サービス指定)
        3: "Amazon Prime Video で 観ましょう。",
        # depth=4 (final / drill-down-auto-open FR-DAO-08): 固有名 + Amazon サービス + 疑問形.
        # 末尾「開きますか?」が frontend の window.open trigger と整合.
        4: "『貞子 on the Movie』を Amazon Prime Video で 開きますか?",
    }
    DEFAULT_RESPONSE = "Mock response: unable to detect persona from prompt."

    def __init__(
        self,
        *,
        override: str | None = None,
        stream_delay_seconds: float = 0.0,
        chunk_size: int = 10,
        persona_delays: dict[str, float] | None = None,
    ) -> None:
        self._override = override
        self._stream_delay = stream_delay_seconds
        self._chunk_size = chunk_size
        self._persona_delays = persona_delays or {}

    def _detect_persona(self, system: str) -> str | None:
        """system prompt から persona name を検出.

        PERSONA_PROMPT_TEMPLATE は「persona_name」(鉤括弧付き) を含むため、
        その形式のみをマッチさせることで legacy の multi-persona プロンプト
        (- 慎重派: ...) と区別する.
        """
        for persona_name in self.PERSONA_RESPONSES:
            if f"「{persona_name}」" in system:
                return persona_name
        return None

    def _pick_proposal(self, messages: list[dict[str, str]]) -> str:
        """user message から drill-down depth を推定して proposal を選ぶ.

        engine.py は chain_context 有り時に user_input を
        ``[これまでの絞り込み: A → B → ...]\\n...\\n元の要望: ...`` に enriching する。
        block 内の ``→`` 区切り個数 + 1 が次の depth (= len(chain_context))。
        chain 無し (root submit) は PROPOSAL_RESPONSE を返す。
        """
        joined = "\n".join(m.get("content", "") for m in messages)
        marker = "[これまでの絞り込み: "
        start = joined.find(marker)
        if start < 0:
            return self.PROPOSAL_RESPONSE
        end = joined.find("]", start)
        if end < 0:
            return self.PROPOSAL_RESPONSE
        chain_str = joined[start + len(marker) : end]
        # "A" → 1 件, "A → B" → 2 件, "A → B → C" → 3 件
        chain_len = len([s for s in chain_str.split("→") if s.strip()])
        return self.DRILL_DOWN_PROPOSALS.get(chain_len, self.PROPOSAL_RESPONSE)

    def _detect_proposal(self, system: str) -> bool:
        """proposal prompt 判定.

        PROPOSAL_PROMPT_TEMPLATE は「最終的な助言」を含む.
        テスト上は略称「最終助言」もマッチさせる.
        """
        return "最終的な助言" in system or "最終助言" in system

    async def complete(
        self,
        *,
        system: str,
        messages: list[dict[str, str]],
        temperature: float = 0.7,
    ) -> str:
        if self._override is not None:
            return self._override

        # persona prompt → per-persona response + optional delay
        persona = self._detect_persona(system)
        if persona is not None:
            delay = self._persona_delays.get(persona, 0.0)
            if delay > 0:
                await asyncio.sleep(delay)
            return self.PERSONA_RESPONSES[persona]

        # proposal prompt → proposal canned text (drill-down depth に応じて切替)
        if self._detect_proposal(system):
            return self._pick_proposal(messages)

        # fallback
        return self.DEFAULT_RESPONSE

    async def stream(
        self,
        *,
        system: str,
        messages: list[dict[str, str]],
        temperature: float = 0.7,
    ) -> AsyncIterator[str]:
        """LLMProviderAdapter Protocol 要件 (BedrockLLMAdapter と対称).

        engine 側からは使用しない (complete() のみ利用) が、Protocol 実装として必要。
        complete() に委譲して chunk_size ごとに分割 yield。
        """
        full = await self.complete(system=system, messages=messages, temperature=temperature)
        for i in range(0, len(full), self._chunk_size):
            if self._stream_delay > 0:
                await asyncio.sleep(self._stream_delay)
            yield full[i : i + self._chunk_size]

    async def aclose(self) -> None:
        return None


__all__ = ["MockLLMProvider"]
