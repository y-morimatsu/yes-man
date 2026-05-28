"""demo_mode + DemoLLMAdapter の scripted ロジック単体テスト (stack 不要)."""
from __future__ import annotations

import pytest

from yesman_api.domain.decision import demo_mode
from yesman_api.infrastructure.decision.llm_providers.demo_adapter import DemoLLMAdapter


# ============================================================
# is_demo_user
# ============================================================
@pytest.mark.parametrize(
    "email,expected",
    [
        ("morimatsu@nec.com", True),
        ("y-morimatsu@example.com", True),
        ("MORIMATSU@nec.com", True),
        ("tanaka@nec.com", False),
        ("", False),
        (None, False),
    ],
)
def test_is_demo_user(email, expected):
    assert demo_mode.is_demo_user(email) is expected


# ============================================================
# topic / persona_line / proposal_text
# ============================================================
def test_match_topic_outfit():
    assert demo_mode.match_topic("外出着は何にすべき?") == demo_mode.TOPIC_OUTFIT
    assert demo_mode.match_topic("今日の服を決めて") == demo_mode.TOPIC_OUTFIT


def test_match_topic_deep_dive():
    assert demo_mode.match_topic("最近の俺、どう?") == demo_mode.TOPIC_DEEP_DIVE


def test_match_topic_none():
    assert demo_mode.match_topic("今日のランチを決めて") is None
    assert demo_mode.match_topic(None) is None


def test_persona_line_outfit():
    assert "襟付き" in demo_mode.persona_line(demo_mode.TOPIC_OUTFIT, "妻")
    assert demo_mode.persona_line(demo_mode.TOPIC_OUTFIT, "ワンコ") == "ワン!"
    assert demo_mode.persona_line(demo_mode.TOPIC_OUTFIT, "知らない人") is None


def test_proposal_text_outfit_depth_aware():
    root = demo_mode.proposal_text(demo_mode.TOPIC_OUTFIT, depth=0)
    final = demo_mode.proposal_text(demo_mode.TOPIC_OUTFIT, depth=1)
    assert "シャツ" in root and "開きますか" not in root  # root はソフト (not final)
    assert "シャツ" in final and "開きますか" in final  # depth>=1 で final + Amazon
    assert "Amazon" in final


def test_proposal_text_deep_dive_and_none():
    assert "委任度 73%" in demo_mode.proposal_text(demo_mode.TOPIC_DEEP_DIVE)
    assert demo_mode.proposal_text(None) is None


# ============================================================
# DemoLLMAdapter
# ============================================================
class _SpyDelegate:
    """委譲呼び出しを記録する fake delegate."""

    provider_name = "spy"

    def __init__(self) -> None:
        self.complete_calls = 0

    async def complete(self, *, system, messages, temperature=0.7) -> str:
        self.complete_calls += 1
        return "DELEGATED"

    async def stream(self, *, system, messages, temperature=0.7):
        yield "DELEGATED"

    async def aclose(self) -> None:
        return None


def _msgs(text: str) -> list[dict[str, str]]:
    return [{"role": "user", "content": text}]


@pytest.mark.asyncio
async def test_adapter_outfit_persona_line():
    spy = _SpyDelegate()
    adapter = DemoLLMAdapter(spy)
    out = await adapter.complete(
        system="あなたは「妻」です。", messages=_msgs("外出着は何にすべき?")
    )
    assert "襟付き" in out
    assert spy.complete_calls == 0  # scripted: 委譲しない


@pytest.mark.asyncio
async def test_adapter_outfit_proposal_root_soft():
    spy = _SpyDelegate()
    adapter = DemoLLMAdapter(spy)
    out = await adapter.complete(
        system="あなたは合議の最終的な助言をまとめます。",
        messages=_msgs("外出着は何にすべき?"),
    )
    assert "シャツ" in out and "開きますか" not in out  # root はソフト提案
    assert spy.complete_calls == 0


@pytest.mark.asyncio
async def test_adapter_outfit_proposal_final_with_chain():
    """Yes 連鎖 (chain_context あり) で final 化 → Amazon Fashion CTA に繋がる."""
    spy = _SpyDelegate()
    adapter = DemoLLMAdapter(spy)
    out = await adapter.complete(
        system="最終的な助言をまとめます。",
        messages=_msgs("[これまでの絞り込み: 襟付きシャツ]\n元の要望: 外出着は何にすべき?"),
    )
    assert "シャツ" in out and "開きますか" in out and "Amazon" in out
    assert spy.complete_calls == 0


@pytest.mark.asyncio
async def test_adapter_deep_dive_proposal():
    spy = _SpyDelegate()
    adapter = DemoLLMAdapter(spy)
    out = await adapter.complete(
        system="最終的な助言を返してください。", messages=_msgs("最近の俺、どう?")
    )
    assert "委任度 73%" in out
    assert spy.complete_calls == 0


@pytest.mark.asyncio
async def test_adapter_non_topic_delegates():
    """scripted トピック外は本物 adapter に委譲 (家族ペルソナで Bedrock 合議)."""
    spy = _SpyDelegate()
    adapter = DemoLLMAdapter(spy)
    out = await adapter.complete(
        system="あなたは「妻」です。", messages=_msgs("今日のランチを決めて")
    )
    assert out == "DELEGATED"
    assert spy.complete_calls == 1


@pytest.mark.asyncio
async def test_adapter_stream_chunks_scripted():
    spy = _SpyDelegate()
    adapter = DemoLLMAdapter(spy)
    chunks = [
        c
        async for c in adapter.stream(
            system="あなたは「娘」です。", messages=_msgs("外出着は何にすべき?")
        )
    ]
    assert "".join(chunks) == demo_mode.PERSONA_LINES["娘"]
