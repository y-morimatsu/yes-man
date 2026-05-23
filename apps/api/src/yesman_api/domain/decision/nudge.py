"""NudgeMessageGenerator + NudgeCache — Yes/No 採択時の AI 生成可変メッセージ.

NFR Design §5 + ultrathink I5 (メモリリーク防止 + _maybe_evict) 反映.
NFR Req PERF-U4-04/05 + Imp3 (TTL 切れ 410 Gone) 整合.
"""
from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass
from typing import Literal

from yesman_api.application.decision.llm_provider import LLMProviderAdapter
from yesman_api.shared.logging import get_logger
from yesman_api.shared.pii_filter import mask_pii


_FALLBACK_MESSAGE = "再考の余地がありますね。"


# issue #93: No 採択後の YES nudge microcopy fallback (stage 別、LLM 失敗時)
_YES_NUDGE_FALLBACKS: dict[int, str] = {
    0: "もう一案 どうぞ",  # stage>=1 fallback (no=1 はここ)
    2: "今度は ご納得 いただけるかも",
    3: "ここまでの こだわり、 大切にしながら一案 どうぞ",
    5: "ここまで考えた あなたなら、 任せてみる勇気を",
}


def _yes_nudge_fallback(stage: int) -> str:
    for threshold in sorted(_YES_NUDGE_FALLBACKS.keys(), reverse=True):
        if stage >= threshold:
            return _YES_NUDGE_FALLBACKS[threshold]
    return _YES_NUDGE_FALLBACKS[0]


@dataclass(frozen=True, slots=True)
class CachedNudge:
    message: str
    status: Literal["pending", "ready", "failed"]
    expires_at: float  # monotonic


class NudgeCache:
    """Process-wide in-memory cache. multi-worker では worker miss 発生 (MVP 許容).

    ultrathink I5 反映: MAX_ENTRIES 超過時 _maybe_evict で TTL 切れエントリを一括削除.
    """

    MAX_ENTRIES = 1000

    def __init__(self, *, ttl: float) -> None:
        self._ttl = ttl
        self._cache: dict[str, CachedNudge] = {}
        self._locks: dict[str, asyncio.Lock] = {}

    def get(self, decision_id: str) -> CachedNudge | None:
        cached = self._cache.get(decision_id)
        if cached is None:
            return None
        if time.monotonic() > cached.expires_at:
            self._cache.pop(decision_id, None)
            self._locks.pop(decision_id, None)
            return None
        return cached

    def set_pending(self, decision_id: str) -> None:
        self._maybe_evict()
        self._cache[decision_id] = CachedNudge(
            message="",
            status="pending",
            expires_at=time.monotonic() + self._ttl,
        )

    def set_ready(self, decision_id: str, message: str) -> None:
        self._cache[decision_id] = CachedNudge(
            message=message,
            status="ready",
            expires_at=time.monotonic() + self._ttl,
        )

    def set_failed(self, decision_id: str, fallback: str) -> None:
        self._cache[decision_id] = CachedNudge(
            message=fallback,
            status="failed",
            expires_at=time.monotonic() + self._ttl,
        )

    def _maybe_evict(self) -> None:
        if len(self._cache) < self.MAX_ENTRIES:
            return
        now = time.monotonic()
        expired = [k for k, v in self._cache.items() if now > v.expires_at]
        for k in expired:
            self._cache.pop(k, None)
            self._locks.pop(k, None)


class NudgeMessageGenerator:
    def __init__(self, *, llm: LLMProviderAdapter, cache: NudgeCache, enabled: bool = True) -> None:
        self._llm = llm
        self._cache = cache
        self._enabled = enabled
        self._logger = get_logger("decision.nudge")

    async def generate(
        self,
        *,
        decision_id: str,
        proposal_text: str,
        choice: Literal["yes", "no"],
        no_streak: int,
    ) -> None:
        """BackgroundTasks で起動される。結果は cache に保存."""
        if not self._enabled:
            self._cache.set_ready(decision_id, _FALLBACK_MESSAGE)
            return
        self._cache.set_pending(decision_id)
        masked_proposal = mask_pii(proposal_text)
        system = (
            "ユーザーは AI に意思決定を任せるサービスを使っています。"
            "1 行 30 字以内でメッセージを生成してください。装飾記号や絵文字は不要。"
        )
        prompt = self._build_prompt(masked_proposal, choice, no_streak)
        try:
            text = await self._llm.complete(
                system=system,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.5,
            )
            # 60 字で cap (LLM が暴走しても安全側)
            self._cache.set_ready(decision_id, text.strip()[:60])
        except Exception as exc:
            self._logger.warning("nudge_generation_failed", decision_id=decision_id, error=str(exc))
            self._cache.set_failed(decision_id, _FALLBACK_MESSAGE)

    async def generate_yes_microcopy(
        self,
        *,
        proposal_text: str,
        stage: int,
    ) -> str:
        """issue #93: No 採択 → 別案到着後の YES nudge microcopy を同期返却.

        stage (no_attempt_count) に応じてトーンが軽い前向き → 共感 → 委ねるに変化。
        existing generate() の background+cache pattern と異なり同期返却 (短 prompt + 2s timeout)、
        失敗時は _yes_nudge_fallback(stage) を返す。
        """
        if not self._enabled:
            return _yes_nudge_fallback(stage)
        masked = mask_pii(proposal_text)
        system = (
            "ユーザーは AI に意思決定を任せるサービスを使っています。"
            "Yes を選びやすくする、自然で押し付けがましくない日本語を 1 行 30 字以内で生成してください。"
            "装飾記号や絵文字、感嘆符は不要。提案内容を直接繰り返さずトーンで導く。"
        )
        prompt = (
            f"新しい提案: {masked}\n"
            f"ユーザーは前まで No を {stage} 回続けています。\n"
            f"トーン: {self._yes_nudge_tone(stage)}"
        )
        try:
            async with asyncio.timeout(2.0):
                text = await self._llm.complete(
                    system=system,
                    messages=[{"role": "user", "content": prompt}],
                    temperature=0.7,
                )
            cleaned = text.strip().replace("\n", " ")[:60]
            if not cleaned:
                return _yes_nudge_fallback(stage)
            return cleaned
        except Exception as exc:
            self._logger.warning(
                "yes_microcopy_failed", stage=stage, error=str(exc)
            )
            return _yes_nudge_fallback(stage)

    @staticmethod
    def _yes_nudge_tone(stage: int) -> str:
        if stage >= 5:
            return "委ねる安心。「ここまで考えた あなただからこそ、 今回は AI に任せてみませんか」"
        if stage >= 3:
            return "不安を吸い上げる共感。「ここまで悩んだ あなたの選択を 大切にしつつ、 一度 これで進んでみませんか」"
        if stage >= 2:
            return "共感を込めた、「今度は ご納得 いただけるかも」"
        return "軽い前向き、「もう一案 どうぞ、 これなら きっと」"

    @staticmethod
    def _build_prompt(proposal: str, choice: Literal["yes", "no"], no_streak: int) -> str:
        if choice == "yes":
            return (
                f"直前の提案: {proposal}\n"
                "ユーザーは Yes を選びました。委任成功への肯定的フィードバックを生成してください。"
            )
        if no_streak <= 1:
            tone = "軽い再考の提案"
        elif no_streak == 2:
            tone = "「本当に？」のニュアンス"
        else:
            tone = "「本当に大丈夫ですか?」段階強化"
        return (
            f"直前の提案: {proposal}\n"
            f"ユーザーは No を {no_streak} 回連続で選びました。{tone} のメッセージを生成してください。"
        )


__all__ = ["NudgeMessageGenerator", "NudgeCache", "CachedNudge"]
