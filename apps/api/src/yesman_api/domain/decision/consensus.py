"""ConsensusOrchestrator — parallel-persona-consensus のプロンプト構築 + 出力 clean.

spec 2026-05-21 §5, §10: legacy single-prompt XML parser (build_prompt / parse / stream_parse)
は削除済み。build_persona_prompt / build_proposal_prompt + clean output 関数のみ提供。
"""
from __future__ import annotations

import re

from yesman_api.domain.decision.models import (
    ConsensusOutput,
    PersonaUtterance,
)
from yesman_api.domain.persistence.models import Persona


# ============================================================
# spec 2026-05-21 parallel-persona-consensus: prompt templates
# ============================================================

PERSONA_PROMPT_TEMPLATE = """\
あなたは「{persona_name}」というペルソナです。

{persona_description}

ペルソナ指示:
{persona_prompt_text}

以下のユーザからの相談に対し、あなたの視点・性格を強く反映した
発言を **200 字以内** で 1 段落で述べてください。
冒頭に「{persona_name}の意見:」のようなラベルは不要、本文のみ出力してください。
"""

PROPOSAL_PROMPT_TEMPLATE = """\
以下の意見を踏まえて、ユーザに対する **最終的な助言** を
**100 字以内** で出してください。

ユーザは Yes/No スワイプで採択するので、迷いの無い断定調・命令調の
明確な 1 文にしてください。冒頭に「最終助言:」「proposal:」 等の
ラベルは不要、本文のみ出力してください。

意見:
{utterance_block}
"""

_PERSONA_LABEL_RE = re.compile(r"^[^:：\n]+の意見[：:]\s*", re.MULTILINE)
_PROPOSAL_LABEL_RE = re.compile(r"^(最終助言|proposal)[：:]\s*", re.IGNORECASE)


class ConsensusOrchestrator:
    @staticmethod
    def _escape_persona_name(name: str) -> str:
        """ultrathink Imp1 反映: Custom Persona 名に `"` を含む場合の XML 属性 escape."""
        return name.replace('"', "&quot;")

    def build_persona_prompt(self, persona: Persona) -> str:
        """spec 2026-05-21 §5.1: persona 単発の system prompt を組み立てる."""
        name = self._escape_persona_name(persona.name)
        return PERSONA_PROMPT_TEMPLATE.format(
            persona_name=name,
            persona_description=persona.description or "",
            persona_prompt_text=persona.prompt_text or "",
        )

    def build_proposal_prompt(self, utterances: list[tuple[Persona, str]]) -> str:
        """spec 2026-05-21 §5.2: 全 persona 発言を踏まえた proposal の system prompt."""
        if not utterances:
            utterance_block = "(意見なし)"
        else:
            utterance_block = "\n".join(
                f"- {p.name}: {text}" for p, text in utterances
            )
        return PROPOSAL_PROMPT_TEMPLATE.format(utterance_block=utterance_block)


def clean_utterance_output(text: str) -> str:
    """LLM 応答から persona label prefix を除去 + strip + 200 字制限."""
    cleaned = _PERSONA_LABEL_RE.sub("", text, count=1).strip()
    return _truncate(cleaned, 200)


def clean_proposal_output(text: str) -> str:
    """LLM 応答から proposal label prefix を除去 + strip + 100 字制限."""
    cleaned = _PROPOSAL_LABEL_RE.sub("", text, count=1).strip()
    return _truncate(cleaned, 100)


def _truncate(text: str, max_chars: int) -> str:
    """Unicode code point 数で max_chars 以内に truncate."""
    if len(text) <= max_chars:
        return text
    return text[: max_chars - 1] + "…"


__all__ = [
    "PERSONA_PROMPT_TEMPLATE",
    "PROPOSAL_PROMPT_TEMPLATE",
    "ConsensusOrchestrator",
    "clean_utterance_output",
    "clean_proposal_output",
]
