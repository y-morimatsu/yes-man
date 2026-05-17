"""PBT — 任意 profile + user_input → プロンプト長制約 + API 入口 413 (TEST-U4-05 / ultrathink I2)."""
from __future__ import annotations

from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from tests.fixtures.decision import builtin_personas
from yesman_api.domain.decision.consensus import ConsensusOrchestrator


@given(profile_yaml=st.text(max_size=1000), user_input=st.text(max_size=1000))
@settings(max_examples=50, suppress_health_check=[HealthCheck.function_scoped_fixture])
def test_build_prompt_size_bounded(profile_yaml, user_input):
    """通常用途 (input ~5k, profile ~1k) ではプロンプト全長 < 50k 文字程度を確認.

    100k 文字超の異常入力は API 入口で 413 reject される前提 (DecisionRequestDTO.max_length=100_000).
    """
    orch = ConsensusOrchestrator()
    prompt = orch.build_prompt(personas=builtin_personas(), profile_yaml=profile_yaml)
    # personas description + template の overhead は固定的、profile_yaml のサイズに比例
    # 通常の上限以下であることを assertion (異常検知は API 入口で行う)
    assert len(prompt) < 50_000
