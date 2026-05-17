"""ConsensusOrchestrator — parse + stream_parse (ultrathink C1 state 3 分離).

TestParse class + TestStreamParse class の 2 クラス構成 (ultrathink I2 反映).
"""
from __future__ import annotations

from typing import AsyncIterator

import pytest

from tests.fixtures.decision import builtin_personas
from yesman_api.domain.decision.consensus import ConsensusOrchestrator, tee_chunks


# ============================================================
# TestParse
# ============================================================
class TestParse:
    def setup_method(self):
        self.orch = ConsensusOrchestrator()
        self.personas = builtin_personas()

    def test_complete_xml(self):
        output = """\
<domain>daily</domain>
<utterance persona="慎重派">慎重な意見</utterance>
<utterance persona="楽観派">楽観的な意見</utterance>
<utterance persona="効率派">効率的な意見</utterance>
<proposal>その選択肢で進めてください。</proposal>
"""
        result = self.orch.parse(output, personas=self.personas)
        assert result.domain_classification == "daily"
        assert result.proposal_text == "その選択肢で進めてください。"
        assert len(result.utterances) == 3
        assert {u.persona_name for u in result.utterances} == {"慎重派", "楽観派", "効率派"}

    def test_partial_xml_proposal_only(self):
        """LLM が utterance を欠落させても proposal が取れれば成功扱い (degraded)."""
        output = "<domain>daily</domain><proposal>結論だけ</proposal>"
        result = self.orch.parse(output, personas=self.personas)
        assert result.proposal_text == "結論だけ"
        assert result.utterances == []

    def test_unknown_persona_filtered(self):
        """known persona に無い名前は無視."""
        output = '<utterance persona="不明">x</utterance><proposal>ok</proposal>'
        result = self.orch.parse(output, personas=self.personas)
        assert result.utterances == []

    def test_persona_name_escape(self):
        """ultrathink Imp1: Custom Persona 名の " を escape."""
        from yesman_api.domain.persistence.constants import SYSTEM_USER_ID
        from yesman_api.domain.persistence.models import Persona
        from uuid import uuid4

        weird = Persona(
            id=uuid4(),
            owner_user_id=SYSTEM_USER_ID,
            name='変な"派',
            description="",
            prompt_text="x",
            is_shared=True,
            is_builtin=False,
            usage_count=0,
            yes_count=0,
        )
        prompt = self.orch.build_prompt(personas=[weird], profile_yaml="")
        assert '&quot;' in prompt


# ============================================================
# TestStreamParse (ultrathink C1: state 3 分離)
# ============================================================
class TestStreamParse:
    async def _to_async_iter(self, chunks: list[str]) -> AsyncIterator[str]:
        for c in chunks:
            yield c

    @pytest.mark.asyncio
    async def test_yields_in_order(self):
        orch = ConsensusOrchestrator()
        personas = builtin_personas()
        full = (
            "<domain>daily</domain>"
            '<utterance persona="慎重派">慎重</utterance>'
            '<utterance persona="楽観派">楽観</utterance>'
            '<utterance persona="効率派">効率</utterance>'
            "<proposal>結論</proposal>"
        )
        chunks = [full[i : i + 10] for i in range(0, len(full), 10)]
        events = []
        async for ev in orch.stream_parse(self._to_async_iter(chunks), personas=personas):
            events.append(ev.type)
        # state 3 分離: domain → utterance × 3 → proposal の順序確認
        assert events[0] == "domain"
        assert events.count("utterance") == 3
        assert events[-1] == "proposal"
