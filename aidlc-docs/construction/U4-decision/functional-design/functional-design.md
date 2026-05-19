# U4 / decision — Functional Design

**Unit**: U4 / decision — DecisionEngine + ConsensusOrchestrator + SilenceGuard + DiscussionStreamer + NudgeMessageGenerator + AutonomyScorer + LLMProviderAdapter
**Phase**: CONSTRUCTION — Functional Design
**Author**: AI-DLC workflow
**Created**: 2026-05-16
**Status**: 🟡 IN REVIEW

---

## 0. 位置付け

ハッカソンデモのコア機能 (合議による意思決定 + 沈黙ガード + SSE ストリーミング + 主体性スコア) を実装するユニット。U2 / storage の DecisionRepository / SilenceLogRepository / PersonaRepository (builtin 3 種 seed 済) と U3 / auth の AuthenticatedUser に接続する。

### 関連要件
- **FR-AI-01〜08** (LiteLLM 抽象化 + プロバイダー切替 + multi-persona 合議 + 単一プロンプト合議)
- **FR-DM-SILENT** (沈黙演出ドメイン: 宗教/選挙/暴力/卑猥)
- **FR-NUDGE-01〜05** (AI 生成可変メッセージ)
- **FR-NO-01〜03** (No 採択時の再合議 + No 回数記録 + 上限なし段階強化)
- **FR-SCORE-01〜04** (主体性スコア = No 比率)
- **FR-CV-01〜09, 12** (SSE 配信 + 中間出力永続化 + 切断耐性 + CLI フォールバック)
- **FR-LEARN-07** (DecisionConfirmed イベント発火 → 非同期で嗜好プロファイル更新、U5 で消費)
- **NFR-SEC-05** (LLM 送信前 PII フィルタ)
- **NFR-PRIV-04** (沈黙ガード二重化、本番のみ Bedrock Guardrails)

### 上流前提
| 出典 | 内容 |
|---|---|
| U1 AI Stack | Bedrock IAM ManagedPolicy + Bedrock Guardrails (`guardrailId`) + EventBridge Bus + SQS Queue |
| U2 DecisionRepository | `insert / update_choice / get / list_by_user / count_no_by_user / search_by_input_hash` |
| U2 SilenceLogRepository | `insert / list_by_user / count_by_domain` (本文は hash のみ) |
| U2 PersonaRepository | builtin 3 種 (慎重派/楽観派/効率派) を seed 済 (`0002_builtin_personas`)、`list_by_owner(system_user, include_deleted=False)` で取得可 |
| U2 UserPersonaSelectionRepository | ユーザーの選択した 2〜3 ペルソナ (`selected_persona_ids`) を保持 |
| U3 AuthenticatedUser | `request.state.user` から取得、`user.sub` を Decision/SilenceLog の user_id に |

### MVP スコープ (U4 内)
- ✅ SilenceGuard (LLM 自己判定、Bedrock Guardrails は本番限定の追加層として NFR Design で明示)
- ✅ LLMProviderAdapter (LiteLLM 抽象化、Bedrock + Mock の 2 backend を MVP で実装、他は将来)
- ✅ ConsensusOrchestrator (単一プロンプト内の多人格合議テンプレ + 出力 parse)
- ✅ DecisionEngine (上記をまとめてオーケストレート)
- ✅ DiscussionStreamer (SSE `POST /v1/decisions/request/stream`)
- ✅ 非ストリーミング (`POST /v1/decisions/request`、CLI フォールバック / mock 動作確認用)
- ✅ Yes/No 採択 (`POST /v1/decisions/{decision_id}/choice`)
- ✅ AutonomyScorer (`GET /v1/scores/me`)
- ✅ NudgeMessageGenerator (Yes 確定メッセージ + No 再考メッセージ)
- ✅ EventBridge 発火 (Yes 確定時、`DecisionConfirmed`)
- ⏭ Custom Persona 選択 → U-Persona 完了後に拡張、U4 では **builtin 3 種固定** (デフォルト推奨セット)
- ⏭ 履歴閲覧 / エクスポート → 別ユニット or U-Test の対象、U4 はメソッドのみ
- ⏭ Bedrock Guardrails 統合 → 本番デプロイ時 (`config.app_env == "prod"`) のみ、MVP は skip
- ⏭ PII フィルタ → MVP は正規表現ベースの簡易フィルタ (LLM 送信前、email/phone/credit card)。本格的な PII は U5 と連携

---

## 1. ドメインモデル

### 1.1 DecisionRequest (in-flight、永続化しない)

```python
@dataclass(frozen=True, slots=True)
class DecisionRequest:
    user_id: UUID
    user_input: str                 # 自然言語入力 (テキスト or 音声→文字起こし済)
    selected_persona_ids: list[UUID]  # 2-3 個、未指定なら builtin 3 種デフォルト
    llm_provider: str               # config.llm_provider (bedrock/mock/...)
```

### 1.2 ConsensusOutput (LLM 出力 parse 結果)

```python
@dataclass(frozen=True, slots=True)
class PersonaUtterance:
    persona_id: UUID
    persona_name: str               # "慎重派" 等
    text: str                       # 発言本文

@dataclass(frozen=True, slots=True)
class ConsensusOutput:
    domain_classification: Literal["daily", "work", "school", "major", "silenced"]
    utterances: list[PersonaUtterance]  # 各人格の議論内容
    proposal_text: str              # 最終提案 (断定調、FR-AI-05)
    llm_provider: str
```

### 1.3 SilenceVerdict

```python
@dataclass(frozen=True, slots=True)
class SilenceVerdict:
    is_silenced: bool
    domain: Literal["religion", "election", "violence", "obscene", None]
    response_text: str | None       # 沈黙レスポンス (固定文 + 軽い AI 出力)
```

---

## 2. SilenceGuard

`apps/api/src/yesman_api/domain/decision/silence_guard.py`

### 2.1 責務
- ユーザー入力に対し沈黙演出ドメイン (宗教/選挙/暴力/卑猥) の有無を判定
- 該当時は `SilenceVerdict(is_silenced=True, domain=..., response_text=...)` を返し、合議をスキップ
- `SilenceLog` を Repository に記録 (本文は hash のみ、NFR-PRIV-04)

### 2.2 判定方式 (2 段階)
1. **正規表現ベースの即時フィルタ** (キーワードヒット): 高速、決定的、誤検出多め
2. **LLM 自己判定** (1 段目で素通り or low-confidence な時のみ呼ぶ): 文脈考慮、コスト発生

`config.app_env == "prod"` では追加で **Bedrock Guardrails** を LLMProviderAdapter 内で適用 (二重化、NFR-PRIV-04)。NFR Design で詳細。

### 2.3 沈黙レスポンス文 (FR-AI-06)
- **固定テンプレ** で軽く: 「この内容については AI が判断を代行できません。ご自身でじっくり考えていただけたらと思います。」
- ドメイン名は出さない (= 「あなたの入力が暴力に該当」と非難する形にしない)

### 2.4 SilenceLog の hash
- `user_input_hash = sha256(user_id || user_input).hexdigest()` (user_id を salt 兼用)
- 本文は保存しない (NFR-PRIV-04)

---

## 3. LLMProviderAdapter (Strategy)

`apps/api/src/yesman_api/application/decision/llm_provider.py` (Protocol)
`apps/api/src/yesman_api/infrastructure/decision/llm_providers/` (実装)

### 3.1 Protocol

```python
@runtime_checkable
class LLMProviderAdapter(Protocol):
    provider_name: str  # "bedrock" / "mock" / ...

    async def complete(
        self, *, system: str, messages: list[dict], temperature: float = 0.7
    ) -> str:
        """非ストリーミング: 完了レスポンスを一括返却 (FR-CV-12 フォールバック用)."""

    async def stream(
        self, *, system: str, messages: list[dict], temperature: float = 0.7
    ) -> AsyncIterator[str]:
        """ストリーミング: chunk (string) を yield (FR-CV-08)."""

    async def aclose(self) -> None: ...
```

### 3.2 MVP 実装

| Backend | 実装ファイル | 特徴 |
|---|---|---|
| `bedrock` | `infrastructure/decision/llm_providers/bedrock_adapter.py` | LiteLLM 経由で `anthropic.claude-3-haiku-20240307-v1:0` を呼ぶ。stream/non-stream 両対応 |
| `mock` | `infrastructure/decision/llm_providers/mock_adapter.py` | 固定プロンプトテンプレに対し決定的な fake 出力。chunk-by-chunk yield でストリーミング模擬 |

### 3.3 LLMProviderFactory

`config.llm_provider` に応じて dispatch、process-wide singleton (lifespan で生成 + dispose、U3 AuthBackendFactory と同パターン)。

---

## 4. ConsensusOrchestrator

`apps/api/src/yesman_api/domain/decision/consensus.py`

### 4.1 責務
- 選択ペルソナ群から **合議プロンプト** を構築 (single-prompt、FR-AI-08)
- LLM 出力 (free text) を **構造化フォーマット** に parse して `ConsensusOutput` 生成
- 人格別発言の分割 (FR-CV-03 アバター紐付け用)

### 4.2 プロンプトテンプレ (single-prompt 戦略) — ultrathink I7 反映: persona 数を動的化

LLM に**XML タグ**で出力を強制する (parse の堅牢性を取る、JSON モードはプロバイダー依存)。
ペルソナ数は **2-N 個動的**で、`_render_persona_blocks(personas: list[Persona])` ヘルパーで構築:

```
あなたは YesMan の意思決定エンジンです。以下の {persona_count} 人の人格を演じ、
入力に対して合議を行い、最終提案を 1 つに集約してください。

合議する人格:
{persona_descriptions}      # 例: "- 慎重派 (リスク回避型): ..."、"- 楽観派 (前向き型): ..."

ユーザープロフィール: {profile_yaml}
ユーザー入力: {user_input}

出力フォーマット (厳守):
<domain>daily|work|school|major|silenced</domain>
{utterance_template_block}  # 動的に各人格分の <utterance persona="..."> ブロックを列挙
<proposal>最終提案 (断定調、〜してください/〜です。100 字以内)</proposal>
```

- MVP では builtin 3 種が渡るため `persona_count=3` だが、FR-PERSONA-03 整合で **2-N 個対応のコードパス**
- 5 個以上 / 名前重複は ConsensusOrchestrator 側で reject (parse 困難)

### 4.3 出力 parse
- 正規表現 + XML tag 抽出 (`xml.etree.ElementTree` は宣言なしで動作不安定なため、独自 regex parser)
- 不正出力時のフォールバック: `parse_with_recovery()` が部分抽出 (proposal のみ取れれば成功扱い、utterances は空 list)
- **degraded 状態の扱い** (ultrathink Imp3 反映): LLM が XML 出力を守れない場合、`utterances=[]` で永続化される。FR-CV-07 の議論ビューは空表示 + final proposal のみ表示。発生時は **CloudWatch に WARN ログ** (`audit.decision.parse_degraded`) を出力し、Bedrock model upgrade or prompt 改善の trigger とする

### 4.4 ストリーミング parse
- chunk 受信中、tag boundary をまたぐデータを buffer に蓄積
- 完全な `<utterance>...</utterance>` が出揃ったら **逐次 client に SSE event として配信**
- 最終 `<proposal>` も同様

### 4.5 ペルソナ選択 (ultrathink I1 反映: SYSTEM_USER_ID 正確値明示)

- リクエストの `selected_persona_ids` を `PersonaRepository.get(id)` で取得
- 未指定 (空 list) なら **builtin 3 種** (慎重派/楽観派/効率派) を `list_by_owner(SYSTEM_USER_ID)` で取得
- 取得失敗 (削除済 / block 済) は除外、最終 0 個になればエラー (`AuthError` 相当の `DecisionError("no_personas")`)

#### SYSTEM_USER_ID の定数化
- **正確値**: `UUID("00000000-0000-0000-0000-000000000001")` (U2 `alembic/versions/0002_builtin_personas.py:26` で確定済、`-000000000000` ではない点に注意)
- **配置**: `apps/api/src/yesman_api/domain/persistence/constants.py` (新規) に `SYSTEM_USER_ID: Final[UUID]` として定数化
- U4 ConsensusOrchestrator + Alembic 0002 (既存) が同じ値を参照する形で重複定義を許容 (Alembic への遡及修正は不要、値が一致していれば整合)

---

## 5. DecisionEngine

`apps/api/src/yesman_api/domain/decision/engine.py`

### 5.1 責務
- DecisionRequest を受け、SilenceGuard → ConsensusOrchestrator → 永続化 → EventBridge 発火 の流れをまとめる
- 非ストリーミング版 (`run(request)` → `ConsensusOutput`)
- ストリーミング版 (`run_stream(request)` → `AsyncIterator[StreamEvent]`)

### 5.2 フロー (非ストリーミング)

```
1. SilenceGuard.evaluate(user_input)
   if silenced: SilenceLog 記録 + SilenceVerdict 返却 (合議スキップ)
2. PersonaRepository でペルソナ取得 (selected_persona_ids or builtin 3 種)
3. ProfileRepository.get(user_id) → プロフィール取得 (プロンプトに含める)
4. ConsensusOrchestrator.build_prompt(profile, user_input, personas)
5. LLMProviderAdapter.complete(system=..., messages=[...])
6. ConsensusOrchestrator.parse(llm_output) → ConsensusOutput
7. Decision エンティティを構築 (domain_classification, user_input_hash, persona_outputs JSONB)
   DecisionRepository.insert(decision)
8. ConsensusOutput を返却 (decision_id, proposal_text, utterances)
```

### 5.3 フロー (ストリーミング)

```
1〜4. 同上
5. LLMProviderAdapter.stream(...) で chunk を受信
6. ConsensusOrchestrator.feed(chunk) → 完成した tag を逐次 yield (StreamEvent)
   StreamEvent: {"type": "domain", "data": "daily"}
                {"type": "utterance", "persona": "慎重派", "text": "..."}
                {"type": "proposal", "text": "..."}
                {"type": "complete", "decision_id": "..."}
7. 全 chunk 受信完了後、ConsensusOutput を組み立てて Decision 永続化
8. 切断時も background task で永続化を保証 (FR-CV-09)
```

### 5.4 No 採択時の再合議 (FR-NO-01) — ultrathink I2 反映: no_count の正しい意味と保存パターン

`POST /v1/decisions/{decision_id}/choice` で `choice=no` 受領時:

```python
summary = await repo.count_no_by_user(user_id)  # {"no_count": int, "total": int}
new_no_count = summary["no_count"] + 1
await repo.update_choice(decision_id, choice="no", no_count=new_no_count)
# → U2 Decision.no_attempt_count フィールド (L74、default=0) にこの値が保存される
# → 後の NudgeMessageGenerator が「No 連続回数」として参照、FR-NUDGE-03 段階強化のトリガに利用
```

- 新規 DecisionRequest を作成 (元の user_input + 「前提案 X はユーザーに拒否された、別案を提示」のヒント追加)
- 通常の合議フローを再実行 → 新 Decision を永続化
- 元 Decision は上記 update_choice で確定済に

→ 再合議は同期 (FR-NO-01)。FE はまた同じ flow で SSE/non-stream を再呼び出し。

---

## 6. DiscussionStreamer (SSE)

`apps/api/src/yesman_api/interface/http/decisions.py`

### 6.1 エンドポイント

| Method | Path | 認証 | 説明 |
|---|---|---|---|
| POST | `/v1/decisions/request` | 必須 | 非ストリーミング合議 (CLI フォールバック / mock 検証用) |
| POST | `/v1/decisions/request/stream` | 必須 | SSE ストリーミング合議 (FR-CV メイン) |
| POST | `/v1/decisions/{decision_id}/choice` | 必須 | Yes/No 採択、Yes なら EventBridge 発火 |
| GET | `/v1/scores/me` | 必須 | 主体性スコア (no_count / total) |

### 6.2 SSE 配信フォーマット — ultrathink Imp2 反映: `start` event 新設で decision_id を最初に通知

```
event: start
data: {"decision_id": "uuid"}              # ← API が UUID v4 を request 受領時に生成、最初に送信

event: domain
data: {"domain": "daily"}

event: utterance
data: {"persona_id": "uuid", "persona_name": "慎重派", "text": "..."}

event: utterance
data: {"persona_id": "uuid", "persona_name": "楽観派", "text": "..."}

event: proposal
data: {"text": "..."}

event: complete
data: {"decision_id": "uuid"}

event: error
data: {"reason": "silenced|llm_unavailable|...", "detail": "..."}

event: silence                              # 沈黙ガード時のみ
data: {"text": "...固定文..."}
```

- FastAPI `StreamingResponse(media_type="text/event-stream")`
- `decision_id` は API がリクエスト受領時に **`uuid4()` で事前生成** し、最初の `start` event で配信 → **切断後の履歴復元キーが接続直後から確定**
- 永続化時 (`DecisionRepository.insert`) も同じ UUID を使う (= 事前確定 ID パターン)
- ALB Idle Timeout 120s 内に完了想定 (PERF-U1-04)、超過時は client 切断 + background task で `decisions` 永続化を完遂 (FR-CV-09)

### 6.3 沈黙時の応答
- `event: silence` + `data: {"text": "...固定文..."}` を 1 つだけ送って close
- SilenceLog 記録は SilenceGuard 内部で完了

---

## 7. NudgeMessageGenerator

`apps/api/src/yesman_api/domain/decision/nudge.py`

### 7.1 責務
- Yes 確定時の **AI 生成肯定メッセージ** (FR-NUDGE-01): 「うまく任せられていますね」相当を毎回生成
- No 連続時の **AI 生成再考メッセージ** (FR-NUDGE-02/03): 「本当に？」「もう一度考えてみては？」相当を no_count に応じて段階強化
- 固定文ではなく **LLMProviderAdapter.complete** で毎回生成 (FR-NUDGE-01/02/03 確定)

### 7.2 API — ultrathink I5 反映: 非同期化 (FR-NUDGE-05 準拠)

採択 API のレスポンスは即時返却、Nudge メッセージは別 endpoint で polling:

| Method | Path | 動作 |
|---|---|---|
| POST | `/v1/decisions/{decision_id}/choice` | choice 確定 + 採択レスポンス即時返却 (`{"decision_id": "...", "nudge_url": "/v1/decisions/{id}/nudge", "no_attempt_count": int}`)、BackgroundTasks で nudge 生成 |
| GET | `/v1/decisions/{decision_id}/nudge` | nudge_message を取得 (生成中なら `{"status": "pending"}` 202、完成なら `{"status": "ready", "message": "..."}` 200) |

- BackgroundTasks で `NudgeMessageGenerator.generate(decision, profile, choice)` を起動 → 結果は in-memory cache (process-wide dict + TTL 10min) に保存
- FE は採択直後の遷移を中断せず、次画面で `/nudge` を 1 回 fetch (1-3s のラグ許容)
- 結果キャッシュは process-wide で multi-worker 構成では worker miss 発生 → MVP では許容、本番拡張は Redis (U-Test 後)

### 7.3 プロンプト (短い、低レイテンシ志向)

```
ユーザーは AI に意思決定を任せるサービスを使っています。
直前の提案: {proposal_text}
ユーザーの選択: Yes
これまでの No 連続回数: {no_streak}

ユーザーに対し、以下の方針で 1 行 (30 字以内) のメッセージを生成してください:
- Yes: 委任成功への肯定的フィードバック
- No (no_streak=1): 軽い再考の提案
- No (no_streak=2): 「本当に？」のニュアンス強化
- No (no_streak=3+): 「本当に大丈夫ですか?」段階強化
```

---

## 8. AutonomyScorer

`apps/api/src/yesman_api/domain/decision/scorer.py`

### 8.1 責務
- `DecisionRepository.count_no_by_user(user_id)` → `DecisionCountSummary{ no_count, total }`
- スコア = `no_count / total` (= No 比率、低いほど委任度高)
- `score_message` は AutonomyScorer 自身が固定マッピングで生成 (FR-SCORE-02)、または NudgeMessageGenerator に委譲 (任意)

### 8.2 API
- `GET /v1/scores/me` → `{ "no_count": int, "total": int, "ratio": float, "message": str }`

### 8.3 ratio 計算 — ultrathink Imp5 反映

- `total` は **`user_choice in {'yes', 'no'}` の採択済のみカウント、`pending` は除外** (= 提案中で未確定の決定はスコアに影響しない)
- `DecisionRepository.count_no_by_user` の SQL 実装 (U2) でも同様の pending 除外を確認 (= NFR Req で要件として明示し、もし U2 実装が pending 含むなら U2 への遡及修正計画を Infra Design 段階で立てる)
- `total == 0` (履歴なし) → `ratio = null` + 「まだ意思決定の履歴がありません」
- `total > 0` → `ratio = round(no_count / total, 3)`

---

## 9. EventBridge 発火 (FR-LEARN-07) — ultrathink I6 反映: Yes/No 両方発火

### 9.1 責務
- **Yes/No いずれの採択時にも** `DecisionConfirmed` イベントを EventBridge に publish (FR-LEARN-01 「Yes/No 履歴から嗜好プロファイル構築」整合)
- U5 / learning が SQS 経由で消費し、嗜好プロファイルを更新 (Yes = 正のシグナル、No = 負のシグナル)

### 9.2 実装
- `boto3.client("events").put_events(Entries=[...])` を `EventPublisher` 抽象に閉じ込める
- `config.event_backend = "eventbridge"` 時は EventBridge、`"inline-async"` 時は同期で U5 logic を直接呼ぶ (dev/test 用)、`"sync"` 時は no-op (MVP)
- イベントスキーマ (choice フィールドで Yes/No を識別):
  ```json
  {"DetailType": "DecisionConfirmed",
   "Source": "yesman.api",
   "Detail": {"user_id": "...", "decision_id": "...",
              "choice": "yes" or "no",
              "domain": "daily", "timestamp": "2026-05-16T..."}}
  ```

### 9.3 Strategy
- `EventPublisher` Protocol + 3 実装 (EventBridge / InlineAsync / Sync)
- AuthBackendFactory と同じパターン

---

## 10. テスト戦略

| ファイル | 種別 | 対象 |
|---|---|---|
| `tests/unit/decision/test_silence_guard.py` | unit | 正規表現フィルタ 4 ドメイン + LLM 判定モック |
| `tests/unit/decision/test_consensus_parser.py` | unit | 完全 XML / 部分 XML / 不正出力の parse |
| `tests/unit/decision/test_mock_llm.py` | unit | MockLLMProvider の complete/stream/aclose |
| `tests/unit/decision/test_engine.py` | unit | DecisionEngine の沈黙・通常・No 再合議パス |
| `tests/unit/decision/test_nudge.py` | unit | Yes / No streak 1/2/3+ パターン |
| `tests/unit/decision/test_scorer.py` | unit | total=0 / no_count=0 / 通常パス |
| `tests/unit/decision/test_event_publisher.py` | unit | 3 backend (eventbridge/inline-async/sync) |
| `tests/integration/decision/test_decision_flow.py` | integration | Mock LLM + Mock Repo で E2E (request → choice → score) |
| `tests/integration/decision/test_sse_stream.py` | integration | StreamingResponse の chunk 単位検証 |
| `tests/contract/test_llm_provider_protocol.py` | contract | BedrockAdapter / MockAdapter が同一 Protocol |
| `tests/contract/test_event_publisher_protocol.py` | contract | EventBridge / InlineAsync / Sync が同一 Protocol |
| `tests/property/test_parser_robustness.py` | PBT | Hypothesis で任意 LLM 出力 → ConsensusOrchestrator.parse が必ず ConsensusOutput or 部分抽出 |
| `tests/property/test_silence_guard_robustness.py` | PBT | Hypothesis で任意 user_input → SilenceVerdict (boolean) 返却保証、例外なし (ultrathink Imp6) |
| `tests/property/test_prompt_size_bound.py` | PBT | 任意プロフィール + 入力 → プロンプト長 < 100k tokens (Bedrock Haiku の context window 制限、ultrathink Imp6) |

---

## 11. 引き継ぎ (NFR Requirements / Infrastructure Design) — ultrathink I3 + I4 + Imp1 + Imp4 反映

NFR Req で確定する事項:
- **PERF**:
  - 非ストリーミング合議 p95 < 5 秒 (Bedrock + Haiku)
  - SSE 初 chunk < 1.5 秒、全 chunk 完了 < 120 秒
  - Nudge 生成は非同期 (background)、polling レイテンシ 200ms 以下
- **SEC**:
  - **PII フィルタを `apps/api/src/yesman_api/shared/pii_filter.py` に共通 helper として実装** (mask_pii(text) → email/phone/credit card を `***` マスク、ultrathink I4 反映)
  - LLM 送信前に DecisionEngine と NudgeMessageGenerator 両方で適用
  - SilenceLog の本文非保存 (hash のみ、NFR-PRIV-04 既存)
- **AVAIL** (ultrathink I3 反映、タイムアウト 2 段化):
  - `LLMProviderAdapter.complete`: 全レスポンス 30 秒以内 + リトライ 1 回
  - `LLMProviderAdapter.stream`: 初 chunk 5 秒以内 / 全 chunk 完了 120 秒以内 (ALB Idle Timeout と整合)
  - LLM 完全失敗時のフォールバック (mock or 沈黙レスポンス、FR-AVAIL-03 整合)
- **EXT**: LLMProviderAdapter Protocol + EventPublisher Protocol で switch 可能
- **TEST**: ConsensusOrchestrator parser + SilenceGuard に PBT 適用、SSE chunk 順序検証 (start → domain → utterance × N → proposal → complete)

### 環境変数 (Infrastructure Design へ)
- `BEDROCK_MODEL_ID: str = "anthropic.claude-3-haiku-20240307-v1:0"` (ultrathink Imp4: AppConfig default として配置)
- `BEDROCK_GUARDRAIL_ID: str | None = None` (本番のみ、U1 AI Stack Output 由来)
- `DECISION_LLM_TIMEOUT_SECONDS: float = 30.0` (complete 用)
- `DECISION_LLM_STREAM_INITIAL_TIMEOUT_SECONDS: float = 5.0`
- `DECISION_LLM_STREAM_TOTAL_TIMEOUT_SECONDS: float = 120.0`
- `NUDGE_GENERATION_ENABLED: bool = True` (Mock backend は false で固定文に degrade 可)
- `NUDGE_CACHE_TTL_SECONDS: float = 600.0`

### DTO 構造 (ultrathink Imp1 反映)
- ドメイン側 `ConsensusOutput` は永続化前で **decision_id 持たない**
- API レスポンス DTO `DecisionResponse(decision_id, domain, utterances, proposal_text, nudge_url, no_attempt_count)` を `interface/http/dto/decision.py` に別途定義
- Infra Design でファイル一覧確定

---

## 12. 承認チェックリスト

- [x] スコープ確定 (MVP 7 機能 + 5 スコープ外項目を明示)
- [x] ドメインモデル (DecisionRequest / ConsensusOutput / PersonaUtterance / SilenceVerdict)
- [x] SilenceGuard (2 段判定 + Bedrock Guardrails 本番限定二重化 + hash のみ記録)
- [x] LLMProviderAdapter Protocol + 2 backend (Bedrock / Mock) + Factory
- [x] ConsensusOrchestrator (single-prompt XML テンプレ + **persona 数動的化 2-N** + 出力 parse + streaming 対応 + **SYSTEM_USER_ID 定数化**)
- [x] DecisionEngine 非ストリーミング / ストリーミング / **No 再合議 (no_attempt_count = 既存 + 1 を保存)**
- [x] DiscussionStreamer SSE エンドポイント仕様 (4 種、**`start` event で decision_id を最初に通知**)
- [x] NudgeMessageGenerator **非同期生成 + GET /nudge polling パターン** (FR-NUDGE-05 準拠)
- [x] AutonomyScorer (採択済のみ total に算入、pending 除外)
- [x] EventPublisher (3 backend、**Yes/No 両方の採択時に DecisionConfirmed 発火**)
- [x] テスト戦略 (13 ファイル: unit 7 + integration 2 + contract 2 + PBT 3)
- [x] 次ステージへの引き継ぎ事項 (PII フィルタ shared/pii_filter.py / LLM タイムアウト 2 段 / DTO 構造 / 環境変数 7 個)

### ultrathink レビュー (2026-05-16) 反映済 13 件
- **Important 7**: I1 SYSTEM_USER_ID 正確値 + 定数化 / I2 no_count = 既存+1 を update_choice / I3 LLM タイムアウト complete (30s) と stream (5s/120s) 分離 / I4 PII フィルタを shared/pii_filter.py / I5 NudgeMessage 非同期 + GET /nudge polling / I6 EventBridge Yes/No 両方発火 / I7 ConsensusOrchestrator persona 数 2-N 動的化
- **Improvements 6**: Imp1 ConsensusOutput vs API DTO 分離 / Imp2 SSE `start` event で decision_id 最初配信 / Imp3 parse_with_recovery degraded 状態明示 + audit log / Imp4 BEDROCK_MODEL_ID default AppConfig / Imp5 AutonomyScorer total は採択済のみ / Imp6 PBT 追加 (silence_guard_robustness + prompt_size_bound)

---

## Post-CONSTRUCTION 改修注記 (2026-05-17 〜 2026-05-19)

本ドキュメント本体は 2026-05-16 承認時の Snapshot を保持。以下の改修が Post-CONSTRUCTION 段階で本 unit のスコープに加わった:

### 1. 委任度スコアの意味反転 (`317280b`、2026-05-17)

**背景**: CONSTRUCTION 段階の `AutonomyScorer` は「No 比率 = 自律性」と定義していたが、コンセプト「Yes 比率が高いほど委任度が高い (= AI を信頼している)」と矛盾していた。

**変更点**:
- **`domain/decision/scorer.py`**: `ratio` 計算式を `no_count / total` → `yes_count / total` に反転
- warning 閾値も `ratio > 0.5 → 警告` から `ratio < 0.5 → 警告` に反転 (低い Yes 比率 = 委任不十分)
- copy: 「主体性スコア」→「**委任度スコア**」に統一
- 不変条件: `0.0 <= ratio <= 1.0`、`total = yes + no + pending` (pending 除外計算は維持)

**影響範囲**:
- API surface: `GET /v1/scores/me` の `ratio` フィールドの意味が反転 (値域・型は不変)
- contract test / PBT (`test_score_consistency.py`) を Yes-ratio に更新

### 2. ScoreResponse.history フィールド追加 (`2400f45`、2026-05-17)

INCEPTION drawio screen-04 (Score Dashboard) で 30 日 trend line chart を表示するため、scorer に history 構築機能を追加:

- **`domain/decision/scorer.py`**: `_build_history(now: datetime) -> list[ScoreHistoryPoint]` メソッドを新規実装
  - 過去 30 日 × 1 日刻みで累積 Yes-ratio を計算
  - 各 point は `{date: date, ratio: float}` の 2 フィールド
- **`interface/http/dto/decision.py`**: `ScoreResponse.history: list[ScoreHistoryPoint]` フィールドを追加
- **`interface/http/scores.py`**: scorer から history を取得しレスポンスに含める

### 3. Dynamic Persona Routing (`07c1c78`、Closes #4、2026-05-19)

Cold-start でない user で `selected_ids` が空かつ `UserPersonaSelection` も未設定の場合、嗜好プロファイルから top-3 builtin persona を自動推奨する機能:

- **`domain/decision/engine.py`** の `_resolve_personas` を拡張:
  1. user の `selected_ids` 引数を確認 (明示選択優先)
  2. `UserPersonaSelectionRepository` で per-user selection を確認 (永続選択優先)
  3. 両方なしの場合、`PreferenceProfileRepository` から `persona_style_preference` を取得
  4. `persona_style_preference` スコア降順で builtin personas を sort、top-3 を返却
  5. Cold-start (PreferenceProfile が空 = 学習履歴なし) は従来通り builtin 全 4 件を返却
- **`interface/deps.py`**: DecisionEngine factory に `preference_repo` を inject (新 DI 依存)
- **`domain/decision/engine.py`** signature 変更:
  - `__init__(self, ..., preference_repo: PreferenceProfileRepository)` を追加 (keyword-only)
  - 既存 caller (test fixtures 含む) は本コミットで同時更新

**影響範囲**:
- API surface 不変 (`POST /v1/decisions/request` の input/output は同じ、内部の persona resolution のみ変更)
- contract test: DecisionEngine の Protocol が拡張されたため fixtures patch が必要 (本コミットで適用済)

### NFR / Infrastructure / Code Gen への波及
- NFR Requirements / NFR Design / Infrastructure Design は本体不変、本注記が記述根拠
- code-generation-plan.md の Phase F (DecisionEngine + Scorer) は実装結果として更新済
