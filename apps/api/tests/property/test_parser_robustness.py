"""PBT — 任意文字列 → clean_utterance_output / clean_proposal_output が必ず str 返却 (spec 2026-05-21).

legacy ConsensusOrchestrator.parse (XML parser) は削除済み。
clean_utterance_output / clean_proposal_output の robustness を検証する。
"""
from __future__ import annotations

from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from yesman_api.domain.decision.consensus import (
    clean_utterance_output,
    clean_proposal_output,
)


@given(llm_output=st.text(max_size=500))
@settings(max_examples=100, suppress_health_check=[HealthCheck.function_scoped_fixture])
def test_clean_utterance_never_raises(llm_output):
    """任意文字列を入力しても clean_utterance_output は必ず str を返し、例外を送出しない."""
    result = clean_utterance_output(llm_output)
    assert isinstance(result, str)
    assert len(result) <= 200


@given(llm_output=st.text(max_size=500))
@settings(max_examples=100, suppress_health_check=[HealthCheck.function_scoped_fixture])
def test_clean_proposal_never_raises(llm_output):
    """任意文字列を入力しても clean_proposal_output は必ず str を返し、例外を送出しない."""
    result = clean_proposal_output(llm_output)
    assert isinstance(result, str)
    assert len(result) <= 100
