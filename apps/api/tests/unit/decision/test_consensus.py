"""ConsensusOrchestrator — build_persona_prompt / build_proposal_prompt / clean output.

spec 2026-05-21 parallel-persona-consensus: legacy parse / stream_parse tests removed.
"""
from __future__ import annotations

from uuid import uuid4

from yesman_api.domain.decision.consensus import (
    ConsensusOrchestrator,
    clean_utterance_output,
    clean_proposal_output,
)
from yesman_api.domain.persistence.constants import SYSTEM_USER_ID
from yesman_api.domain.persistence.models import Persona


# ============================================================
# ConsensusOrchestrator — 新 prompt builder + clean output (spec 2026-05-21)
# ============================================================


def _persona(name: str, *, description: str = "", prompt_text: str = "") -> Persona:
    return Persona(
        id=uuid4(),
        owner_user_id=SYSTEM_USER_ID,
        name=name,
        description=description,
        prompt_text=prompt_text,
        is_shared=False,
        is_builtin=True,
        usage_count=0,
        yes_count=0,
    )


class TestBuildPersonaPrompt:
    def test_includes_persona_name(self):
        orch = ConsensusOrchestrator()
        prompt = orch.build_persona_prompt(_persona("慎重派"))
        assert "慎重派" in prompt

    def test_includes_persona_description(self):
        orch = ConsensusOrchestrator()
        prompt = orch.build_persona_prompt(_persona("慎重派", description="リスクを重視する"))
        assert "リスクを重視する" in prompt

    def test_includes_prompt_text(self):
        orch = ConsensusOrchestrator()
        prompt = orch.build_persona_prompt(_persona("慎重派", prompt_text="慎重に判断せよ"))
        assert "慎重に判断せよ" in prompt

    def test_escapes_persona_name_quotes(self):
        orch = ConsensusOrchestrator()
        prompt = orch.build_persona_prompt(_persona('attack"injection'))
        assert "attack&quot;injection" in prompt or 'attack"injection' not in prompt


class TestBuildProposalPrompt:
    def test_includes_all_utterances(self):
        orch = ConsensusOrchestrator()
        utterances = [
            (_persona("慎重派"), "慎重派の発言"),
            (_persona("楽観派"), "楽観派の発言"),
            (_persona("効率派"), "効率派の発言"),
        ]
        prompt = orch.build_proposal_prompt(utterances)
        assert "慎重派の発言" in prompt
        assert "楽観派の発言" in prompt
        assert "効率派の発言" in prompt

    def test_format_uses_dash_persona_colon(self):
        orch = ConsensusOrchestrator()
        utterances = [(_persona("慎重派"), "テスト発言")]
        prompt = orch.build_proposal_prompt(utterances)
        assert "- 慎重派: テスト発言" in prompt

    def test_with_empty_utterances_still_works(self):
        orch = ConsensusOrchestrator()
        prompt = orch.build_proposal_prompt([])
        assert "最終助言" in prompt or "助言" in prompt


class TestCleanUtteranceOutput:
    def test_strips_persona_label_prefix(self):
        assert clean_utterance_output("慎重派の意見: ラーメンは塩分が高い") == "ラーメンは塩分が高い"

    def test_strips_whitespace(self):
        assert clean_utterance_output("  text  ") == "text"

    def test_truncates_to_200_chars(self):
        long = "あ" * 250
        result = clean_utterance_output(long)
        assert len(result) == 200
        assert result.endswith("…")

    def test_preserves_short_text(self):
        assert clean_utterance_output("短い") == "短い"

    def test_handles_empty(self):
        assert clean_utterance_output("") == ""

    def test_handles_only_whitespace(self):
        assert clean_utterance_output("   \n\t  ") == ""


class TestCleanProposalOutput:
    def test_strips_proposal_label(self):
        assert clean_proposal_output("最終助言: その選択で進めてください") == "その選択で進めてください"

    def test_strips_proposal_english_label(self):
        assert clean_proposal_output("proposal: do it") == "do it"

    def test_truncates_to_100_chars(self):
        long = "あ" * 150
        result = clean_proposal_output(long)
        assert len(result) == 100
        assert result.endswith("…")

