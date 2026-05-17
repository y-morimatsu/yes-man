"""PersonaModerator — U3 SilenceGuard 流用で沈黙演出ドメイン誘発を検知 (FR-PERSONA-11).

NFR Design §4: SilenceGuard をそのまま注入 (重複実装回避).
LLM 不明 domain (4 ドメイン以外) は allowed 扱い (NFR Req I3 反映).
LLM 失敗時は SilenceGuard 内で fail-closed (= rejected) 扱い (AVAIL-UP-01).
"""
from __future__ import annotations

from yesman_api.domain.decision.silence_guard import SilenceGuard
from yesman_api.domain.persona.models import ModerationVerdict


_REJECTED_REASON = (
    "このペルソナは沈黙演出ドメインに該当するため作成・編集・共有公開できません。"
)


class PersonaModerator:
    def __init__(self, *, silence_guard: SilenceGuard) -> None:
        self._guard = silence_guard

    async def moderate(
        self,
        *,
        name: str,
        description: str | None,
        prompt_text: str,
    ) -> ModerationVerdict:
        """name + description + prompt_text を連結して SilenceGuard で検査."""
        combined = "\n".join(filter(None, [name, description or "", prompt_text]))
        verdict = await self._guard.evaluate(user_input=combined)
        if verdict.is_silenced:
            return ModerationVerdict(
                is_allowed=False,
                rejected_domain=verdict.domain,
                rejected_reason=_REJECTED_REASON,
            )
        return ModerationVerdict(is_allowed=True)


__all__ = ["PersonaModerator"]
