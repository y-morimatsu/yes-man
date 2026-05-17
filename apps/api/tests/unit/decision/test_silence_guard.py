"""SilenceGuard — regex 4 ドメイン + LLM 自己判定 + fail-closed + hash."""
from __future__ import annotations

import pytest

from tests.fixtures.decision import mock_llm_provider_factory
from yesman_api.domain.decision.errors import DecisionError
from yesman_api.domain.decision.silence_guard import SilenceGuard


@pytest.fixture
def silence_guard():
    return SilenceGuard(llm=mock_llm_provider_factory(override="none"), salt="test-salt")


@pytest.mark.parametrize(
    "user_input,expected_domain",
    [
        ("宗教について教えて", "religion"),
        ("選挙の投票先を決めて", "election"),
        ("殺したい気持ちがある", "violence"),
        ("セックスの相手を選んで", "obscene"),
    ],
)
async def test_regex_silenced_domains(silence_guard, user_input, expected_domain):
    verdict = await silence_guard.evaluate(user_input=user_input)
    assert verdict.is_silenced is True
    assert verdict.domain == expected_domain
    assert verdict.response_text is not None


async def test_normal_input_not_silenced(silence_guard):
    verdict = await silence_guard.evaluate(user_input="今日のランチを決めて")
    assert verdict.is_silenced is False
    assert verdict.domain is None


async def test_llm_failure_fail_closed():
    """LLM 失敗時は fail-closed (is_silenced=True、ultrathink I1 反映)."""

    class FailingLLM:
        provider_name = "mock"

        async def complete(self, *, system, messages, temperature=0.7):
            raise DecisionError("llm_unavailable")

        async def stream(self, *, system, messages, temperature=0.7):
            if False:
                yield ""

        async def aclose(self):
            pass

    guard = SilenceGuard(llm=FailingLLM(), salt="x")
    verdict = await guard.evaluate(user_input="無害な普通の入力")
    assert verdict.is_silenced is True


def test_compute_input_hash_deterministic(silence_guard):
    h1 = silence_guard.compute_input_hash(user_id="u1", user_input="hello")
    h2 = silence_guard.compute_input_hash(user_id="u1", user_input="hello")
    assert h1 == h2
    assert len(h1) == 64  # sha256 hex


def test_compute_input_hash_user_scoped(silence_guard):
    h1 = silence_guard.compute_input_hash(user_id="u1", user_input="hello")
    h2 = silence_guard.compute_input_hash(user_id="u2", user_input="hello")
    assert h1 != h2
