# Parallel Persona Consensus — 設計仕様

- **Date**: 2026-05-21
- **Author**: y-morimatsu (with Claude Opus 4.7)
- **Status**: Approved (brainstorming)
- **Scope**: `apps/api/src/yesman_api/domain/decision/` (consensus.py + engine.py) と関連 test。Frontend は不変。
- **Branch**: `feature/parallel-persona-consensus`

---

## 1. 背景

現状の `ConsensusOrchestrator` は **単一 LLM 呼び出し** で全 3 persona + proposal を XML 形式で一度に生成している:

```python
prompt = build_prompt(personas=[慎重派, 楽観派, 効率派], ...)
llm_output = llm.stream(prompt)
# LLM が <utterance persona="慎重派">...</utterance> × 3 + <proposal>...</proposal> を 1 つの XML で返す
```

問題点:

1. **Claude CLI `--output-format text`** は生成完了後にまとめて出力するため、SSE event が全 18ms 以内に burst で届く
2. ユーザは「合議中...」が 20-30 秒続いた後、瞬時に全 utterance + proposal が表示される
3. 「LLM が考えている / 議論している」感が出ない (画面動的変化なし)

`stream_parse()` は XML の `</utterance>` 終端を検知してチャンク単位で yield する設計だが、上記理由で機能していない。

## 2. 目的

**LLM への問い合わせを persona ごとに並列化**し、各 persona が独立した LLM call の完了タイミングで chat bubble に現れる「自然な会話」体験を提供する。

### 2.1 期待 timing

```
典型値 (実 LLM Sonnet モード):
0s   : "AI ペルソナが合議中..."
8s   : 慎重派の bubble (一番早く生成完了)
12s  : 楽観派の bubble
15s  : 効率派の bubble
20s  : proposal card + Yes/No 採択 UI

最悪値 (timeout 階層):
- per_persona_timeout: 30s × 並列 = 並列なので最大 30s
- proposal_timeout: 20s
- 全体最悪: 30 + 20 = 50s (decision_llm_stream_total_timeout 既存 90s に収まる)

Mock LLM:
- 各 persona / proposal とも瞬時 (<10ms) で完了 → 現状と同じく burst
- 実 LLM モードでのみ「自然な会話」体験が成立
```

## 3. ユーザストーリー

> 田中 涼介 (PdM, 32) として、Decision Page で「明日のランチ、ラーメンか寿司どっちがいい?」と質問する。
> 「合議中...」表示の後、慎重派 → 楽観派 → 効率派が **それぞれ違うタイミングで** chat bubble に現れる。
> 全員の意見が出揃った後、最終 proposal カードが表示され、Yes/No swipe で採択する。
> 「実際に 3 人の AI が同時に考えて、考え終わった人から順に発言した」 という体験を得る。

### 受入基準 (Gherkin)

```
# 注: 「最低 1 秒以上の間隔」 は実 LLM (Claude CLI / LiteLLM) モードのみで観測可能。
# Mock LLM では <10ms で完了するため非該当 (test では set 比較で「3 件到着」のみ verify、§11.2 参照)。

Given /decision で「明日のランチを決めて」と入力して送信 (実 LLM mode)
When 各 persona の LLM 生成が完了する
Then 完了した順に SSE utterance event が yield される
  And 同一タイムスタンプで 3 件 burst するのではなく、最低 1 秒以上の間隔で時系列に到着する

Given 3 persona すべての utterance event が yield された
When backend が 4 つ目の proposal LLM call を実行する
Then 完了後 SSE proposal event が yield される
  And 続いて complete event が yield される

Given 1 persona の LLM call が 30 秒以内に完了しない
Then その persona は skip される (utterance event 出さず)
  And 他 persona の utterance + proposal は継続して yield される
  And audit log に persona_timeout が WARN で記録される

Given 全 persona が timeout した
Then SSE error event が yield される (reason=all_personas_failed)
  And proposal LLM call は実行されない
  And 既存 error handling (frontend toast 表示) が動作する
```

---

## 4. アーキテクチャ

### 4.1 現状 vs 新規

**現状** (`run_stream` 内):
```python
system = orchestrator.build_prompt(personas, profile_yaml)
llm_stream = llm.stream(system, user_input)
async for event in orchestrator.stream_parse(llm_stream, personas):
    yield event  # domain → utterance × 3 → proposal
```

**新規**:
```python
# 1. 各 persona 並列 LLM call
#    既存 LLMProviderAdapter.complete() signature: async def complete(*, system, messages, temperature) -> str
async def generate_persona(persona: Persona) -> tuple[Persona, str]:
    system_prompt = orchestrator.build_persona_prompt(persona)
    output = await llm.complete(
        system=system_prompt,
        messages=[{"role": "user", "content": user_input}],
    )
    return persona, orchestrator.clean_utterance_output(output)

tasks = [asyncio.create_task(generate_persona_with_timeout(p)) for p in personas]

# 2. 完了順に utterance event yield
utterance_outputs: list[tuple[Persona, str]] = []
for coro in asyncio.as_completed(tasks):
    persona, text = await coro
    if not text:
        continue  # degraded: skip empty (timeout / LLM error / empty response)
    utterance_outputs.append((persona, text))
    yield StreamEvent("utterance", {
        "persona_id": str(persona.id),
        "persona_name": persona.name,
        "text": text,
    })

# 3. 【C1 fix】 全 persona 失敗時の早期 return (proposal call せず)
if not utterance_outputs:
    yield StreamEvent("error", {
        "reason": "all_personas_failed",
        "detail": "all persona LLM calls timed out or returned empty",
    })
    return

# 4. proposal 生成 (4 つ目の LLM call)
proposal_system = orchestrator.build_proposal_prompt(utterance_outputs)
try:
    proposal_text = await asyncio.wait_for(
        llm.complete(
            system=proposal_system,
            messages=[{"role": "user", "content": user_input}],
        ),
        timeout=config.decision_llm_proposal_timeout_seconds,
    )
except asyncio.TimeoutError:
    yield StreamEvent("error", {
        "reason": "proposal_timeout",
        "detail": f"proposal LLM call exceeded {config.decision_llm_proposal_timeout_seconds}s",
    })
    return

yield StreamEvent("proposal", {
    "proposal_text": orchestrator.clean_proposal_output(proposal_text),
})

# 5. complete
yield StreamEvent("complete", {"decision_id": str(decision_id)})
```

### 4.2 Domain event を廃止 【I1 fix】

現状の prompt は冒頭で `<domain>...</domain>` を出力させ、SSE `domain` event として yield していた。並列化後は **domain event 自体を廃止** する。

理由:
- Frontend (`useDecisionStream.ts`) の switch 文に `domain` ケース無し → 受信しても無視
- Decision モデルの `domain_classification` 列は今後 `daily` (固定) で永続化、または別途 keyword matching で deterministic 判定
- 並列化後の prompt は persona 個別 (3 prompt) + proposal (1 prompt) で構成、domain 取得用の余分な LLM call を避ける

実装簡素化のメリット > Decision の domain 分類情報の喪失。後で必要になれば別 spec で復活。

### 4.3 Silence 判定 (沈黙演出) 【I2 fix】

宗教/選挙/暴力/卑猥 のドメイン検出は既存の `SilenceGuard` で行う。**並列化後も SilenceGuard は run_stream の冒頭で 1 度評価する**。silenced と判定されたら persona 並列 call は実行せず、`silence` event を yield して終了。

既存 API 仕様 (`apps/api/src/yesman_api/domain/decision/silence_guard.py` で検証済):
```python
class SilenceGuard:
    async def evaluate(self, *, user_input: str) -> SilenceVerdict: ...
    def evaluate_regex_only(self, *, user_input: str) -> SilenceVerdict: ...

@dataclass
class SilenceVerdict:
    is_silenced: bool
    domain: SilenceDomain | None
    response_text: str | None
```

並列化後の使用:
```python
verdict = await silence_guard.evaluate(user_input=user_input)
if verdict.is_silenced:
    yield StreamEvent("silence", {"text": verdict.response_text or ""})
    return
# else: persona 並列生成へ
```

---

## 5. Prompt 設計

### 5.1 Persona Prompt (新規 `build_persona_prompt`)

```python
PERSONA_PROMPT_TEMPLATE = """\
あなたは「{persona_name}」というペルソナです。

{persona_description}

ペルソナ指示:
{persona_prompt_text}

以下のユーザからの相談に対し、あなたの視点・性格を強く反映した
発言を **200 字以内** で 1 段落で述べてください。
冒頭に「{persona_name}の意見:」のようなラベルは不要、本文のみ出力してください。

ユーザの相談: <user_input>{user_input}</user_input>

意見:
"""
```

### 5.2 Proposal Prompt (新規 `build_proposal_prompt`)

```python
PROPOSAL_PROMPT_TEMPLATE = """\
以下の 3 つの意見を踏まえて、ユーザに対する **最終的な助言** を
**100 字以内** で出してください。

ユーザは Yes/No スワイプで採択するので、迷いの無い断定調・命令調の
明確な 1 文にしてください。冒頭に「最終助言:」「proposal:」 等の
ラベルは不要、本文のみ出力してください。

意見:
{utterance_block}

ユーザの相談: <user_input>{user_input}</user_input>

最終助言:
"""

# utterance_block の組み立て:
# - 慎重派: {utterance_1}
# - 楽観派: {utterance_2}
# - 効率派: {utterance_3}
```

### 5.3 Output 整形 【I4 fix】

```python
import re

_PERSONA_LABEL_RE = re.compile(r"^[^:：\n]+の意見[：:]\s*", re.MULTILINE)
_PROPOSAL_LABEL_RE = re.compile(r"^(最終助言|proposal)[：:]\s*", re.IGNORECASE)

def clean_utterance_output(text: str) -> str:
    """LLM 応答から「XXXの意見:」prefix を除去 + strip + 200 字制限."""
    cleaned = _PERSONA_LABEL_RE.sub("", text, count=1).strip()
    return _truncate(cleaned, 200)

def clean_proposal_output(text: str) -> str:
    """LLM 応答から「最終助言:」prefix を除去 + strip + 100 字制限."""
    cleaned = _PROPOSAL_LABEL_RE.sub("", text, count=1).strip()
    return _truncate(cleaned, 100)

def _truncate(text: str, max_chars: int) -> str:
    """Unicode code point 数で max_chars 以内に truncate.

    超過時は末尾 1 文字を `…` (U+2026) に置換、合計 max_chars 文字。
    例: max_chars=200, len(text)=250 → text[:199] + "…" (合計 200 文字).
    """
    if len(text) <= max_chars:
        return text
    return text[: max_chars - 1] + "…"
```

注意:
- `len()` は **Python の str length = Unicode code point 数** で数える (絵文字 1 個 = 1〜数 code point に展開、grapheme cluster 単位ではない。実用上問題なし)
- empty / blank → skip persona (degraded mode、§6.1 で text==="" で skip 判定)
- Word boundary 考慮なし (`text[:199]` で半端な箇所で切れる可能性。LLM に「200 字以内」と指示しているので実害は低い)

---

## 6. Concurrency / Timeout

| 項目 | 値 / 仕様 |
|---|---|
| Persona 並列度 | `len(personas)` (config 上限 3、INCEPTION 通り) |
| Persona timeout per call | 30 秒 (config から取得、`decision_llm_per_persona_timeout_seconds` 新規) |
| Proposal timeout | 20 秒 (config、`decision_llm_proposal_timeout_seconds` 新規) |
| 全体 timeout | 既存 `decision_llm_stream_total_timeout_seconds` (現状 90s) を継承 |
| Degraded mode | 1 persona failure → 残り persona で proposal 生成、log WARN |
| All failed | `error` event yield + audit log ERROR |

### 6.1 Implementation 詳細 【C2/M2 fix】

```python
async def generate_persona(persona: Persona) -> tuple[Persona, str]:
    """Persona の LLM call を実行、(persona, cleaned_text) を返す。"""
    system_prompt = orchestrator.build_persona_prompt(persona)
    raw_output = await llm.complete(
        system=system_prompt,
        messages=[{"role": "user", "content": user_input}],
    )
    return persona, orchestrator.clean_utterance_output(raw_output)

async def generate_persona_with_timeout(persona: Persona) -> tuple[Persona, str]:
    """timeout 包み込み。失敗時は empty string で skip marker。"""
    per_persona_timeout = config.decision_llm_per_persona_timeout_seconds
    try:
        return await asyncio.wait_for(
            generate_persona(persona),
            timeout=per_persona_timeout,
        )
    except asyncio.TimeoutError:
        # 既存 audit_log API: audit_log("event_name", **kwargs)
        # 参考: apps/api/src/yesman_api/interface/http/profiles.py
        audit_log(
            "audit.decision.persona_timeout",
            decision_id=str(decision_id),
            persona=persona.name,
            timeout_seconds=per_persona_timeout,
        )
        return persona, ""  # empty string = skip marker
    except Exception as exc:
        audit_log(
            "audit.decision.persona_error",
            decision_id=str(decision_id),
            persona=persona.name,
            error=str(exc),
        )
        return persona, ""

tasks = [asyncio.create_task(generate_persona_with_timeout(p)) for p in personas]
for coro in asyncio.as_completed(tasks):
    persona, text = await coro
    if not text or text.isspace():
        continue
    yield StreamEvent("utterance", {
        "persona_id": str(persona.id),
        "persona_name": persona.name,
        "text": text,
    })
```

---

## 7. SSE Event Ordering

### 7.1 並列化後の event 順序

```
event: start         (即時、decision_id 事前確定)
event: utterance(A)  (一番早い persona、~10s)
event: utterance(B)  (~13s)
event: utterance(C)  (~16s)
event: proposal      (~22s、全 persona 完了 + proposal LLM call 完了後)
event: complete      (即時)
```

**順序保証**:
- start は必ず最初 (engine.py L133-134 既存)
- utterance は完了順 (任意の persona が最初に来る可能性)
- proposal は全 utterance 後
- complete は最後

### 7.2 Frontend 互換性

既存 `useDecisionStream` の switch は event.type で分岐するだけなので、**順序が変わっても問題なく動作**。`utterances` array は dispatch onUtterance で append されるので、到着順 = 配列順となる (= chat-like timeline)。

---

## 8. 失敗 / Degraded mode

| 失敗ケース | 挙動 |
|---|---|
| 1 persona timeout (30s) | skip、他 persona + proposal は継続。WARN log |
| 1 persona LLM error (network 等) | skip、他 persona + proposal は継続。WARN log |
| 2 persona 同時 timeout | 残り 1 persona + proposal は継続。proposal prompt は 1 utterance のみ参照 |
| 全 persona timeout/error | `error` event yield (reason: `all_personas_failed`)、proposal call せず終了 |
| Proposal LLM timeout (20s) | `error` event yield (reason: `proposal_timeout`)、persona event は既送なので frontend は utterance 持つが proposal 無し → 別ハンドリング (現状 design とは別 spec) |
| Silence verdict 過程で LLM error | 既存 SilenceGuard error handling (`silenced=False` で進行、保守的 fallback) |

### 8.1 Proposal 失敗時の frontend 動作

現状の `reducer.ts` `onComplete` は `state.decisionId && state.proposal` 両方無いと完了 transition しない。proposal が来ないと state は streaming のまま → UI 上 utterance は見えるが Yes/No 出ない (silent stuck)。

**対応**: proposal 生成失敗時は `error` event を yield する (上記表通り)。frontend は既存の `onError` で toast 表示 + reset 可能。

---

## 9. Mock LLM の扱い

`LLM_PROVIDER=mock` は既存 `MockLLMAdapter.complete/stream` が固定文字列を返す設計。並列化後も:

- 各 persona に対して `mock.complete()` を呼ぶと、入力に関係なく固定 utterance を返す
- 並列化しても瞬時 (<10ms) で完了するので、現状の burst と同じく chat 効果は無い
- → Mock mode では artificial delay を入れない (test の高速性優先)
- 「自然な会話」体験は **実 LLM (Claude CLI / LiteLLM)** モードのみ

Mock mode テスト方針:
- 並列実行の正当性 (3 tasks gathered) を test で verify
- timeout / degraded mode を per-persona controllable な `MockLLMAdapter.complete_with_delay(persona_name, delay_ms)` で構築可

---

## 10. 変更ファイル一覧 【I3 fix】

| 種別 | パス | 内容 | 既存 test 影響 |
|---|---|---|---|
| 編集 | `apps/api/src/yesman_api/domain/decision/consensus.py` | `build_persona_prompt(persona)`, `build_proposal_prompt(utterances)`, `clean_utterance_output(text)`, `clean_proposal_output(text)`, `_truncate(text, max_chars)` を追加。既存 `build_prompt` / `stream_parse` / `parse` (XML) は **削除** | — |
| 編集 | `apps/api/src/yesman_api/domain/decision/engine.py` | `run_stream` を `asyncio.as_completed` ベースの parallel 実装に書き換え。silence check → persona 並列 → proposal の 3 stage | — |
| 編集 | `apps/api/src/yesman_api/infrastructure/config.py` | `decision_llm_per_persona_timeout_seconds: int = 30` と `decision_llm_proposal_timeout_seconds: int = 20` を追加 | — |
| **全 rewrite** | `apps/api/tests/unit/decision/test_consensus.py` | 既存 2 classes (`TestParse`, `TestStreamParse`、XML parser test) は **全削除**。新 prompt 関数 + clean output 関数 の test を追加 | 既存 2 classes ~30 test 削除、新規 ~10 test 追加 |
| 編集 | `apps/api/tests/unit/decision/test_engine.py` | 既存 3 test: `test_silence_path_skips_decision_persist` (維持)、`test_normal_path_persists_decision` (parallel 版に rewrite)、`test_apply_choice_yes_publishes_event` (維持) + 新規: degraded mode / proposal timeout / all-failed | 1 test rewrite + 3 test 新規 |
| 編集 | `apps/api/tests/integration/decision/test_decision_flow.py` | SSE event 順序 assert を update (domain event 廃止、utterance 順序は完了順) | event sequence assert 修正 |
| 編集 | `apps/api/tests/integration/decision/test_sse_stream.py` | 同上 | event sequence assert 修正 |
| 不変 | `apps/api/tests/integration/decision/test_sse_disconnect.py` | event 順序に依存しない disconnect test | — |

Frontend は変更不要。

---

## 11. テスト方針 【C4 fix】

### 11.1 Unit (consensus.py、新規 7 ケース)

- `build_persona_prompt(persona)` が `persona.name` / `persona.description` / `persona.prompt_text` を含む prompt を返す
- `build_persona_prompt` が persona name の `"` を escape する (`_escape_persona_name` 既存ロジック流用)
- `build_proposal_prompt(utterances)` が `- 慎重派: ...` 形式で全 utterance を含む prompt を返す
- `clean_utterance_output("慎重派の意見: ラーメンは...")` が prefix `慎重派の意見:` を除去
- `clean_utterance_output("  text  ")` が trailing/leading whitespace を strip
- `clean_proposal_output("最終助言: ...")` が prefix `最終助言:` を除去
- `_truncate(text, 200)` が 200 字以下なら不変、201 字以上なら `text[:199] + "…"` で 200 字に切り詰める

### 11.2 Unit (engine.py、parallel 動作)

**【C4 fix】 Mock LLM 並列の非決定性対応**:
- Mock LLM は瞬時応答 (<10ms) のため `asyncio.as_completed` の順序は実装依存
- 順序を assert せず、**set 比較** で「N 個の utterance event が到着」のみ verify
- 順序検証が必要な test は **per-persona deterministic delay** で実現 (新規 fixture `MockLLMAdapter.complete_with_delay(persona_name → ms)`)

Test cases:
- `test_normal_path_parallel_utterances`: 3 persona 全成功 → utterance event 3 件 + proposal 1 件 + complete 1 件 が yield される (順序非依存、set 比較)
- `test_persona_order_with_delay`: persona ごとに deterministic delay (慎重 10ms / 楽観 50ms / 効率 100ms) を設定 → utterance event の到着順が慎重 → 楽観 → 効率 になる (順序依存)
- `test_degraded_one_persona_timeout`: 1 persona を 60 秒 delay (timeout 30s 超え) → 残り 2 utterance + 1 proposal で完了、event 数 3
- `test_all_personas_timeout`: 全 persona 60s delay → error event 1 件 (reason=`all_personas_failed`)、proposal call なし
- `test_proposal_timeout`: persona OK、proposal を 30s delay → utterance 3 + error (reason=`proposal_timeout`)
- `test_silence_path_skips_decision_persist`: **既存維持** (silenced → silence event のみ、persona call せず)
- `test_apply_choice_yes_publishes_event`: **既存維持** (parallel 化に依存しない)

### 11.3 Integration (SSE event sequence)

- `test_decision_flow.py`: `POST /v1/decisions/request/stream` の event sequence assert を update:
  - 旧: `[start, domain, utterance×3, proposal, complete]` (順序固定)
  - 新: `[start, ...(任意順 utterance×3), proposal, complete]` (utterance は順序非依存、set で持つ)
- `test_sse_stream.py`: domain event の assertion を削除、utterance set 比較に変更
- `test_sse_disconnect.py`: 既存維持 (event 順序非依存)
- mock LLM で複数 decision を並行実行できる (state 干渉なし) — 既存通り

---

## 12. Risk / Mitigation

| Risk | 影響 | 緩和策 |
|---|---|---|
| LLM 呼び出し回数 1 → 4 倍 | Claude CLI subscription なら無料、Bedrock 等の従量課金で 4x cost | spec §9 で Mock mode 影響なしと明示、本番運用時の cost monitoring は別 issue |
| Persona 間で意見が独立して矛盾 | 統合感が弱まる可能性 | proposal LLM call で 3 意見を統合 → 矛盾解消 |
| Total latency 増加可能性 | max(persona_t) + proposal_t = 現状とほぼ同じ (20-25s) | spec §2 timing example で示す通り |
| Mock test の並列実行で race | asyncio test の不安定化 | `MockLLMAdapter.complete` を deterministic、order verify ではなく set 比較で対応 |
| 既存 `stream_parse` 削除で test 影響 | 古い test が壊れる | parallel 実装に書き換える test を spec §11 に列挙 |

---

## 13. Out of Scope

- Per-token (typewriter) streaming
- Persona 間の inter-reference (慎重派が楽観派に反論する会話)
- Frontend staged reveal artificial delay (実 LLM 並列で十分な timing 差を出せる前提)
- Domain 判定の復活 (SilenceGuard で代替済)
- Mock LLM の artificial delay (test 高速性のため固定)

---

## 14. Git-Flow

- Branch: `feature/parallel-persona-consensus` (新規、`develop` から)
- Squash merge → `develop`
- Conventional Commits、AI-assisted trailer 必須
- 完了基準:
  - [ ] consensus.py / engine.py 並列化
  - [ ] 既存 unit test + integration test 全 pass
  - [ ] e2e (Mock LLM) で Decision Yes 採択 flow 動作
  - [ ] 手動検証 (Claude CLI mode) で各 persona が時間差で chat bubble 表示

---
