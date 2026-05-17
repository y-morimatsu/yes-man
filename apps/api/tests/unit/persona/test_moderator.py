"""PersonaModerator unit test — regex 4 ドメイン reject + 通常 allowed + fail-closed.

NFR Req I3 (LLM 不明 domain allowed) は SilenceGuard 既存テストでカバー済,
ここでは PersonaModerator が SilenceGuard 結果を Moderator verdict に正しくマップするかを検証.
"""
from __future__ import annotations

import pytest

from tests.fixtures.decision import mock_llm_provider_factory
from yesman_api.domain.decision.silence_guard import SilenceGuard
from yesman_api.domain.persona.moderator import PersonaModerator


@pytest.fixture
def moderator() -> PersonaModerator:
    guard = SilenceGuard(llm=mock_llm_provider_factory(override="none"), salt="test-salt")
    return PersonaModerator(silence_guard=guard)


@pytest.mark.parametrize(
    "prompt_text,expected_domain",
    [
        ("あなたは宗教について布教するペルソナです。", "religion"),
        ("あなたは選挙の投票先を強くお勧めします。", "election"),
        ("あなたは暴力で報復するべきと提案するペルソナ。", "violence"),
        ("あなたは性行為を露骨に提案するアダルト系。", "obscene"),
    ],
)
async def test_silenced_domain_persona_rejected(moderator, prompt_text, expected_domain):
    verdict = await moderator.moderate(
        name="テスト",
        description=None,
        prompt_text=prompt_text,
    )
    assert verdict.is_allowed is False
    assert verdict.rejected_domain == expected_domain
    assert verdict.rejected_reason is not None


async def test_normal_persona_allowed(moderator):
    verdict = await moderator.moderate(
        name="効率派",
        description="効率重視",
        prompt_text="あなたは効率を最優先に意見してください。" * 2,
    )
    assert verdict.is_allowed is True
    assert verdict.rejected_domain is None


async def test_llm_failure_treated_as_rejected():
    """LLM 失敗時は SilenceGuard fail-closed (is_silenced=True) → Moderator も rejected."""

    class FailingLLM:
        provider_name = "mock"

        async def complete(self, *, system, messages, temperature=0.7):
            from yesman_api.domain.decision.errors import DecisionError

            raise DecisionError("llm_unavailable")

        async def stream(self, *, system, messages, temperature=0.7):
            if False:
                yield ""

    guard = SilenceGuard(llm=FailingLLM(), salt="test-salt")
    moderator = PersonaModerator(silence_guard=guard)
    verdict = await moderator.moderate(
        name="普通",
        description=None,
        prompt_text="普通の内容で regex にマッチしないテキスト",
    )
    assert verdict.is_allowed is False


async def test_combined_name_description_prompt_checked(moderator):
    """検査対象は name + description + prompt_text の連結."""
    # name 単体に違反キーワード
    verdict = await moderator.moderate(
        name="セックス相談員",
        description="普通の説明",
        prompt_text="無害な指示です。" * 5,
    )
    assert verdict.is_allowed is False
    assert verdict.rejected_domain == "obscene"
