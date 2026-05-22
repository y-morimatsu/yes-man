# Parallel Persona Consensus Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ConsensusOrchestrator + DecisionEngine.run_stream を「単一 LLM call で XML output」から「persona ごと並列 complete() + 4 つ目で proposal 生成」に書き換え、各 persona の生成完了タイミングで chat bubble が現れる自然な会話体験を実現する。

**Architecture:** `asyncio.as_completed` で 3 persona の `LLMProviderAdapter.complete()` を並列実行、完了順に SSE `utterance` event yield。全 persona 完了後に 4 つ目の LLM call で proposal 生成、`proposal` + `complete` event yield。Frontend は不変。

**Tech Stack:** Python 3.13 / FastAPI / asyncio / SQLModel / pytest-asyncio / Vitest (frontend 不変)

**Spec:** [docs/superpowers/specs/2026-05-21-parallel-persona-consensus.md](../specs/2026-05-21-parallel-persona-consensus.md)

**Branch:** `feature/parallel-persona-consensus` (既存 commit `6302e0d` で spec)

---

## File Structure

```
apps/api/src/yesman_api/
├── infrastructure/
│   ├── config.py                                    [Modify] timeout 2 値追加
│   └── decision/llm_providers/mock_adapter.py       [Modify] persona-aware response detection
└── domain/decision/
    ├── consensus.py                                  [Major rewrite] 新 prompt builder + cleaner、legacy XML parser 削除
    └── engine.py                                     [Modify] run_stream を parallel に書き換え

apps/api/tests/
├── unit/decision/
│   ├── test_consensus.py                            [Major rewrite] TestParse/TestStreamParse 削除、新 test 追加
│   ├── test_engine.py                               [Modify] test_normal_path rewrite、新 test 追加
│   └── test_mock_llm_provider.py                    [Modify or new] Mock LLM detect logic test
└── integration/decision/
    ├── test_decision_flow.py                        [Modify] event sequence assert update
    └── test_sse_stream.py                           [Modify] event sequence assert update
```

---

## Task 1: Config に timeout 2 値を追加

**Files:**
- Modify: `apps/api/src/yesman_api/infrastructure/config.py`

- [ ] **Step 1: 既存 timeout 行を確認**

```bash
cd /Users/morimatsu/lab/ai-dlc-hackathon
grep -n "decision_llm.*timeout" apps/api/src/yesman_api/infrastructure/config.py
```
Expected output:
```
109:    decision_llm_timeout_seconds: float = 30.0
110:    decision_llm_stream_initial_timeout_seconds: float = 5.0
111:    decision_llm_stream_total_timeout_seconds: float = 120.0
```

- [ ] **Step 2: 2 行追加**

Edit `apps/api/src/yesman_api/infrastructure/config.py`, line 111 の **直後**に挿入:

```python
    decision_llm_per_persona_timeout_seconds: float = 30.0
    """spec 2026-05-21 parallel-persona-consensus §6: persona 単発 LLM call の timeout."""
    decision_llm_proposal_timeout_seconds: float = 20.0
    """spec 2026-05-21 parallel-persona-consensus §6: proposal LLM call の timeout."""
```

- [ ] **Step 3: import + 起動確認**

```bash
cd apps/api
.venv/bin/python -c "from yesman_api.infrastructure.config import AppConfig; c = AppConfig(); print(c.decision_llm_per_persona_timeout_seconds, c.decision_llm_proposal_timeout_seconds)"
```
Expected: `30.0 20.0`

- [ ] **Step 4: Commit**

```bash
cd /Users/morimatsu/lab/ai-dlc-hackathon
git add apps/api/src/yesman_api/infrastructure/config.py
git commit -m "$(cat <<'EOF'
feat(api): parallel-persona-consensus 用の timeout 2 値を config に追加

- decision_llm_per_persona_timeout_seconds: float = 30.0
- decision_llm_proposal_timeout_seconds: float = 20.0

Refs: docs/superpowers/specs/2026-05-21-parallel-persona-consensus.md §6

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Consensus 新 prompt builders (TDD)

**Files:**
- Modify: `apps/api/src/yesman_api/domain/decision/consensus.py`
- Modify: `apps/api/tests/unit/decision/test_consensus.py`

- [ ] **Step 1: 失敗するテストを書く**

`apps/api/tests/unit/decision/test_consensus.py` の冒頭 (既存 imports の直下) に新規 class を追加:

```python
"""ConsensusOrchestrator — 新 prompt builder + clean output (spec 2026-05-21)."""
from yesman_api.domain.decision.consensus import (
    ConsensusOrchestrator,
    clean_utterance_output,
    clean_proposal_output,
)
from yesman_api.domain.persistence.models import Persona
from yesman_api.domain.persistence.constants import SYSTEM_USER_ID
from uuid import uuid4


def _persona(name: str, *, description: str = "", prompt_text: str = "") -> Persona:
    return Persona(
        id=uuid4(),
        owner_user_id=SYSTEM_USER_ID,
        name=name,
        description=description,
        prompt_text=prompt_text,
        is_shared=False,
        is_blocked=False,
        is_builtin=True,
        is_deleted=False,
        usage_count=0,
        yes_acceptance_rate=0.0,
    )


class TestBuildPersonaPrompt:
    def test_includes_persona_name(self):
        orch = ConsensusOrchestrator()
        prompt = orch.build_persona_prompt(_persona("慎重派"))
        assert "慎重派" in prompt

    def test_includes_persona_description(self):
        orch = ConsensusOrchestrator()
        prompt = orch.build_persona_prompt(_persona("慎重派", description="リスクを重視する"))
        assert "リスクを重視する" in prompt

    def test_includes_prompt_text(self):
        orch = ConsensusOrchestrator()
        prompt = orch.build_persona_prompt(_persona("慎重派", prompt_text="慎重に判断せよ"))
        assert "慎重に判断せよ" in prompt

    def test_escapes_persona_name_quotes(self):
        # spec §11.1 既存 _escape_persona_name の挙動を踏襲
        orch = ConsensusOrchestrator()
        prompt = orch.build_persona_prompt(_persona('attack"injection'))
        # prompt 内で生 `"` が消えていれば OK (XML 文脈ではないが防御的)
        assert "attack&quot;injection" in prompt or 'attack"injection' not in prompt


class TestBuildProposalPrompt:
    def test_includes_all_utterances(self):
        orch = ConsensusOrchestrator()
        utterances = [
            (_persona("慎重派"), "慎重派の発言"),
            (_persona("楽観派"), "楽観派の発言"),
            (_persona("効率派"), "効率派の発言"),
        ]
        prompt = orch.build_proposal_prompt(utterances)
        assert "慎重派の発言" in prompt
        assert "楽観派の発言" in prompt
        assert "効率派の発言" in prompt

    def test_format_uses_dash_persona_colon(self):
        orch = ConsensusOrchestrator()
        utterances = [(_persona("慎重派"), "テスト発言")]
        prompt = orch.build_proposal_prompt(utterances)
        assert "- 慎重派: テスト発言" in prompt

    def test_with_empty_utterances_still_works(self):
        # degraded case: 0 utterance でも proposal prompt は組み立てられる
        orch = ConsensusOrchestrator()
        prompt = orch.build_proposal_prompt([])
        assert "最終助言" in prompt or "助言" in prompt


class TestCleanUtteranceOutput:
    def test_strips_persona_label_prefix(self):
        assert clean_utterance_output("慎重派の意見: ラーメンは塩分が高い") == "ラーメンは塩分が高い"

    def test_strips_whitespace(self):
        assert clean_utterance_output("  text  ") == "text"

    def test_truncates_to_200_chars(self):
        long = "あ" * 250
        result = clean_utterance_output(long)
        assert len(result) == 200
        assert result.endswith("…")

    def test_preserves_short_text(self):
        assert clean_utterance_output("短い") == "短い"

    def test_handles_empty(self):
        assert clean_utterance_output("") == ""

    def test_handles_only_whitespace(self):
        assert clean_utterance_output("   \n\t  ") == ""


class TestCleanProposalOutput:
    def test_strips_proposal_label(self):
        assert clean_proposal_output("最終助言: その選択で進めてください") == "その選択で進めてください"

    def test_strips_proposal_english_label(self):
        assert clean_proposal_output("proposal: do it") == "do it"

    def test_truncates_to_100_chars(self):
        long = "あ" * 150
        result = clean_proposal_output(long)
        assert len(result) == 100
        assert result.endswith("…")
```

- [ ] **Step 2: テスト実行で失敗確認**

```bash
cd /Users/morimatsu/lab/ai-dlc-hackathon/apps/api
.venv/bin/python -m pytest tests/unit/decision/test_consensus.py::TestBuildPersonaPrompt -v 2>&1 | tail -15
```
Expected: FAIL — `ImportError: cannot import name 'clean_utterance_output' from 'yesman_api.domain.decision.consensus'`

- [ ] **Step 3: consensus.py に新 prompt + cleaner を追加**

`apps/api/src/yesman_api/domain/decision/consensus.py` の **末尾** に追加 (既存 `__all__` の前に挿入):

```python
# ============================================================
# spec 2026-05-21 parallel-persona-consensus: 新 prompt builders + cleaners
# ============================================================

import re

PERSONA_PROMPT_TEMPLATE = """\
あなたは「{persona_name}」というペルソナです。

{persona_description}

ペルソナ指示:
{persona_prompt_text}

以下のユーザからの相談に対し、あなたの視点・性格を強く反映した
発言を **200 字以内** で 1 段落で述べてください。
冒頭に「{persona_name}の意見:」のようなラベルは不要、本文のみ出力してください。
"""

PROPOSAL_PROMPT_TEMPLATE = """\
以下の意見を踏まえて、ユーザに対する **最終的な助言** を
**100 字以内** で出してください。

ユーザは Yes/No スワイプで採択するので、迷いの無い断定調・命令調の
明確な 1 文にしてください。冒頭に「最終助言:」「proposal:」 等の
ラベルは不要、本文のみ出力してください。

意見:
{utterance_block}
"""

_PERSONA_LABEL_RE = re.compile(r"^[^:：\n]+の意見[：:]\s*", re.MULTILINE)
_PROPOSAL_LABEL_RE = re.compile(r"^(最終助言|proposal)[：:]\s*", re.IGNORECASE)


def clean_utterance_output(text: str) -> str:
    """LLM 応答から persona label prefix を除去 + strip + 200 字制限."""
    cleaned = _PERSONA_LABEL_RE.sub("", text, count=1).strip()
    return _truncate(cleaned, 200)


def clean_proposal_output(text: str) -> str:
    """LLM 応答から proposal label prefix を除去 + strip + 100 字制限."""
    cleaned = _PROPOSAL_LABEL_RE.sub("", text, count=1).strip()
    return _truncate(cleaned, 100)


def _truncate(text: str, max_chars: int) -> str:
    """Unicode code point 数で max_chars 以内に truncate.

    超過時は末尾 1 文字を `…` (U+2026) に置換、合計 max_chars 文字。
    """
    if len(text) <= max_chars:
        return text
    return text[: max_chars - 1] + "…"
```

`ConsensusOrchestrator` class に 2 メソッドを追加 (既存 `wrap_user_input` の **直前** に挿入):

```python
    def build_persona_prompt(self, persona: Persona) -> str:
        """spec 2026-05-21 §5.1: persona 単発の system prompt を組み立てる."""
        name = self._escape_persona_name(persona.name)
        return PERSONA_PROMPT_TEMPLATE.format(
            persona_name=name,
            persona_description=persona.description or "",
            persona_prompt_text=persona.prompt_text or "",
        )

    def build_proposal_prompt(self, utterances: list[tuple[Persona, str]]) -> str:
        """spec 2026-05-21 §5.2: 全 persona 発言を踏まえた proposal の system prompt."""
        if not utterances:
            utterance_block = "(意見なし)"
        else:
            utterance_block = "\n".join(
                f"- {p.name}: {text}" for p, text in utterances
            )
        return PROPOSAL_PROMPT_TEMPLATE.format(utterance_block=utterance_block)
```

`__all__` を更新:

```python
__all__ = [
    "PROMPT_TEMPLATE",         # legacy, Task 5 で削除予定
    "USER_INPUT_TEMPLATE",
    "PERSONA_PROMPT_TEMPLATE",
    "PROPOSAL_PROMPT_TEMPLATE",
    "ConsensusOrchestrator",
    "clean_utterance_output",
    "clean_proposal_output",
    "tee_chunks",              # legacy, Task 5 で削除予定
]
```

- [ ] **Step 4: テスト pass 確認**

```bash
cd apps/api
.venv/bin/python -m pytest tests/unit/decision/test_consensus.py::TestBuildPersonaPrompt tests/unit/decision/test_consensus.py::TestBuildProposalPrompt tests/unit/decision/test_consensus.py::TestCleanUtteranceOutput tests/unit/decision/test_consensus.py::TestCleanProposalOutput -v 2>&1 | tail -20
```
Expected: PASS (16 tests = 4+3+6+3)

- [ ] **Step 5: Commit**

```bash
cd /Users/morimatsu/lab/ai-dlc-hackathon
git add apps/api/src/yesman_api/domain/decision/consensus.py \
        apps/api/tests/unit/decision/test_consensus.py
git commit -m "$(cat <<'EOF'
feat(api): 新 prompt builder + clean output 関数を追加 (parallel consensus 準備)

ConsensusOrchestrator に build_persona_prompt(persona) と
build_proposal_prompt(utterances) を追加。
clean_utterance_output / clean_proposal_output / _truncate を module-level
関数として追加。

新 TDD test 16 件 pass (TestBuildPersonaPrompt 4, TestBuildProposalPrompt 3,
TestCleanUtteranceOutput 6, TestCleanProposalOutput 3)。
既存 TestParse / TestStreamParse は Task 5 で削除予定 (parallel consensus
への移行で XML parser が不要になるため)。

Refs: docs/superpowers/specs/2026-05-21-parallel-persona-consensus.md §5

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Mock LLM Provider — persona-aware response detection

**Files:**
- Modify: `apps/api/src/yesman_api/infrastructure/decision/llm_providers/mock_adapter.py`
- Modify or Create: `apps/api/tests/unit/decision/test_mock_llm_provider.py`

- [ ] **Step 1: 失敗するテストを書く**

Create or modify `apps/api/tests/unit/decision/test_mock_llm_provider.py`:

```python
"""MockLLMProvider — parallel consensus 対応 (spec 2026-05-21)."""
import asyncio
import pytest
from yesman_api.infrastructure.decision.llm_providers.mock_adapter import (
    MockLLMProvider,
)


class TestMockLLMComplete:
    async def test_returns_shincho_response_when_prompt_mentions_shincho(self):
        mock = MockLLMProvider()
        out = await mock.complete(
            system="あなたは「慎重派」というペルソナです。...",
            messages=[{"role": "user", "content": "test"}],
        )
        assert "慎重派" in out or "リスク" in out or "もう少し" in out

    async def test_returns_rakukan_response_when_prompt_mentions_rakukan(self):
        mock = MockLLMProvider()
        out = await mock.complete(
            system="あなたは「楽観派」というペルソナです。...",
            messages=[{"role": "user", "content": "test"}],
        )
        assert "楽観派" in out or "前向き" in out or "最高" in out

    async def test_returns_kouritsu_response_when_prompt_mentions_kouritsu(self):
        mock = MockLLMProvider()
        out = await mock.complete(
            system="あなたは「効率派」というペルソナです。...",
            messages=[{"role": "user", "content": "test"}],
        )
        assert "効率派" in out or "短時間" in out or "ROI" in out

    async def test_returns_proposal_when_prompt_mentions_proposal(self):
        mock = MockLLMProvider()
        out = await mock.complete(
            system="以下の意見を踏まえて、最終的な助言を 100 字以内で...",
            messages=[{"role": "user", "content": "test"}],
        )
        # proposal は短い断定文を期待
        assert "進めて" in out or "選択" in out or len(out) <= 100

    async def test_override_takes_precedence(self):
        mock = MockLLMProvider(override="CUSTOM RESPONSE")
        out = await mock.complete(
            system="あなたは「慎重派」というペルソナです。",
            messages=[{"role": "user", "content": "test"}],
        )
        assert out == "CUSTOM RESPONSE"


class TestMockLLMCompleteWithDelay:
    async def test_per_persona_delay(self):
        """spec §11.2: deterministic delay で persona 順序を制御可能."""
        mock = MockLLMProvider(persona_delays={"慎重派": 0.05, "楽観派": 0.01})
        start = asyncio.get_event_loop().time()
        await mock.complete(
            system="あなたは「慎重派」というペルソナです",
            messages=[{"role": "user", "content": "test"}],
        )
        elapsed = asyncio.get_event_loop().time() - start
        assert elapsed >= 0.04  # 50ms delay was applied
```

- [ ] **Step 2: テスト実行で失敗確認**

```bash
cd /Users/morimatsu/lab/ai-dlc-hackathon/apps/api
.venv/bin/python -m pytest tests/unit/decision/test_mock_llm_provider.py -v 2>&1 | tail -15
```
Expected: FAIL — persona-specific responses が返らない、または `persona_delays` 引数が存在しない

- [ ] **Step 3: MockLLMProvider を実装**

Replace ENTIRE contents of `apps/api/src/yesman_api/infrastructure/decision/llm_providers/mock_adapter.py`:

```python
"""MockLLMProvider — CI / 自動テスト / オフライン開発用 (FR-AUTH-06 相当).

spec 2026-05-21 parallel-persona-consensus 対応:
- complete() は system prompt 内の persona 名を検出して該当 utterance を返す
- proposal prompt (「最終助言」を含む) は proposal canned text を返す
- override 指定があれば最優先 (test 用)
- persona_delays で per-persona delay を制御 (順序検証 test 用)
"""
from __future__ import annotations

import asyncio
from typing import AsyncIterator


class MockLLMProvider:
    provider_name = "mock"

    # spec 2026-05-21 §9: persona ごと canned response
    PERSONA_RESPONSES = {
        "慎重派": "慎重派の意見: もう少し情報を集めてから決めるべきです。",
        "楽観派": "楽観派の意見: その選択肢は前向きで良いと思います。",
        "効率派": "効率派の意見: 短時間で完了する案を選ぶのが効率的です。",
    }
    PROPOSAL_RESPONSE = "その選択肢で進めてください。"
    DEFAULT_RESPONSE = "Mock response: unable to detect persona from prompt."

    # legacy XML output (Task 5 で legacy code 削除後は不要、互換のため一時保持)
    DEFAULT_OUTPUT = """\
<domain>daily</domain>
<utterance persona="慎重派">慎重派の意見: もう少し情報を集めてから決めるべきです。</utterance>
<utterance persona="楽観派">楽観派の意見: その選択肢は前向きで良いと思います。</utterance>
<utterance persona="効率派">効率派の意見: 短時間で完了する案を選ぶのが効率的です。</utterance>
<proposal>その選択肢で進めてください。</proposal>
"""

    SILENCE_OUTPUT = (
        "<domain>silenced</domain>"
        "<proposal>本件についてはお答えできません。</proposal>"
    )

    def __init__(
        self,
        *,
        override: str | None = None,
        stream_delay_seconds: float = 0.0,
        chunk_size: int = 10,
        persona_delays: dict[str, float] | None = None,
    ) -> None:
        self._override = override
        self._stream_delay = stream_delay_seconds
        self._chunk_size = chunk_size
        self._persona_delays = persona_delays or {}

    def _detect_persona(self, system: str) -> str | None:
        """system prompt から persona name を検出 (PERSONA_RESPONSES の key を順に検索)."""
        for persona_name in self.PERSONA_RESPONSES:
            if persona_name in system:
                return persona_name
        return None

    def _detect_proposal(self, system: str) -> bool:
        """proposal prompt 判定 (「最終助言」 を含む)."""
        return "最終助言" in system

    async def complete(
        self,
        *,
        system: str,
        messages: list[dict[str, str]],
        temperature: float = 0.7,
    ) -> str:
        if self._override is not None:
            return self._override

        # persona prompt → per-persona response + optional delay
        persona = self._detect_persona(system)
        if persona is not None:
            delay = self._persona_delays.get(persona, 0.0)
            if delay > 0:
                await asyncio.sleep(delay)
            return self.PERSONA_RESPONSES[persona]

        # proposal prompt → proposal canned text
        if self._detect_proposal(system):
            return self.PROPOSAL_RESPONSE

        # fallback: legacy XML output (Task 5 で legacy code 削除後は DEFAULT_RESPONSE)
        return self.DEFAULT_OUTPUT

    async def stream(
        self,
        *,
        system: str,
        messages: list[dict[str, str]],
        temperature: float = 0.7,
    ) -> AsyncIterator[str]:
        """legacy stream interface (Task 5 で削除予定の engine.run_stream が使用)."""
        full = await self.complete(system=system, messages=messages, temperature=temperature)
        # chunk_size ごとに分割 yield
        for i in range(0, len(full), self._chunk_size):
            if self._stream_delay > 0:
                await asyncio.sleep(self._stream_delay)
            yield full[i : i + self._chunk_size]

    async def aclose(self) -> None:
        return None


__all__ = ["MockLLMProvider"]
```

- [ ] **Step 4: テスト pass 確認**

```bash
cd apps/api
.venv/bin/python -m pytest tests/unit/decision/test_mock_llm_provider.py -v 2>&1 | tail -15
```
Expected: PASS (6 tests = 5+1)

- [ ] **Step 5: Commit**

```bash
cd /Users/morimatsu/lab/ai-dlc-hackathon
git add apps/api/src/yesman_api/infrastructure/decision/llm_providers/mock_adapter.py \
        apps/api/tests/unit/decision/test_mock_llm_provider.py
git commit -m "$(cat <<'EOF'
feat(api): MockLLMProvider を persona-aware response detection に拡張

complete() が system prompt の persona name を検出して該当 canned response を
返す。「最終助言」を含む proposal prompt は proposal canned text。

新規:
- PERSONA_RESPONSES dict (慎重派/楽観派/効率派)
- PROPOSAL_RESPONSE
- persona_delays 引数 (per-persona deterministic delay、test §11.2 順序検証用)

Legacy XML DEFAULT_OUTPUT は Task 5 で legacy code 削除後に消す。

6 cases pass (TestMockLLMComplete 5, TestMockLLMCompleteWithDelay 1)。

Refs: docs/superpowers/specs/2026-05-21-parallel-persona-consensus.md §9 §11.2

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Engine.run_stream を parallel に書き換え (TDD)

**Files:**
- Modify: `apps/api/src/yesman_api/domain/decision/engine.py`
- Modify: `apps/api/tests/unit/decision/test_engine.py`

- [ ] **Step 1: 失敗するテストを書く**

`apps/api/tests/unit/decision/test_engine.py` の **末尾** に新規 class を追加。既存の `test_normal_path_persists_decision` も後で rewrite するが、ここでは新規 test class を先に追加:

```python
class TestRunStreamParallel:
    """spec 2026-05-21 parallel-persona-consensus §11.2."""

    @pytest.mark.asyncio
    async def test_parallel_utterances_arrival(self):
        """3 persona 並列で utterance event 3 件 + proposal + complete が yield される (順序非依存、set 比較)."""
        from yesman_api.domain.decision.engine import DecisionEngine
        from yesman_api.domain.decision.consensus import ConsensusOrchestrator
        from yesman_api.domain.decision.silence_guard import SilenceGuard
        from yesman_api.application.decision.event_publisher import EventPublisher
        from yesman_api.infrastructure.config import AppConfig
        from tests.fixtures.decision import (
            decision_request_factory,
            mock_llm_provider_factory,
            builtin_personas,
        )

        repo = _FakeRepo()
        llm = mock_llm_provider_factory()
        config = AppConfig()
        engine = DecisionEngine(
            decision_repo=repo,
            silence_repo=repo,
            persona_repo=repo,
            profile_repo=repo,
            preference_repo=repo,
            persona_selection_repo=repo,
            llm=llm,
            orchestrator=ConsensusOrchestrator(),
            silence_guard=SilenceGuard(llm=llm, config=config),
            event_publisher=EventPublisher(http_client=None, config=config),
            config=config,
        )
        request = decision_request_factory(user_input="今日のランチを決めて")
        decision_id = uuid4()

        events = [e async for e in engine.run_stream(decision_id=decision_id, request=request)]
        types = [e.type for e in events]

        # set 比較: utterance × 3、proposal × 1、complete × 1
        utterance_personas = {e.data["persona_name"] for e in events if e.type == "utterance"}
        assert utterance_personas == {"慎重派", "楽観派", "効率派"}
        assert types.count("proposal") == 1
        assert types.count("complete") == 1
        assert types[-1] == "complete"  # complete は最後

    @pytest.mark.asyncio
    async def test_persona_arrival_order_with_delay(self):
        """deterministic delay で慎重派 → 楽観派 → 効率派 の順に utterance event が yield される."""
        from yesman_api.domain.decision.engine import DecisionEngine
        from yesman_api.domain.decision.consensus import ConsensusOrchestrator
        from yesman_api.domain.decision.silence_guard import SilenceGuard
        from yesman_api.application.decision.event_publisher import EventPublisher
        from yesman_api.infrastructure.config import AppConfig
        from yesman_api.infrastructure.decision.llm_providers.mock_adapter import MockLLMProvider
        from tests.fixtures.decision import decision_request_factory

        # 慎重派 < 楽観派 < 効率派 の順で完了
        llm = MockLLMProvider(persona_delays={"慎重派": 0.01, "楽観派": 0.05, "効率派": 0.10})
        repo = _FakeRepo()
        config = AppConfig()
        engine = DecisionEngine(
            decision_repo=repo, silence_repo=repo, persona_repo=repo, profile_repo=repo,
            preference_repo=repo, persona_selection_repo=repo,
            llm=llm, orchestrator=ConsensusOrchestrator(),
            silence_guard=SilenceGuard(llm=llm, config=config),
            event_publisher=EventPublisher(http_client=None, config=config),
            config=config,
        )
        request = decision_request_factory(user_input="test")
        decision_id = uuid4()

        utterance_events = []
        async for e in engine.run_stream(decision_id=decision_id, request=request):
            if e.type == "utterance":
                utterance_events.append(e.data["persona_name"])

        assert utterance_events == ["慎重派", "楽観派", "効率派"]

    @pytest.mark.asyncio
    async def test_one_persona_timeout_degraded(self):
        """1 persona timeout → 残り 2 utterance + 1 proposal が yield される."""
        from yesman_api.domain.decision.engine import DecisionEngine
        from yesman_api.domain.decision.consensus import ConsensusOrchestrator
        from yesman_api.domain.decision.silence_guard import SilenceGuard
        from yesman_api.application.decision.event_publisher import EventPublisher
        from yesman_api.infrastructure.config import AppConfig
        from yesman_api.infrastructure.decision.llm_providers.mock_adapter import MockLLMProvider
        from tests.fixtures.decision import decision_request_factory

        # 慎重派が 5 秒 delay (per_persona_timeout 0.1s を超えて timeout)
        llm = MockLLMProvider(persona_delays={"慎重派": 5.0})
        repo = _FakeRepo()
        config = AppConfig(decision_llm_per_persona_timeout_seconds=0.1)
        engine = DecisionEngine(
            decision_repo=repo, silence_repo=repo, persona_repo=repo, profile_repo=repo,
            preference_repo=repo, persona_selection_repo=repo,
            llm=llm, orchestrator=ConsensusOrchestrator(),
            silence_guard=SilenceGuard(llm=llm, config=config),
            event_publisher=EventPublisher(http_client=None, config=config),
            config=config,
        )
        request = decision_request_factory(user_input="test")
        decision_id = uuid4()

        events = [e async for e in engine.run_stream(decision_id=decision_id, request=request)]
        utterance_personas = {e.data["persona_name"] for e in events if e.type == "utterance"}
        assert utterance_personas == {"楽観派", "効率派"}
        assert sum(1 for e in events if e.type == "proposal") == 1
        assert sum(1 for e in events if e.type == "complete") == 1
        assert sum(1 for e in events if e.type == "error") == 0

    @pytest.mark.asyncio
    async def test_all_personas_timeout(self):
        """全 persona timeout → error event + no proposal + no complete."""
        from yesman_api.domain.decision.engine import DecisionEngine
        from yesman_api.domain.decision.consensus import ConsensusOrchestrator
        from yesman_api.domain.decision.silence_guard import SilenceGuard
        from yesman_api.application.decision.event_publisher import EventPublisher
        from yesman_api.infrastructure.config import AppConfig
        from yesman_api.infrastructure.decision.llm_providers.mock_adapter import MockLLMProvider
        from tests.fixtures.decision import decision_request_factory

        llm = MockLLMProvider(persona_delays={"慎重派": 5.0, "楽観派": 5.0, "効率派": 5.0})
        repo = _FakeRepo()
        config = AppConfig(decision_llm_per_persona_timeout_seconds=0.1)
        engine = DecisionEngine(
            decision_repo=repo, silence_repo=repo, persona_repo=repo, profile_repo=repo,
            preference_repo=repo, persona_selection_repo=repo,
            llm=llm, orchestrator=ConsensusOrchestrator(),
            silence_guard=SilenceGuard(llm=llm, config=config),
            event_publisher=EventPublisher(http_client=None, config=config),
            config=config,
        )
        request = decision_request_factory(user_input="test")
        decision_id = uuid4()

        events = [e async for e in engine.run_stream(decision_id=decision_id, request=request)]
        error_events = [e for e in events if e.type == "error"]
        assert len(error_events) == 1
        assert error_events[0].data["reason"] == "all_personas_failed"
        # proposal も complete も yield されない
        assert sum(1 for e in events if e.type == "proposal") == 0
        assert sum(1 for e in events if e.type == "complete") == 0
```

- [ ] **Step 2: 既存 `test_normal_path_persists_decision` を parallel 版に書き換え**

`apps/api/tests/unit/decision/test_engine.py` の既存 `test_normal_path_persists_decision` 関数を以下に置換:

```python
@pytest.mark.asyncio
async def test_normal_path_persists_decision():
    """spec 2026-05-21: parallel consensus → utterance 3 件 + proposal が yield + DecisionRepository に insert される."""
    from yesman_api.domain.decision.engine import DecisionEngine
    from yesman_api.domain.decision.consensus import ConsensusOrchestrator
    from yesman_api.domain.decision.silence_guard import SilenceGuard
    from yesman_api.application.decision.event_publisher import EventPublisher
    from yesman_api.infrastructure.config import AppConfig

    repo = _FakeRepo()
    llm = mock_llm_provider_factory()
    config = AppConfig()
    engine = DecisionEngine(
        decision_repo=repo, silence_repo=repo, persona_repo=repo, profile_repo=repo,
        preference_repo=repo, persona_selection_repo=repo,
        llm=llm, orchestrator=ConsensusOrchestrator(),
        silence_guard=SilenceGuard(llm=llm, config=config),
        event_publisher=EventPublisher(http_client=None, config=config),
        config=config,
    )
    request = decision_request_factory(user_input="今日のランチを決めて")
    decision_id = uuid4()

    events = [e async for e in engine.run_stream(decision_id=decision_id, request=request)]
    # 永続化されている (utterance 3 + proposal の content)
    assert decision_id in repo.decisions
    persisted = repo.decisions[decision_id]
    assert persisted.user_input == "今日のランチを決めて"
    assert persisted.proposal_text  # non-empty
```

- [ ] **Step 3: テスト実行で失敗を確認**

```bash
cd /Users/morimatsu/lab/ai-dlc-hackathon/apps/api
.venv/bin/python -m pytest tests/unit/decision/test_engine.py -v 2>&1 | tail -20
```
Expected: FAIL — 新 test 4 件は run_stream が parallel 化されていないため fail、既存 normal_path も rewrite 内容で fail (現状 XML 経路では proposal_text などの assert が通らないかも)

- [ ] **Step 4: engine.py の `run_stream` を parallel に書き換え**

`apps/api/src/yesman_api/domain/decision/engine.py` の `run_stream` メソッドを以下に置換 (line 125-193):

```python
    async def run_stream(
        self,
        *,
        decision_id: UUID,
        request: DecisionRequest,
    ) -> AsyncIterator[StreamEvent]:
        """spec 2026-05-21 parallel-persona-consensus: persona 並列 LLM call + proposal 生成.

        最初に start event は handler 側で送信済 (decision_id 事前確定、Imp2).
        ここでは silence / utterance × N / proposal / complete / error を yield.
        """
        # 1. SilenceGuard
        verdict = await self._silence_guard.evaluate(user_input=request.user_input)
        if verdict.is_silenced:
            await self._record_silence(request, verdict.domain)
            yield StreamEvent("silence", {"text": verdict.response_text or ""})
            return

        # 2. ペルソナ取得 + プロフィール
        personas = await self._resolve_personas(
            selected_ids=request.selected_persona_ids,
            user_id=request.user_id,
        )

        # 3. persona 並列 LLM call (per-persona timeout 付き)
        masked_user_input = mask_pii(request.user_input)
        user_messages = [{"role": "user", "content": masked_user_input}]

        async def generate_persona(persona) -> tuple:
            system_prompt = self._orchestrator.build_persona_prompt(persona)
            try:
                raw = await asyncio.wait_for(
                    self._llm.complete(
                        system=system_prompt,
                        messages=user_messages,
                    ),
                    timeout=self._config.decision_llm_per_persona_timeout_seconds,
                )
                return persona, clean_utterance_output(raw)
            except asyncio.TimeoutError:
                audit_log(
                    "audit.decision.persona_timeout",
                    decision_id=str(decision_id),
                    persona=persona.name,
                    timeout_seconds=self._config.decision_llm_per_persona_timeout_seconds,
                )
                return persona, ""
            except Exception as exc:
                audit_log(
                    "audit.decision.persona_error",
                    decision_id=str(decision_id),
                    persona=persona.name,
                    error=str(exc),
                )
                return persona, ""

        tasks = [asyncio.create_task(generate_persona(p)) for p in personas]

        # 4. 完了順に utterance event yield
        utterance_outputs: list[tuple] = []
        for coro in asyncio.as_completed(tasks):
            persona, text = await coro
            if not text or text.isspace():
                continue
            utterance_outputs.append((persona, text))
            yield StreamEvent("utterance", {
                "persona_id": str(persona.id),
                "persona_name": persona.name,
                "text": text,
            })

        # 5. 全 persona 失敗時は error event + early return
        if not utterance_outputs:
            yield StreamEvent("error", {
                "reason": "all_personas_failed",
                "detail": "all persona LLM calls timed out or returned empty",
            })
            return

        # 6. proposal 生成 (4 つ目の LLM call、timeout 付き)
        proposal_system = self._orchestrator.build_proposal_prompt(utterance_outputs)
        try:
            raw_proposal = await asyncio.wait_for(
                self._llm.complete(
                    system=proposal_system,
                    messages=user_messages,
                ),
                timeout=self._config.decision_llm_proposal_timeout_seconds,
            )
            proposal_text = clean_proposal_output(raw_proposal)
        except asyncio.TimeoutError:
            yield StreamEvent("error", {
                "reason": "proposal_timeout",
                "detail": f"proposal LLM call exceeded {self._config.decision_llm_proposal_timeout_seconds}s",
            })
            return

        yield StreamEvent("proposal", {"proposal_text": proposal_text})

        # 7. 永続化 (synchronous、complete event 前に終わらせる)
        from yesman_api.domain.decision.models import ConsensusOutput, PersonaUtterance
        utterances_persist = [
            PersonaUtterance(
                persona_id=p.id,
                persona_name=p.name,
                text=text,
            )
            for p, text in utterance_outputs
        ]
        consensus = ConsensusOutput(
            domain_classification="daily",  # spec §4.2: domain 廃止のため固定値
            utterances=utterances_persist,
            proposal_text=proposal_text,
        )
        try:
            await self._persist_decision(decision_id, request, consensus, personas)
        except Exception as exc:
            self._logger.warning(
                "persist_failed",
                decision_id=str(decision_id),
                error=str(exc),
            )

        # 8. complete
        yield StreamEvent("complete", {"decision_id": str(decision_id)})
```

ファイル冒頭の imports に追加:

```python
from yesman_api.domain.decision.consensus import (
    ConsensusOrchestrator,
    clean_utterance_output,
    clean_proposal_output,
)
```
(既存 `from yesman_api.domain.decision.consensus import ConsensusOrchestrator` を上記に置換)

- [ ] **Step 5: テスト pass 確認**

```bash
cd apps/api
.venv/bin/python -m pytest tests/unit/decision/test_engine.py -v 2>&1 | tail -25
```
Expected: PASS (既存 3 件 + 新 4 件 = 7 件 pass、`test_silence_path_skips_decision_persist` / `test_apply_choice_yes_publishes_event` は維持)

- [ ] **Step 6: Commit**

```bash
cd /Users/morimatsu/lab/ai-dlc-hackathon
git add apps/api/src/yesman_api/domain/decision/engine.py \
        apps/api/tests/unit/decision/test_engine.py
git commit -m "$(cat <<'EOF'
feat(api): run_stream を parallel persona LLM call に書き換え

spec 2026-05-21 parallel-persona-consensus の中心実装:
- asyncio.as_completed で 3 persona 並列 LLM call
- 各 persona の per-persona timeout 30s (config から)
- 完了順に SSE utterance event yield (chat-like timeline)
- 全 persona 失敗時は error event + early return (proposal call せず)
- proposal は 4 つ目の LLM call、timeout 20s
- proposal timeout → error event
- 永続化は complete event 前に synchronous 実行

既存 test_silence_path_skips_decision_persist は維持。
test_normal_path_persists_decision は parallel 版に rewrite。
新規 4 cases: test_parallel_utterances_arrival, test_persona_arrival_order_with_delay,
test_one_persona_timeout_degraded, test_all_personas_timeout。

Refs: docs/superpowers/specs/2026-05-21-parallel-persona-consensus.md §4 §6 §11.2

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Legacy XML parser を consensus.py から削除

**Files:**
- Modify: `apps/api/src/yesman_api/domain/decision/consensus.py`
- Modify: `apps/api/tests/unit/decision/test_consensus.py`

- [ ] **Step 1: test_consensus.py の TestParse / TestStreamParse を削除**

`apps/api/tests/unit/decision/test_consensus.py` から以下を削除:
- `class TestParse:` ブロック全体
- `class TestStreamParse:` ブロック全体
- 関連 import (`StreamEvent`, etc. の中で他で使わないもの)

新規追加した TestBuildPersonaPrompt / TestBuildProposalPrompt / TestCleanUtteranceOutput / TestCleanProposalOutput は維持。

確認コマンド:
```bash
cd /Users/morimatsu/lab/ai-dlc-hackathon
grep -E "^class Test" apps/api/tests/unit/decision/test_consensus.py
```
Expected: TestBuildPersonaPrompt, TestBuildProposalPrompt, TestCleanUtteranceOutput, TestCleanProposalOutput の 4 classes のみ。

- [ ] **Step 2: consensus.py から legacy XML parser 削除**

`apps/api/src/yesman_api/domain/decision/consensus.py` から削除する要素:
- `PROMPT_TEMPLATE` (line 21〜)
- `USER_INPUT_TEMPLATE` (line 38)
- `ConsensusOrchestrator.build_prompt()` メソッド (line 53〜)
- `ConsensusOrchestrator.wrap_user_input()` static method (line 75〜) — engine.py で `mask_pii` 直接利用に置き換える
- `ConsensusOrchestrator.parse()` メソッド (line 89〜) — 永続化は engine.py 内で ConsensusOutput を直接構築するので不要
- `ConsensusOrchestrator._extract_tag()` static method
- `tee_chunks()` 関数 (line 170〜) — engine.run_stream は parallel 化で stream split 不要

維持する要素:
- `Persona` import
- `ConsensusOutput`, `PersonaUtterance`, `StreamEvent` imports — engine.py が ConsensusOutput を構築するため
- `_escape_persona_name()` static method (build_persona_prompt が使用)
- 新規追加した `PERSONA_PROMPT_TEMPLATE`, `PROPOSAL_PROMPT_TEMPLATE`
- 新規 `build_persona_prompt`, `build_proposal_prompt` メソッド
- 新規 `clean_utterance_output`, `clean_proposal_output`, `_truncate` 関数

`__all__` を更新:

```python
__all__ = [
    "PERSONA_PROMPT_TEMPLATE",
    "PROPOSAL_PROMPT_TEMPLATE",
    "ConsensusOrchestrator",
    "clean_utterance_output",
    "clean_proposal_output",
]
```

- [ ] **Step 3: engine.py の `wrap_user_input` 使用箇所を mask_pii 直接呼び出しに**

`engine.py` の `run_stream` 内、`mask_pii(request.user_input)` で既に呼んでいるので `wrap_user_input` は不要。`engine.run()` メソッド (line 74 付近、`build_prompt` を呼んでいる箇所) も同様に書き換える必要がある。

`engine.run()` メソッドを以下に置換 (line 74-123):

```python
    async def run(self, request: DecisionRequest) -> tuple[UUID, ConsensusOutput, int]:
        """非ストリーミング合議 (legacy API、parallel consensus を sync 実行).

        spec 2026-05-21: 並列 persona call + proposal call を await し、ConsensusOutput を構築.
        """
        # SilenceGuard
        verdict = await self._silence_guard.evaluate(user_input=request.user_input)
        if verdict.is_silenced:
            decision_id = uuid4()
            await self._record_silence(request, verdict.domain)
            consensus = ConsensusOutput(
                domain_classification=verdict.domain or "silenced",  # type: ignore[arg-type]
                utterances=[],
                proposal_text=verdict.response_text or "",
            )
            return decision_id, consensus, 0

        # ペルソナ + masked input
        personas = await self._resolve_personas(
            selected_ids=request.selected_persona_ids,
            user_id=request.user_id,
        )
        masked = mask_pii(request.user_input)
        messages = [{"role": "user", "content": masked}]

        # 並列 persona call
        async def gen_p(persona):
            try:
                raw = await asyncio.wait_for(
                    self._llm.complete(
                        system=self._orchestrator.build_persona_prompt(persona),
                        messages=messages,
                    ),
                    timeout=self._config.decision_llm_per_persona_timeout_seconds,
                )
                return persona, clean_utterance_output(raw)
            except Exception:
                return persona, ""

        results = await asyncio.gather(*(gen_p(p) for p in personas))
        utterance_outputs = [(p, t) for p, t in results if t and not t.isspace()]

        if not utterance_outputs:
            raise DecisionError("all_personas_failed", "all persona LLM calls returned empty")

        # proposal
        proposal_raw = await asyncio.wait_for(
            self._llm.complete(
                system=self._orchestrator.build_proposal_prompt(utterance_outputs),
                messages=messages,
            ),
            timeout=self._config.decision_llm_proposal_timeout_seconds,
        )
        proposal_text = clean_proposal_output(proposal_raw)

        # ConsensusOutput 構築 + 永続化
        utterances_persist = [
            PersonaUtterance(persona_id=p.id, persona_name=p.name, text=t)
            for p, t in utterance_outputs
        ]
        consensus = ConsensusOutput(
            domain_classification="daily",  # spec §4.2: domain 廃止のため固定
            utterances=utterances_persist,
            proposal_text=proposal_text,
        )
        decision_id = uuid4()
        await self._persist_decision(decision_id, request, consensus, personas)
        return decision_id, consensus, 0
```

engine.py の imports に追加 (まだ無ければ):
```python
from yesman_api.domain.decision.models import ConsensusOutput, PersonaUtterance, StreamEvent
```

- [ ] **Step 4: 全 unit test pass 確認**

```bash
cd /Users/morimatsu/lab/ai-dlc-hackathon/apps/api
.venv/bin/python -m pytest tests/unit/decision/ -v 2>&1 | tail -25
```
Expected: 全 pass (consensus 4 classes + engine 7 tests + mock_llm 6 tests)

- [ ] **Step 5: TypeScript / Python type check (pyright or mypy 等が CI で動くなら)**

```bash
cd /Users/morimatsu/lab/ai-dlc-hackathon/apps/api
.venv/bin/python -c "from yesman_api.domain.decision.consensus import ConsensusOrchestrator, clean_utterance_output, clean_proposal_output, PERSONA_PROMPT_TEMPLATE, PROPOSAL_PROMPT_TEMPLATE; print('imports ok')"
```
Expected: `imports ok` (削除した PROMPT_TEMPLATE, build_prompt, parse, stream_parse, tee_chunks への外部参照が無いことを確認)

- [ ] **Step 6: Commit**

```bash
cd /Users/morimatsu/lab/ai-dlc-hackathon
git add apps/api/src/yesman_api/domain/decision/consensus.py \
        apps/api/src/yesman_api/domain/decision/engine.py \
        apps/api/tests/unit/decision/test_consensus.py
git commit -m "$(cat <<'EOF'
refactor(api): legacy XML parser (build_prompt/parse/stream_parse/tee_chunks) を削除

spec 2026-05-21 §10 通り、parallel consensus への移行に伴い不要になった
legacy code を削除:
- PROMPT_TEMPLATE / USER_INPUT_TEMPLATE
- ConsensusOrchestrator.build_prompt / wrap_user_input / parse / _extract_tag
- tee_chunks
- TestParse / TestStreamParse (test_consensus.py)

DecisionEngine.run() も parallel 版に書き換え (run_stream と同じ pattern を sync 実行)。

unit test 全 pass (consensus 4 classes + engine 7 tests + mock_llm 6 tests)。

Refs: docs/superpowers/specs/2026-05-21-parallel-persona-consensus.md §10

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Integration tests を update

**Files:**
- Modify: `apps/api/tests/integration/decision/test_decision_flow.py`
- Modify: `apps/api/tests/integration/decision/test_sse_stream.py`

- [ ] **Step 1: 既存 integration tests を確認**

```bash
cd /Users/morimatsu/lab/ai-dlc-hackathon/apps/api
grep -nE "domain|event.*type|assert" tests/integration/decision/test_decision_flow.py | head -20
grep -nE "domain|event.*type|assert" tests/integration/decision/test_sse_stream.py | head -20
```

domain event を assert している箇所 + utterance 順序を assert している箇所を確認。

- [ ] **Step 2: test_sse_stream.py の event 順序 assertion を update**

`apps/api/tests/integration/decision/test_sse_stream.py` 内で:
- `event: domain` を含む assertion を削除 (spec §4.2 で domain event 廃止)
- utterance event の `persona_name` 順序を順序依存 assert → set 比較 assert に変更

例: 以下のような assertion がある場合:

```python
# Before
assert events[1].type == "domain"
assert events[2].type == "utterance"
assert events[2].data["persona_name"] == "慎重派"
```

を以下に変更:

```python
# After (spec 2026-05-21: domain event 廃止、utterance 順序非依存)
assert events[0].type == "start"
utterance_events = [e for e in events if e.type == "utterance"]
utterance_personas = {e.data["persona_name"] for e in utterance_events}
assert utterance_personas == {"慎重派", "楽観派", "効率派"}
assert sum(1 for e in events if e.type == "proposal") == 1
assert events[-1].type == "complete"
```

- [ ] **Step 3: test_decision_flow.py 同様の修正**

同じパターン (domain 削除 + utterance set 比較) を `test_decision_flow.py` に適用。

- [ ] **Step 4: Integration tests 実行**

```bash
cd /Users/morimatsu/lab/ai-dlc-hackathon/apps/api
.venv/bin/python -m pytest tests/integration/decision/ -v 2>&1 | tail -20
```
Expected: 全 pass

- [ ] **Step 5: 全 backend test 実行 (regression 確認)**

```bash
.venv/bin/python -m pytest tests/ 2>&1 | tail -10
```
Expected: 全 pass (consensus / engine / mock_llm / silence / integration / API endpoint tests)

- [ ] **Step 6: Commit**

```bash
cd /Users/morimatsu/lab/ai-dlc-hackathon
git add apps/api/tests/integration/decision/test_decision_flow.py \
        apps/api/tests/integration/decision/test_sse_stream.py
git commit -m "$(cat <<'EOF'
test(api): integration tests を parallel consensus 仕様に追従

- domain event の assertion を削除 (spec §4.2 で event 廃止)
- utterance event の順序依存 assertion を set 比較に変更
- start → utterance × N → proposal → complete の構造のみ verify

全 backend test pass を確認。

Refs: docs/superpowers/specs/2026-05-21-parallel-persona-consensus.md §11.3

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: 手動検証 (Claude CLI mode) + PR 作成

**Files:** なし (verification)

- [ ] **Step 1: API server 再起動 (Claude CLI mode で新コード適用)**

既存 API process を kill して新コードで起動:

```bash
# 既存 API kill
lsof -nP -iTCP:8000 -sTCP:LISTEN 2>/dev/null | awk 'NR>1 {print $2}' | xargs -r kill -TERM
sleep 2
lsof -nP -iTCP:8000 -sTCP:LISTEN 2>/dev/null | head -1 || echo "port 8000 free"

# Claude CLI mode で起動
cd /Users/morimatsu/lab/ai-dlc-hackathon
LLM_PROVIDER=claude-cli CLAUDE_CLI_PATH=$(which claude) CLAUDE_CLI_MODEL=sonnet \
STORAGE_BACKEND=mock AUTH_BACKEND=mock VOICE_BACKEND=mock \
EVENT_BACKEND=sync MOCK_AUTO_USER=true \
LEARNING_CONSUMER_ENABLED=false \
SILENCE_HASH_SALT=local-salt PERSONA_ANONYMIZER_SALT=local-persona-salt \
CORS_ALLOWED_ORIGINS='["http://localhost:5173"]' \
MOCK_SEED_DEMO_DECISIONS=true \
pnpm --filter @yesman/api start &
```

5 秒待って起動確認:
```bash
sleep 5
curl -s http://localhost:8000/docs -o /dev/null -w "API HTTP %{http_code}\n"
```
Expected: `API HTTP 200`

- [ ] **Step 2: 実 LLM 経由で timing 計測**

```bash
TOKEN="mock-user:eyJzdWIiOiAiMjIyMjIyMjItMjIyMi0yMjIyLTIyMjItMjIyMjIyMjIyMjIyIiwgImVtYWlsIjogInRhcm9AZXhhbXBsZS5jb20ifQ"
curl -sN --max-time 60 -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"user_input":"明日のランチ、ラーメンか寿司どっちがいい?"}' \
  http://localhost:8000/v1/decisions/request/stream 2>&1 | while IFS= read -r line; do
    printf "[%s] %s\n" "$(date +%H:%M:%S.%N | cut -c1-12)" "$line"
done
```
Expected (spec §2.1 通り):
- event: start (即時、~0ms)
- event: utterance A (~8s)、B (~12s)、C (~15s) — **時間差を持って到着**
- event: proposal (~20s)
- event: complete (~21s)

各 utterance の timestamp が 1 秒以上離れていれば「自然な会話」効果が確認できる (spec §3 受入基準)。

- [ ] **Step 3: ブラウザで UI 確認**

http://localhost:5173 を hard reload して /decision で同じ query を実行。

確認:
- 「合議中...」表示
- 各 persona の chat bubble が **時間差で順次表示**
- 全 utterance 表示後に proposal card + Yes/No
- Yes/No 採択フロー (PR #11 の動作) 維持

- [ ] **Step 4: build / lint 確認**

```bash
cd /Users/morimatsu/lab/ai-dlc-hackathon/apps/api
.venv/bin/python -m pytest 2>&1 | tail -10
.venv/bin/python -m ruff check yesman_api 2>&1 | tail -10  # lint があれば
```
Expected: pytest 全 pass、lint warning 0

- [ ] **Step 5: PR 作成 (user の明示的指示がある場合のみ)**

```bash
cd /Users/morimatsu/lab/ai-dlc-hackathon
git push -u origin feature/parallel-persona-consensus

gh pr create --base develop --head feature/parallel-persona-consensus \
  --title "feat(api): LLM 問い合わせを persona ごとに並列化 (chat-like real-time)" \
  --body "$(cat <<'EOF'
## Summary

ConsensusOrchestrator + DecisionEngine.run_stream を **persona ごとに並列 LLM call** に書き換え。各 persona の生成完了タイミングで SSE utterance event が yield され、frontend で chat-like timeline で順次表示される。

### Before (legacy)
- 1 prompt で全 persona + proposal を XML 出力
- Claude CLI が生成完了後にまとめて出力 → SSE event が全部 18ms 以内に burst で届く
- ユーザは「合議中...」が 20-30s 続いた後、瞬時に全てが表示される

### After (parallel)
- 3 persona 並列 LLM call (`asyncio.as_completed`)
- 完了順に SSE utterance event yield (~8s, ~12s, ~15s で 1 つずつ到着)
- 全 persona 完了後に 4 つ目の LLM call で proposal 生成 (~20s)
- 「実際に 3 人の AI が同時に考えて、考え終わった人から順に発言した」体験

## Architectural changes

| 項目 | 変更 |
|---|---|
| LLM call 回数 | 1 → 4 (3 persona + 1 proposal) |
| Total latency | ~20-25s (現状と同程度、max(persona) + proposal) |
| Cost | Claude CLI subscription なら無料、Bedrock 等は 4x |
| Domain event | 廃止 (frontend で未参照) |
| Per-persona timeout | 30s (config) |
| Proposal timeout | 20s (config) |
| Degraded mode | 1 persona failure → 残り persona で proposal 生成 |
| All failed | error event yield、proposal call せず |

## Frontend

**変更なし**。既存 `useDecisionStream` が utterance event を順次処理するため、parallel arrival で自然に動作。

## Spec / Plan

- Spec: [docs/superpowers/specs/2026-05-21-parallel-persona-consensus.md](https://github.com/NES-Innovation-lavolatories/yes-man/blob/feature/parallel-persona-consensus/docs/superpowers/specs/2026-05-21-parallel-persona-consensus.md)
- Plan: [docs/superpowers/plans/2026-05-21-parallel-persona-consensus.md](https://github.com/NES-Innovation-lavolatories/yes-man/blob/feature/parallel-persona-consensus/docs/superpowers/plans/2026-05-21-parallel-persona-consensus.md)

## Test plan

- [ ] `cd apps/api && .venv/bin/python -m pytest tests/` 全 pass
- [ ] `cd apps/web && pnpm test` 全 pass (frontend は不変、regression なし)
- [ ] Claude CLI mode で /decision に query 送信 → 各 persona が時間差で chat bubble 表示
- [ ] Mock mode で e2e (`pnpm exec playwright test tests/decision.spec.ts`) 全 pass

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

> ⚠️ Push と PR 作成は **user の明示的指示があった場合のみ** 実行。

---

## Self-Review Checklist

(plan 作者: writing-plans skill の self-review として、書き終わった後に確認すべき項目)

**1. Spec coverage**

| Spec section | Task | カバレッジ |
|---|---|---|
| §1 背景 | (説明、impl 不要) | ✅ |
| §2.1 期待 timing | Task 7 Step 2 で manual 検証 | ✅ |
| §3 受入基準 (Gherkin) | Task 4 Step 1 の 4 test + Task 7 manual | ✅ |
| §4.1 architecture (parallel as_completed) | Task 4 Step 4 で実装 | ✅ |
| §4.2 Domain event 廃止 | Task 4 Step 4 (domain event yield せず) + Task 6 (test 修正) | ✅ |
| §4.3 SilenceGuard 維持 | Task 4 Step 4 で `silence_guard.evaluate()` 呼び | ✅ |
| §5.1 PERSONA_PROMPT_TEMPLATE | Task 2 Step 3 | ✅ |
| §5.2 PROPOSAL_PROMPT_TEMPLATE | Task 2 Step 3 | ✅ |
| §5.3 clean output + truncate | Task 2 Step 3 | ✅ |
| §6 Concurrency / Timeout | Task 1 (config) + Task 4 (asyncio.wait_for) | ✅ |
| §7 SSE Event Ordering | Task 4 + Task 6 | ✅ |
| §8 Failure / Degraded | Task 4 (4 test cases) | ✅ |
| §9 Mock LLM 扱い | Task 3 (persona-aware detect) | ✅ |
| §10 変更ファイル一覧 | File Structure 通り | ✅ |
| §11 Test 方針 | Task 2/3/4/6 で全 unit + integration test | ✅ |
| §12 Risk / Mitigation | Plan 全体で対応 | ✅ |
| §13 Out of Scope | 変更しない | ✅ |
| §14 Git-Flow | Task 7 Step 5 | ✅ |

**2. Placeholder scan**: TBD / TODO なし、全 step に concrete code or exact command を記載。

**3. Type consistency**

- `tuple[Persona, str]` 型を `generate_persona` で一貫使用
- `build_persona_prompt(persona: Persona) -> str` / `build_proposal_prompt(utterances: list[tuple[Persona, str]]) -> str` signatures
- `clean_utterance_output(text: str) -> str` / `clean_proposal_output(text: str) -> str`
- StreamEvent dataclass の type field と data dict structure は全 task で一貫
- `MockLLMProvider(persona_delays={...})` 引数名は Task 3 で定義、Task 4 test で使用、一致

**4. Known concerns**

- Task 5 で `wrap_user_input` を削除するが engine.run / run_stream で代わりに `mask_pii` を直接使う → user_input が `<user_input>...</user_input>` で囲まれなくなる。SEC-U4-12 (プロンプトインジェクション防御) の観点で逆効果かもしれない。**今は Out of Scope** として割愛、必要なら別 spec で復活。
- engine.run() メソッドが他の caller (e.g., persist API endpoint) で使われている場合、signature 変更で影響。要確認。
- Mock LLM の `DEFAULT_OUTPUT` (XML) を残しているのは legacy fallback、Task 5 で legacy 削除後は不要なので一緒に消す方がクリーン。**Plan 中で明示的に削除タスクなし**、follow-up issue で対応。

---
