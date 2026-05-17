"""PBT — Mock LLM が任意の出力 → SilenceVerdict 返却、例外なし (TEST-U4-04b / ultrathink I6)."""
from __future__ import annotations

import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from tests.fixtures.decision import mock_llm_provider_factory
from yesman_api.domain.decision.silence_guard import SilenceGuard


@given(llm_output=st.text(max_size=500))
@settings(max_examples=100, suppress_health_check=[HealthCheck.function_scoped_fixture])
async def test_llm_judge_robust_to_arbitrary_output(llm_output):
    # 正規表現に該当しない普通の入力 + Mock LLM が任意の出力を返す
    guard = SilenceGuard(llm=mock_llm_provider_factory(override=llm_output), salt="x")
    try:
        verdict = await guard.evaluate(user_input="lunch")
    except Exception as exc:
        pytest.fail(f"Unexpected exception type {type(exc).__name__}: {exc}")
    assert isinstance(verdict.is_silenced, bool)
