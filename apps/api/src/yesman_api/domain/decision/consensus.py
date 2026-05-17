"""ConsensusOrchestrator — single-prompt 合議のプロンプト構築 + 出力 parse.

NFR Design §4 + ultrathink C1 (stream_parse state 3 分離) + I3 (tee_chunks asyncio.Queue) +
Imp1 (persona 名 escape) 反映.
"""
from __future__ import annotations

import asyncio
import re
from typing import AsyncIterator

from yesman_api.domain.decision.models import (
    ConsensusOutput,
    DomainClassification,
    PersonaUtterance,
    StreamEvent,
)
from yesman_api.domain.persistence.models import Persona


PROMPT_TEMPLATE = """\
あなたは YesMan の意思決定エンジンです。以下の {persona_count} 人の人格を演じ、
ユーザーの入力に対して合議を行い、最終提案を 1 つに集約してください。

# 合議する人格
{persona_descriptions}

# ユーザープロフィール
{profile_yaml}

# 出力フォーマット (XML タグ厳守、他の出力は禁止)
<domain>daily|work|school|major|silenced</domain>
{utterance_template_block}
<proposal>最終提案 (断定調、〜してください/〜です。100 字以内)</proposal>
"""


USER_INPUT_TEMPLATE = "<user_input>{user_input}</user_input>"  # SEC-U4-12 プロンプトインジェクション緩和


_TAG_RE = re.compile(r"<(\w+)>(.*?)</\1>", re.DOTALL)
_UTTERANCE_RE = re.compile(
    r'<utterance persona="([^"]+)">(.*?)</utterance>', re.DOTALL
)


class ConsensusOrchestrator:
    @staticmethod
    def _escape_persona_name(name: str) -> str:
        """ultrathink Imp1 反映: Custom Persona 名に `"` を含む場合の XML 属性 escape."""
        return name.replace('"', "&quot;")

    def build_prompt(
        self,
        *,
        personas: list[Persona],
        profile_yaml: str,
    ) -> str:
        persona_descriptions = "\n".join(
            f"- {p.name}: {p.description or ''} (プロンプト指示: {p.prompt_text})"
            for p in personas
        )
        utterance_template_block = "\n".join(
            f'<utterance persona="{self._escape_persona_name(p.name)}">本文 (200 字以内)</utterance>'
            for p in personas
        )
        return PROMPT_TEMPLATE.format(
            persona_count=len(personas),
            persona_descriptions=persona_descriptions,
            profile_yaml=profile_yaml,
            utterance_template_block=utterance_template_block,
        )

    @staticmethod
    def wrap_user_input(user_input: str) -> str:
        """SEC-U4-12: プロンプトインジェクション緩和のため `<user_input>` で囲む.

        本文中の `<` `>` `&` を HTML entity 化し、`</user_input>` 等の終端タグで
        プロンプト境界を破壊されることを防ぐ (persona 名側 `_escape_persona_name`
        と対称性のある防御).
        """
        escaped = (
            user_input.replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
        )
        return USER_INPUT_TEMPLATE.format(user_input=escaped)

    def parse(self, llm_output: str, *, personas: list[Persona]) -> ConsensusOutput:
        """完全 XML / 部分 XML / 不正出力に対し部分抽出で recovery.

        ultrathink Imp3 反映: degraded 状態 (utterances=[]) でも proposal が取れれば成功扱い、
        呼び出し側で audit.decision.parse_degraded WARN ログを出す.
        """
        domain_raw = self._extract_tag(llm_output, "domain") or "daily"
        domain: DomainClassification = (
            domain_raw if domain_raw in ("daily", "work", "school", "major", "silenced") else "daily"  # type: ignore[assignment]
        )
        proposal = self._extract_tag(llm_output, "proposal") or ""
        persona_by_name = {p.name: p for p in personas}
        utterances: list[PersonaUtterance] = []
        for m in _UTTERANCE_RE.finditer(llm_output):
            name, text = m.group(1).strip(), m.group(2).strip()
            persona = persona_by_name.get(name)
            if persona is None:
                continue
            utterances.append(
                PersonaUtterance(persona_id=persona.id, persona_name=name, text=text)
            )
        return ConsensusOutput(
            domain_classification=domain,
            utterances=utterances,
            proposal_text=proposal,
        )

    @staticmethod
    def _extract_tag(text: str, tag: str) -> str | None:
        m = re.search(rf"<{tag}>(.*?)</{tag}>", text, re.DOTALL)
        return m.group(1).strip() if m else None

    async def stream_parse(
        self,
        chunks: AsyncIterator[str],
        *,
        personas: list[Persona],
    ) -> AsyncIterator[StreamEvent]:
        """chunk を蓄積しつつ完成した tag を逐次 yield.

        ultrathink C1 反映: state を 3 つに分離 (persona 名と meta tag の衝突回避).
        """
        buffer = ""
        emitted_domain = False
        emitted_personas: set[str] = set()
        emitted_proposal = False
        persona_by_name = {p.name: p for p in personas}

        async for chunk in chunks:
            buffer += chunk
            # domain 完成チェック
            if not emitted_domain:
                domain = self._extract_tag(buffer, "domain")
                if domain:
                    yield StreamEvent("domain", {"domain": domain})
                    emitted_domain = True
            # utterance 完成チェック (persona 名で重複管理)
            for m in _UTTERANCE_RE.finditer(buffer):
                name = m.group(1).strip()
                if name in emitted_personas:
                    continue
                persona = persona_by_name.get(name)
                if persona is None:
                    continue
                emitted_personas.add(name)
                yield StreamEvent(
                    "utterance",
                    {
                        "persona_id": str(persona.id),
                        "persona_name": name,
                        "text": m.group(2).strip(),
                    },
                )
            # proposal 完成チェック (api-client schema: proposal_text 必須)
            if not emitted_proposal:
                proposal = self._extract_tag(buffer, "proposal")
                if proposal:
                    yield StreamEvent("proposal", {"proposal_text": proposal})
                    emitted_proposal = True


def tee_chunks(
    source: AsyncIterator[str],
    *,
    n: int = 2,
    max_buffer: int = 256,
) -> tuple[AsyncIterator[str], ...]:
    """単一 async iterator を n 個の独立 consumer に fan-out.

    ultrathink I3 反映 (NFR Design §8.3 実装):
    各 consumer は独立の asyncio.Queue (最大 max_buffer 件) を持ち、producer は全 Queue にコピーを put.
    Queue 満杯時の chunk は drop (best-effort)、SSE 側遅延が永続化を妨げない.
    None を sentinel として送出 → consumer 側で StopAsyncIteration.
    """
    queues: list[asyncio.Queue[str | None]] = [
        asyncio.Queue(maxsize=max_buffer) for _ in range(n)
    ]

    async def producer() -> None:
        try:
            async for chunk in source:
                for q in queues:
                    try:
                        q.put_nowait(chunk)
                    except asyncio.QueueFull:
                        pass  # best-effort drop
        finally:
            for q in queues:
                await q.put(None)

    asyncio.create_task(producer())

    async def consumer(q: asyncio.Queue[str | None]) -> AsyncIterator[str]:
        while True:
            item = await q.get()
            if item is None:
                return
            yield item

    return tuple(consumer(q) for q in queues)


__all__ = [
    "PROMPT_TEMPLATE",
    "USER_INPUT_TEMPLATE",
    "ConsensusOrchestrator",
    "tee_chunks",
]
