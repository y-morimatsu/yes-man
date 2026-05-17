"""PBT — 任意文字列 → ConsensusOrchestrator.parse が必ず ConsensusOutput 返却、例外なし (TEST-U4-03)."""
from __future__ import annotations

import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from tests.fixtures.decision import builtin_personas
from yesman_api.domain.decision.consensus import ConsensusOrchestrator


@given(llm_output=st.text(max_size=500))
@settings(max_examples=100, suppress_health_check=[HealthCheck.function_scoped_fixture])
def test_parse_never_raises(llm_output):
    orch = ConsensusOrchestrator()
    try:
        result = orch.parse(llm_output, personas=builtin_personas())
    except Exception as exc:
        pytest.fail(f"Unexpected exception type {type(exc).__name__}: {exc}")
    # 必ず ConsensusOutput が返る
    assert result.domain_classification in ("daily", "work", "school", "major", "silenced")
    assert isinstance(result.utterances, list)
    assert isinstance(result.proposal_text, str)
