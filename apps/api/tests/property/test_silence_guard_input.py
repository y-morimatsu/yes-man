"""PBT — 任意 user_input → SilenceVerdict 返却、例外なし (TEST-U4-04a / ultrathink I6)."""
from __future__ import annotations

import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from tests.fixtures.decision import mock_llm_provider_factory
from yesman_api.domain.decision.silence_guard import SilenceGuard


@given(user_input=st.text(max_size=200))
@settings(max_examples=100, suppress_health_check=[HealthCheck.function_scoped_fixture])
async def test_evaluate_never_raises(user_input):
    # Mock LLM が "none" を返すように設定 → 正規表現がヒットしなければ not silenced
    guard = SilenceGuard(llm=mock_llm_provider_factory(override="none"), salt="x")
    try:
        verdict = await guard.evaluate(user_input=user_input)
    except Exception as exc:
        pytest.fail(f"Unexpected exception type {type(exc).__name__}: {exc}")
    assert isinstance(verdict.is_silenced, bool)
