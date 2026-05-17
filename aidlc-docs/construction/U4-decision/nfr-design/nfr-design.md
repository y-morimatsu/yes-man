# U4 / decision — NFR Design

**Unit**: U4 / decision
**Phase**: CONSTRUCTION — NFR Design
**Created**: 2026-05-16
**Status**: 🟡 IN REVIEW
**Upstream**: U4 FD (approved + 13 fixes) + U4 NFR Req (approved + 12 fixes)

---

## 0. 位置付け

U4 NFR Req §7 引き継ぎを実装パターンとして具体化。Code Generation Plan が直接参照するコード骨格 + 統合パターン。

| 確定対象 | 担当セクション |
|---|---|
| LiteLLM 統合パターン | §1 |
| LLMProviderAdapter 実装 (Bedrock + Mock) | §2 |
| SilenceGuard 実装 (regex + LLM 2 段) | §3 |
| ConsensusOrchestrator 実装 (動的 persona + XML parser) | §4 |
| Nudge in-memory cache | §5 |
| PII フィルタ (`shared/pii_filter.py`) | §6 |
| EventPublisher 実装 (3 backend) | §7 |
| SSE StreamingResponse + 切断耐性 | §8 |
| AppConfig 拡張 + validate_runtime | §9 |
| 依存ライブラリ | §10 |

---

## 1. LiteLLM 統合パターン

### 1.1 採用判断
- **LiteLLM** (`pip install litellm`) を Bedrock / OpenAI / Anthropic / Google の統一インターフェースとして採用 (FR-AI-01)
- `litellm.acompletion(model=..., messages=..., stream=False)` で非ストリーミング、`stream=True` で async iterator
- Bedrock model identifier: `bedrock/anthropic.claude-3-haiku-20240307-v1:0` (LiteLLM prefix 形式)

### 1.2 認証
- **Bedrock**: 環境変数 `AWS_REGION_NAME` 設定 + IAM Role 付き ECS Task → LiteLLM が自動取得
- **(将来) OpenAI**: `OPENAI_API_KEY` を Secrets Manager 経由
- Mock backend: LiteLLM 呼ばない

### 1.3 タイムアウト適用
```python
# LiteLLM は timeout= 引数 (秒) を受け付ける
response = await litellm.acompletion(
    model=f"bedrock/{model_id}",
    messages=messages,
    timeout=config.decision_llm_timeout_seconds,  # 30s
    aws_region_name=config.bedrock_region,
)
```

### 1.4 ストリーミング (async iterator)
```python
stream = await litellm.acompletion(
    model=f"bedrock/{model_id}",
    messages=messages,
    stream=True,
    timeout=config.decision_llm_stream_total_timeout_seconds,  # 120s
)
async for chunk in stream:
    delta = chunk["choices"][0]["delta"].get("content", "")
    if delta:
        yield delta
```

### 1.5 リトライ
- complete: `tenacity` 不要、手動 1 回 retry + 200ms backoff (U3 で確立済パターン踏襲)
- stream: retry なし (NFR Req AVAIL-U4-03)

---

## 2. LLMProviderAdapter 実装

### 2.1 Protocol (`application/decision/llm_provider.py`)

```python
from typing import AsyncIterator, Protocol, runtime_checkable

@runtime_checkable
class LLMProviderAdapter(Protocol):
    provider_name: str

    async def complete(
        self, *, system: str, messages: list[dict[str, str]], temperature: float = 0.7
    ) -> str: ...

    async def stream(
        self, *, system: str, messages: list[dict[str, str]], temperature: float = 0.7
    ) -> AsyncIterator[str]:
        if False:
            yield ""

    async def aclose(self) -> None: ...
```

### 2.2 BedrockLLMAdapter (`infrastructure/decision/llm_providers/bedrock_adapter.py`)

```python
import litellm
from yesman_api.infrastructure.config import AppConfig

class BedrockLLMAdapter:
    provider_name = "bedrock"

    def __init__(self, config: AppConfig) -> None:
        self._cfg = config
        # LiteLLM は global config を見るため、初期化時に reset
        litellm.aws_region_name = config.bedrock_region

    async def complete(self, *, system, messages, temperature=0.7) -> str:
        for attempt in range(self._cfg.decision_llm_retry_count + 1):
            try:
                resp = await litellm.acompletion(
                    model=f"bedrock/{self._cfg.bedrock_model_id}",
                    messages=[{"role": "system", "content": system}] + messages,
                    temperature=temperature,
                    timeout=self._cfg.decision_llm_timeout_seconds,
                    aws_region_name=self._cfg.bedrock_region,
                    # Bedrock Guardrails (prod のみ、Mock adapter 内で skip)
                    **self._guardrail_kwargs(),
                )
                return resp["choices"][0]["message"]["content"]
            except litellm.exceptions.Timeout:
                if attempt == self._cfg.decision_llm_retry_count:
                    raise DecisionError("llm_timeout")
                await asyncio.sleep(0.2)
            except litellm.exceptions.APIError as exc:
                raise DecisionError("llm_unavailable", detail=str(exc)) from exc
        raise RuntimeError("unreachable")

    async def stream(self, *, system, messages, temperature=0.7):
        try:
            stream = await litellm.acompletion(
                model=f"bedrock/{self._cfg.bedrock_model_id}",
                messages=[{"role": "system", "content": system}] + messages,
                temperature=temperature,
                stream=True,
                timeout=self._cfg.decision_llm_stream_total_timeout_seconds,
                aws_region_name=self._cfg.bedrock_region,
                **self._guardrail_kwargs(),
            )
        except litellm.exceptions.APIError as exc:
            raise DecisionError("llm_unavailable", detail=str(exc)) from exc

        first_chunk_received = False
        async for chunk in stream:
            delta = (chunk["choices"][0].get("delta") or {}).get("content", "")
            if delta:
                if not first_chunk_received:
                    first_chunk_received = True
                yield delta

    def _guardrail_kwargs(self) -> dict:
        """SEC-U4-06/07: prod のみ Guardrail 適用.

        ultrathink I2 反映 2026-05-16: LiteLLM 経由の Guardrails 引数形式は **Code Gen Phase で
        LiteLLM 最新ドキュメントを確認の上、実装時に確定する** (LiteLLM バージョン依存)。
        Fallback: LiteLLM 経由が困難なら **boto3 bedrock-runtime 直接呼び出し** に切替。
        実装オプション:
          (a) `extra_body={"guardrailConfig": {...}}` (LiteLLM > 1.50 で推奨)
          (b) `bedrock_runtime_kwargs={"guardrailIdentifier": ...}` (LiteLLM の旧バージョン)
          (c) boto3 `client.invoke_model_with_response_stream(guardrailIdentifier=...)` に切替
        """
        if self._cfg.app_env != "prod" or not self._cfg.bedrock_guardrail_id:
            return {}
        # Code Gen Phase で動作確認 + 必要なら fallback
        return {
            "extra_body": {
                "guardrailConfig": {
                    "guardrailIdentifier": self._cfg.bedrock_guardrail_id,
                    "guardrailVersion": self._cfg.bedrock_guardrail_version,
                },
            },
        }

    async def aclose(self) -> None:
        pass  # LiteLLM は内部で boto3 をリサイクル
```

### 2.3 MockLLMProvider (`infrastructure/decision/llm_providers/mock_adapter.py`)

決定的な fake 出力で SSE/non-stream を模擬。テストで予測可能。

```python
class MockLLMProvider:
    provider_name = "mock"

    DEFAULT_OUTPUT = """\
<domain>daily</domain>
<utterance persona="慎重派">慎重派の意見</utterance>
<utterance persona="楽観派">楽観派の意見</utterance>
<utterance persona="効率派">効率派の意見</utterance>
<proposal>Mock proposal の本文です。</proposal>
"""

    SILENCE_OUTPUT = "<domain>silenced</domain><proposal>本件についてはお答えできません。</proposal>"

    def __init__(
        self,
        *,
        override: str | None = None,
        stream_delay_seconds: float = 0.0,  # ultrathink I4 反映 2026-05-16: テスト時 0 (default)、SSE 動作確認時 0.01 等
        chunk_size: int = 10,
    ) -> None:
        self._override = override
        self._stream_delay = stream_delay_seconds
        self._chunk_size = chunk_size

    async def complete(self, *, system, messages, temperature=0.7) -> str:
        return self._override or self.DEFAULT_OUTPUT

    async def stream(self, *, system, messages, temperature=0.7):
        output = self._override or self.DEFAULT_OUTPUT
        for i in range(0, len(output), self._chunk_size):
            yield output[i : i + self._chunk_size]
            if self._stream_delay > 0:
                await asyncio.sleep(self._stream_delay)

    async def aclose(self) -> None: ...
```

### 2.4 LLMProviderFactory

```python
class LLMProviderFactory:
    def __init__(self, config: AppConfig) -> None:
        self._cfg = config
        self._adapter: LLMProviderAdapter | None = None

    async def create(self) -> LLMProviderAdapter:
        if self._adapter is not None:
            return self._adapter
        if self._cfg.llm_provider == "bedrock":
            self._adapter = BedrockLLMAdapter(self._cfg)
        elif self._cfg.llm_provider == "mock":
            self._adapter = MockLLMProvider()
        else:
            raise RuntimeError(f"Unknown LLM_PROVIDER: {self._cfg.llm_provider!r}")
        return self._adapter

    async def dispose(self) -> None:
        if self._adapter is not None:
            await self._adapter.aclose()
            self._adapter = None
```

---

## 3. SilenceGuard 実装

### 3.1 ファイル: `domain/decision/silence_guard.py`

```python
import re
from yesman_api.application.auth.errors import AuthError  # 共通例外パターン

SILENCE_KEYWORDS: dict[str, list[str]] = {
    "religion": ["神", "仏", "宗教", "宗派", "信仰", "祈り", "教会", "寺", "イスラム", "キリスト",
                  "仏教", "ヒンドゥー", "ユダヤ", "改宗", "信者"],
    "election": ["投票", "選挙", "政党", "自民", "立憲", "公明", "共産", "維新", "国民民主",
                  "比例", "候補者", "立候補", "公認", "票", "総裁"],
    "violence": ["殺", "暴力", "刺す", "刺せ", "撲殺", "ナイフ", "拳銃", "テロ", "爆発", "復讐",
                  "報復", "傷つけ", "殴る", "蹴る", "暴行"],
    "obscene": ["セックス", "性行為", "アダルト", "ポルノ", "猥褻", "ハレンチ", "下半身", "性器",
                  "陰部", "AV"],
}


class SilenceGuard:
    def __init__(self, *, llm: LLMProviderAdapter, salt: str) -> None:
        self._llm = llm
        self._salt = salt
        self._regex_map = {
            domain: re.compile("|".join(re.escape(k) for k in keywords))
            for domain, keywords in SILENCE_KEYWORDS.items()
        }

    async def evaluate(self, *, user_id: str, user_input: str) -> SilenceVerdict:
        # 1 段目: 正規表現 fast path
        for domain, pattern in self._regex_map.items():
            if pattern.search(user_input):
                return SilenceVerdict(
                    is_silenced=True,
                    domain=domain,
                    response_text=self._silence_response(),
                )
        # 2 段目: LLM 自己判定 (regex で素通り時のみ)
        verdict = await self._llm_judge(user_input)
        return verdict

    async def _llm_judge(self, user_input: str) -> SilenceVerdict:
        """LLM に「この入力は宗教/選挙/暴力/卑猥に該当するか」を判定させる軽量プロンプト.

        ultrathink Imp3 反映 2026-05-16: prompt を「ドメイン名 1 つのみ出力、該当なしは none」に明確化、temperature=0 + 短い出力.
        """
        system = (
            "あなたは入力分類器です。ユーザー入力が以下のいずれかのドメインに該当するか判定してください: "
            "religion / election / violence / obscene / none。"
            "該当する場合はドメイン名を **1 つのみ** 出力、該当しない場合は `none` のみ出力 (他の単語は出さない)。"
        )
        try:
            output = await self._llm.complete(
                system=system,
                messages=[{"role": "user", "content": user_input}],
                temperature=0.0,
            )
        except DecisionError:
            # ultrathink I1 反映 2026-05-16: LLM 失敗時は fail-closed (安全側 = 沈黙)
            # FR-DM-SILENT の倫理/法的リスク回避を優先、UX 上の偽陽性は許容
            return SilenceVerdict(
                is_silenced=True,
                domain=None,
                response_text=self._silence_response(),
            )
        output = output.lower().strip()
        for domain in ("religion", "election", "violence", "obscene"):
            if domain in output:
                return SilenceVerdict(
                    is_silenced=True, domain=domain, response_text=self._silence_response()
                )
        return SilenceVerdict(is_silenced=False, domain=None, response_text=None)

    def _silence_response(self) -> str:
        return "この内容については AI が判断を代行できません。ご自身でじっくり考えていただけたらと思います。"

    def compute_input_hash(self, *, user_id: str, user_input: str) -> str:
        import hashlib
        return hashlib.sha256(
            (self._salt + user_id + user_input).encode("utf-8")
        ).hexdigest()
```

---

## 4. ConsensusOrchestrator 実装

### 4.1 ファイル: `domain/decision/consensus.py`

```python
import re
from typing import AsyncIterator
from yesman_api.domain.persistence.models import Persona


PROMPT_TEMPLATE = """\
あなたは YesMan の意思決定エンジンです。以下の {persona_count} 人の人格を演じ、
ユーザーの入力に対して合議を行い、最終提案を 1 つに集約してください。

# 合議する人格
{persona_descriptions}

# ユーザープロフィール
{profile_yaml}

# 出力フォーマット (XML タグ厳守)
<domain>daily|work|school|major|silenced</domain>
{utterance_template_block}
<proposal>最終提案 (断定調、〜してください/〜です。100 字以内)</proposal>
"""

USER_INPUT_TEMPLATE = "<user_input>{user_input}</user_input>"  # SEC-U4-12 プロンプトインジェクション緩和


class ConsensusOrchestrator:
    def __init__(self) -> None: ...

    @staticmethod
    def _escape_persona_name(name: str) -> str:
        """ultrathink Imp1 反映 2026-05-16: Custom Persona 名に `"` を含む場合の XML 属性 escape."""
        return name.replace('"', "&quot;")

    def build_prompt(
        self,
        *,
        personas: list[Persona],
        profile_yaml: str,
    ) -> str:
        persona_descriptions = "\n".join(
            f"- {p.name}: {p.description or ''} (プロンプト指示: {p.prompt_text})"
            for p in personas
        )
        utterance_template_block = "\n".join(
            f'<utterance persona="{self._escape_persona_name(p.name)}">本文 (200 字以内)</utterance>'
            for p in personas
        )
        return PROMPT_TEMPLATE.format(
            persona_count=len(personas),
            persona_descriptions=persona_descriptions,
            profile_yaml=profile_yaml,
            utterance_template_block=utterance_template_block,
        )

    def parse(self, llm_output: str, *, personas: list[Persona]) -> ConsensusOutput:
        """完全 XML / 部分 XML / 不正出力に対し部分抽出で recovery."""
        domain = self._extract_tag(llm_output, "domain") or "daily"
        proposal = self._extract_tag(llm_output, "proposal") or ""
        utterances: list[PersonaUtterance] = []
        persona_by_name = {p.name: p for p in personas}
        for m in re.finditer(
            r'<utterance persona="([^"]+)">(.*?)</utterance>',
            llm_output,
            re.DOTALL,
        ):
            name, text = m.group(1).strip(), m.group(2).strip()
            persona = persona_by_name.get(name)
            if persona is None:
                continue
            utterances.append(
                PersonaUtterance(persona_id=persona.id, persona_name=name, text=text)
            )
        return ConsensusOutput(
            domain_classification=domain,
            utterances=utterances,
            proposal_text=proposal,
        )

    @staticmethod
    def _extract_tag(text: str, tag: str) -> str | None:
        m = re.search(rf"<{tag}>(.*?)</{tag}>", text, re.DOTALL)
        return m.group(1).strip() if m else None

    async def stream_parse(
        self,
        chunks: AsyncIterator[str],
        *,
        personas: list[Persona],
    ) -> AsyncIterator[StreamEvent]:
        """chunk を蓄積しつつ完成した tag を逐次 yield.

        ultrathink C1 反映 2026-05-16: state を 3 つに分離 (persona 名と meta tag の衝突回避).
        """
        buffer = ""
        emitted_domain = False
        emitted_personas: set[str] = set()
        emitted_proposal = False
        async for chunk in chunks:
            buffer += chunk
            # domain 完成チェック
            if not emitted_domain:
                domain = self._extract_tag(buffer, "domain")
                if domain:
                    yield StreamEvent("domain", {"domain": domain})
                    emitted_domain = True
            # utterance 完成チェック (persona 名で重複管理)
            for m in re.finditer(
                r'<utterance persona="([^"]+)">(.*?)</utterance>', buffer, re.DOTALL
            ):
                name = m.group(1).strip()
                if name in emitted_personas:
                    continue
                persona = next((p for p in personas if p.name == name), None)
                if persona is None:
                    continue
                emitted_personas.add(name)
                yield StreamEvent(
                    "utterance",
                    {
                        "persona_id": str(persona.id),
                        "persona_name": name,
                        "text": m.group(2).strip(),
                    },
                )
            # proposal 完成チェック
            if not emitted_proposal:
                proposal = self._extract_tag(buffer, "proposal")
                if proposal:
                    yield StreamEvent("proposal", {"text": proposal})
                    emitted_proposal = True
```

### 4.2 入力上限 (NFR Req I2 反映)
- API 入口 (`/v1/decisions/request*`) で `user_input` 長さ > 100,000 文字なら **HTTPException 413** を返す (FastAPI Path/Body validator + `Field(max_length=100_000)`)

---

## 5. NudgeMessageGenerator + in-memory cache

### 5.1 ファイル: `domain/decision/nudge.py`

```python
import asyncio
import time
from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class CachedNudge:
    message: str
    status: str  # "pending" | "ready" | "failed"
    expires_at: float  # monotonic


class NudgeCache:
    """Process-wide in-memory cache. multi-worker では worker miss 発生 (MVP 許容).

    ultrathink I5 反映 2026-05-16: メモリリーク防止のため定期 evict + 上限超過時全クリア.
    """

    MAX_ENTRIES = 1000  # 上限超過で _evict_expired を強制実行

    def __init__(self, *, ttl: float) -> None:
        self._ttl = ttl
        self._cache: dict[str, CachedNudge] = {}  # decision_id -> CachedNudge
        self._locks: dict[str, asyncio.Lock] = {}

    def get(self, decision_id: str) -> CachedNudge | None:
        cached = self._cache.get(decision_id)
        if cached is None:
            return None
        if time.monotonic() > cached.expires_at:
            # TTL 切れ → エントリ削除 (lock も一緒に)
            self._cache.pop(decision_id, None)
            self._locks.pop(decision_id, None)
            return None
        return cached

    def set_pending(self, decision_id: str) -> None:
        self._maybe_evict()
        self._cache[decision_id] = CachedNudge(
            message="", status="pending", expires_at=time.monotonic() + self._ttl
        )

    def set_ready(self, decision_id: str, message: str) -> None:
        self._cache[decision_id] = CachedNudge(
            message=message, status="ready", expires_at=time.monotonic() + self._ttl
        )

    def set_failed(self, decision_id: str, fallback: str) -> None:
        self._cache[decision_id] = CachedNudge(
            message=fallback, status="failed", expires_at=time.monotonic() + self._ttl
        )

    def _maybe_evict(self) -> None:
        """エントリ数が上限超過時、TTL 切れエントリを一括削除. lock も同時にクリア."""
        if len(self._cache) < self.MAX_ENTRIES:
            return
        now = time.monotonic()
        expired = [k for k, v in self._cache.items() if now > v.expires_at]
        for k in expired:
            self._cache.pop(k, None)
            self._locks.pop(k, None)


class NudgeMessageGenerator:
    def __init__(self, *, llm: LLMProviderAdapter, cache: NudgeCache) -> None:
        self._llm = llm
        self._cache = cache

    async def generate(
        self, *, decision_id: str, proposal_text: str, choice: str, no_streak: int
    ) -> None:
        """BackgroundTasks で起動される。結果は cache に保存."""
        self._cache.set_pending(decision_id)
        system = "ユーザーは AI に意思決定を任せるサービスを使っています。1 行 30 字以内でメッセージを生成してください。"
        prompt = self._build_prompt(proposal_text, choice, no_streak)
        try:
            text = await self._llm.complete(
                system=system,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.5,
            )
            self._cache.set_ready(decision_id, text.strip()[:60])  # 安全側 60 字 cap
        except Exception:
            self._cache.set_failed(decision_id, fallback="再考の余地がありますね")

    def _build_prompt(self, proposal: str, choice: str, no_streak: int) -> str:
        if choice == "yes":
            return f"直前の提案: {proposal}\nユーザーは Yes を選びました。委任成功への肯定的フィードバックを生成。"
        # no
        if no_streak <= 1:
            tone = "軽い再考の提案"
        elif no_streak == 2:
            tone = "「本当に？」のニュアンス"
        else:
            tone = "「本当に大丈夫ですか?」段階強化"
        return f"直前の提案: {proposal}\nユーザーは No を {no_streak} 回連続で選びました。{tone} を生成。"
```

---

## 6. PII フィルタ (`shared/pii_filter.py`)

```python
import re

# email (RFC5322 簡略版)
EMAIL_RE = re.compile(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}")
# 日本携帯/固定電話
PHONE_JP_RE = re.compile(r"(?<!\d)(0[5789]0[-\s]?\d{4}[-\s]?\d{4}|0\d{1,4}[-\s]?\d{1,4}[-\s]?\d{3,4})(?!\d)")
# 米国電話
PHONE_US_RE = re.compile(r"\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}")
# クレジットカード候補 (13-19 桁、ハイフン/空白許容) — Luhn 検証で確定 (ultrathink I6 反映 2026-05-16)
CC_CANDIDATE_RE = re.compile(r"(?<!\d)(?:\d[ -]?){13,19}(?!\d)")


def _luhn_valid(digits_only: str) -> bool:
    """Luhn checksum 検証 (= クレジットカード番号の正当性確認)。

    電話番号や住所番地等の数字列は通常 Luhn を通らず、誤検知を大幅に減らせる。
    """
    total, alt = 0, False
    for d in reversed(digits_only):
        if not d.isdigit():
            return False
        n = int(d)
        if alt:
            n *= 2
            if n > 9:
                n -= 9
        total += n
        alt = not alt
    return total % 10 == 0


def _mask_cc(text: str, mask: str) -> str:
    """CC 候補を抽出して Luhn を通ったもののみマスク (誤検知抑制)."""

    def repl(m):
        raw = m.group(0)
        digits = re.sub(r"[ -]", "", raw)
        return mask if _luhn_valid(digits) else raw

    return CC_CANDIDATE_RE.sub(repl, text)


def mask_pii(text: str, *, mask: str = "***") -> str:
    text = EMAIL_RE.sub(mask, text)
    text = PHONE_JP_RE.sub(mask, text)
    text = PHONE_US_RE.sub(mask, text)
    text = _mask_cc(text, mask)
    return text
```

利用例:
```python
masked_input = mask_pii(user_input)
masked_profile = mask_pii(profile_yaml)
output = await llm.complete(system=system, messages=[{"role": "user", "content": masked_input}])
```

---

## 7. EventPublisher 実装

### 7.1 Protocol (`application/decision/event_publisher.py`)

```python
@runtime_checkable
class EventPublisher(Protocol):
    backend_name: str

    async def publish_decision_confirmed(
        self,
        *,
        user_id: str,
        decision_id: str,
        choice: str,  # "yes" | "no"
        domain: str,
        timestamp: datetime,
    ) -> None: ...

    async def aclose(self) -> None: ...
```

### 7.2 EventBridgePublisher (`infrastructure/decision/event_publishers/eventbridge.py`)

```python
import asyncio
import json

import boto3


class EventBridgePublisher:
    backend_name = "eventbridge"

    def __init__(self, *, event_bus_name: str, region: str) -> None:
        # ultrathink Imp2 反映 2026-05-16: 独立 Session を持つことで thread safety と
        # 並行 put_events の安全性を強化 (boto3 の global default client より堅牢)
        self._session = boto3.session.Session(region_name=region)
        self._client = self._session.client("events")
        self._bus = event_bus_name

    async def publish_decision_confirmed(self, **kwargs) -> None:
        entry = {
            "Source": "yesman.api",
            "DetailType": "DecisionConfirmed",
            "Detail": json.dumps(kwargs, default=str),
            "EventBusName": self._bus,
        }
        # boto3 は同期、asyncio.to_thread で wrap
        await asyncio.to_thread(self._client.put_events, Entries=[entry])

    async def aclose(self) -> None: ...
```

### 7.3 InlineAsyncPublisher + SyncPublisher
- `InlineAsyncPublisher`: BackgroundTasks 経由で同一プロセス内で消費 (U5 が同一プロセスにいる dev/test 想定)
- `SyncPublisher`: no-op (MVP / Mock backend)

---

## 8. SSE StreamingResponse + 切断耐性

### 8.1 ファイル: `interface/http/decisions.py`

```python
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from uuid import uuid4


@router.post("/request/stream")
async def request_stream(
    payload: DecisionRequestDTO,
    user: AuthenticatedUser = Depends(get_current_user),
    engine: DecisionEngine = Depends(get_decision_engine),
) -> StreamingResponse:
    # 事前 decision_id 生成 (Imp2: start event で client に通知)
    decision_id = uuid4()

    async def event_stream():
        try:
            yield _sse("start", {"decision_id": str(decision_id)})
            # SilenceGuard → ConsensusOrchestrator.stream_parse → 永続化
            async for event in engine.run_stream(
                decision_id=decision_id,
                user_id=UUID(user.sub),
                user_input=payload.user_input,
                selected_persona_ids=payload.selected_persona_ids or [],
            ):
                yield _sse(event.type, event.data)
            yield _sse("complete", {"decision_id": str(decision_id)})
        except asyncio.CancelledError:
            # 切断時: 進行中の task を detach、background で永続化を best-effort 継続
            # (engine.run_stream 内で create_task していれば自動継続、なければここで)
            raise
        except DecisionError as exc:
            yield _sse("error", {"reason": exc.reason, "detail": exc.detail})

    return StreamingResponse(event_stream(), media_type="text/event-stream")


def _sse(event: str, data: dict) -> str:
    import json
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"
```

### 8.2 DecisionEngine.run_stream 切断耐性パターン

```python
async def run_stream(self, ...) -> AsyncIterator[StreamEvent]:
    chunks = self._llm.stream(system=..., messages=...)
    # ultrathink I3 反映 2026-05-16: tee_chunks 実装を NFR Design で確定
    chunks_for_sse, chunks_for_persist = tee_chunks(chunks, n=2)
    full_output: list[str] = []

    async def consume_and_persist():
        """切断後も継続される best-effort background task."""
        try:
            async for chunk in chunks_for_persist:
                full_output.append(chunk)
            consensus = self._orchestrator.parse("".join(full_output), personas=personas)
            decision = Decision(id=decision_id, ..., persona_outputs=...)
            await self._decision_repo.insert(decision)
        except Exception as exc:
            get_logger("decision").warning("background_persist_failed", error=str(exc))

    asyncio.create_task(consume_and_persist())

    # SSE 側は parser を通して逐次 yield
    async for event in self._orchestrator.stream_parse(chunks_for_sse, personas=personas):
        yield event
```

### 8.3 `tee_chunks` 実装 (asyncio.Queue ベース、ultrathink I3 反映)

```python
import asyncio
from typing import AsyncIterator


def tee_chunks(
    source: AsyncIterator[str], *, n: int = 2, max_buffer: int = 256
) -> tuple[AsyncIterator[str], ...]:
    """単一 async iterator を n 個の独立 consumer に fan-out.

    各 consumer は独立の asyncio.Queue (最大 max_buffer 件) を持ち、
    producer は全 Queue にコピーを put_nowait。Queue が満杯なら遅い consumer が drop される
    (= best-effort、SSE 側の遅延が永続化を妨げない)。

    None を sentinel として送出し、各 consumer は受信時に StopAsyncIteration.
    """
    queues: list[asyncio.Queue[str | None]] = [asyncio.Queue(maxsize=max_buffer) for _ in range(n)]

    async def producer():
        try:
            async for chunk in source:
                for q in queues:
                    try:
                        q.put_nowait(chunk)
                    except asyncio.QueueFull:
                        # 遅い consumer は drop (best-effort)
                        pass
        finally:
            for q in queues:
                await q.put(None)

    asyncio.create_task(producer())

    async def consumer(q: asyncio.Queue[str | None]):
        while True:
            item = await q.get()
            if item is None:
                return
            yield item

    return tuple(consumer(q) for q in queues)
```

→ Code Gen Plan ではこの実装をそのまま採用、追加修正は max_buffer のチューニング程度。

---

## 9. AppConfig 拡張 + validate_runtime

`apps/api/src/yesman_api/infrastructure/config.py` に追加:

```python
# U4 / decision (NFR Design §9)
bedrock_region: str = "ap-northeast-1"
bedrock_model_id: str = "anthropic.claude-3-haiku-20240307-v1:0"
bedrock_guardrail_id: str = ""
bedrock_guardrail_version: str = "DRAFT"
decision_llm_timeout_seconds: float = 30.0
decision_llm_stream_initial_timeout_seconds: float = 5.0
decision_llm_stream_total_timeout_seconds: float = 120.0
decision_llm_retry_count: int = 1
nudge_generation_enabled: bool = True
nudge_cache_ttl_seconds: float = 600.0
event_bus_name: str = ""
silence_hash_salt: str = ""

def validate_runtime(self) -> None:
    """ultrathink Imp4 反映 2026-05-16: pydantic model_validator ではなく明示メソッド維持.

    意図: pydantic-settings の env loading 時に発火させず、`create_app()` 内で呼ぶ →
    テストで AppConfig を組み立てる際にバリデーション skip 可能 (柔軟性)。
    本番は main.py の create_app で必ず呼び、fail-fast を保証。
    """
    # 既存 U3 バリデーション ...

    # U4: Mock LLM は dev/ci 限定
    if self.llm_provider == "mock" and self.app_env not in {"dev", "ci"}:
        raise RuntimeError(
            f"LLM_PROVIDER=mock is not allowed when APP_ENV={self.app_env!r}"
        )

    # U4: prod では SILENCE_HASH_SALT 必須
    if self.app_env == "prod" and not self.silence_hash_salt:
        raise RuntimeError("SILENCE_HASH_SALT must be set in production")

    # U4: eventbridge は EVENT_BUS_NAME 必須
    if self.event_backend == "eventbridge" and not self.event_bus_name:
        raise RuntimeError("EVENT_BACKEND=eventbridge requires EVENT_BUS_NAME")
```

---

## 10. 依存ライブラリ

`apps/api/pyproject.toml` に追加:

```toml
"litellm>=1.50,<2.0",
# boto3, httpx, structlog は U3 で追加済 (boto3 は U1/U2 既存)
```

dev 依存: 既存 `pytest`, `hypothesis`, `httpx` (MockTransport 用) で十分。

---

## 11. 引き継ぎ (Infrastructure Design)

- **ディレクトリ構造**: `domain/decision/` + `application/decision/` + `infrastructure/decision/{llm_providers, event_publishers}/` + `interface/http/{decisions, scores}.py` + `interface/http/dto/decision.py` + `shared/pii_filter.py` + `domain/persistence/constants.py`
- **U2 への遡及確認**: `DecisionRepository.count_no_by_user` の SQL 実装が `user_choice in ('yes','no')` で pending 除外しているか (Mock 実装も同様か)
- **U1 ApiStack 環境変数追加**: U3 同様、Cross-Stack Reference + Secrets Manager パターン
  - `BEDROCK_MODEL_ID` / `BEDROCK_GUARDRAIL_ID` / `BEDROCK_GUARDRAIL_VERSION` (plain) — Cross-Stack from AI Stack
  - `DECISION_LLM_*` 4 個 (plain)
  - `NUDGE_*` 2 個 (plain)
  - `EVENT_BUS_NAME` (plain) — Cross-Stack from ApiStack (自己参照、既存)
  - `SILENCE_HASH_SALT` (**secret**) — 新規 Secrets Manager 作成 + `ecs.Secret.fromSecretsManager` でマウント

---

## 12. 承認チェックリスト

- [x] LiteLLM 統合 (Bedrock prefix / IAM Role / timeout / async iterator)
- [x] LLMProviderAdapter 実装 (Bedrock + **Mock with stream_delay 可変** + Factory + **Guardrail kwargs 候補 3 案**)
- [x] SilenceGuard 2 段判定 (regex 4 ドメイン × 15 語 + **LLM 自己判定 prompt 改善 + fail-closed**)
- [x] ConsensusOrchestrator (PROMPT_TEMPLATE 動的 + USER_INPUT 区切り + **persona 名 escape** + 完全/部分 parse + **stream_parse state 3 分離**)
- [x] Nudge in-memory cache (CachedNudge + status 3 種 + **MAX_ENTRIES 1000 で _maybe_evict**)
- [x] PII フィルタ shared helper (email / phone JP/US / **CC + Luhn 検証**)
- [x] EventPublisher 3 backend (EventBridge **独立 Session** / InlineAsync / Sync)
- [x] SSE StreamingResponse + **`tee_chunks` 実装明示 (asyncio.Queue ベース)**
- [x] AppConfig 拡張 + validate_runtime 3 段 + **意図明示 (テスト柔軟性)**
- [x] 依存追加 (litellm 1 個)
- [x] Infrastructure Design への引き継ぎ事項 (ディレクトリ + U2 遡及確認 + U1 ApiStack 環境変数 + Secrets Manager)

### ultrathink レビュー (2026-05-16) 反映済 11 件
- **Critical 1**: C1 stream_parse の state 3 分離 (persona 名と meta tag の衝突回避)
- **Important 6**: I1 SilenceGuard fail-closed / I2 Guardrails kwargs 3 候補 + Code Gen で確定 / I3 tee_chunks 実装明示 / I4 Mock stream_delay 可変 / I5 NudgeCache _maybe_evict / I6 CC Luhn 検証
- **Improvements 4**: Imp1 persona 名 escape / Imp2 boto3 独立 Session / Imp3 LLM 自己判定 prompt 改善 / Imp4 validate_runtime 明示メソッド意図
