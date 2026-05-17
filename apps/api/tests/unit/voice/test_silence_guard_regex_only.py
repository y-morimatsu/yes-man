"""SilenceGuard.evaluate_regex_only unit test (U6 Phase A.0a 拡張、3 ケース)."""
from __future__ import annotations

import pytest

from tests.fixtures.decision import mock_llm_provider_factory
from yesman_api.domain.decision.silence_guard import SilenceGuard


@pytest.fixture
def guard() -> SilenceGuard:
    return SilenceGuard(llm=mock_llm_provider_factory(override="none"), salt="test-salt")


def test_regex_match_returns_silenced(guard):
    verdict = guard.evaluate_regex_only(user_input="宗教について布教したい")
    assert verdict.is_silenced is True
    assert verdict.domain == "religion"


def test_regex_no_match_returns_allowed_without_llm(guard):
    """regex に該当しない場合は LLM を呼ばずに is_silenced=False を返す.

    既存 evaluate は LLM を呼ぶが、evaluate_regex_only は同期完結.
    """
    verdict = guard.evaluate_regex_only(user_input="今日のランチを決めて")
    assert verdict.is_silenced is False
    assert verdict.domain is None


def test_evaluate_regex_only_is_synchronous(guard):
    """同期メソッドであることを確認 (await 不要)."""
    result = guard.evaluate_regex_only(user_input="普通のテキスト")
    # async ではないので直接結果を取得できる
    assert hasattr(result, "is_silenced")
