# U4 / decision — NFR Requirements

**Unit**: U4 / decision
**Phase**: CONSTRUCTION — NFR Requirements
**Created**: 2026-05-16
**Status**: 🟡 IN REVIEW
**Upstream**: U4 Functional Design (approved + 13 ultrathink fixes)

---

## 0. 位置付け

U4 FD で確定した 7 サービス (SilenceGuard / LLMProviderAdapter / ConsensusOrchestrator / DecisionEngine / DiscussionStreamer / NudgeMessageGenerator / EventPublisher) に対する非機能要件を確定する。FD §11 の引き継ぎ事項を ID 付きで具体化。

### 上位 NFR との対応
| 上位 NFR | U4 担当範囲 |
|---|---|
| NFR-PERF-01 | 合議レイテンシ p95 SLA |
| NFR-PERF-02 | Nudge 非同期生成 (= 採択 API レイテンシに影響しない) |
| NFR-SEC-04 | TLS / KMS は U1/U2 既存、U4 は転送時暗号 |
| NFR-SEC-05 | LLM 送信前 PII フィルタ |
| NFR-SEC-06 | LLM API キーは Secrets Manager 経由 |
| NFR-PRIV-04 | 沈黙演出ガード二重化 + SilenceLog 本文非保存 |
| NFR-EXT-02 | LLM プロバイダー Strategy 切替 |
| NFR-AVAIL-03 | LLM 障害時のフォールバック |
| NFR-I18N | 日本語のみ (MVP)、テンプレ文字列は外部化可能 |

---

## 1. 性能要件 (PERF)

| ID | 要件 | 計測方法 |
|---|---|---|
| **PERF-U4-01** | 非ストリーミング合議 (`POST /v1/decisions/request`) p95 < **5 秒** (Bedrock + Claude 3 Haiku、3 ペルソナ) — **ハッカソンデモ目標値**。本番運用前に Bedrock 実測値で再調整。**p99 < 10 秒** をハード上限 (超過時は alarm)。ultrathink I3 反映 2026-05-16 | uvicorn access log + structured `decision.latency_ms` |
| **PERF-U4-02** | SSE 合議 (`POST /v1/decisions/request/stream`) の **初 chunk** p95 < **1.5 秒** | `sse.first_chunk_latency_ms` メトリクス |
| **PERF-U4-03** | SSE 合議の **全 chunk 完了** p95 < **120 秒** (ALB Idle Timeout 整合) | `sse.total_latency_ms` |
| **PERF-U4-04** | Yes/No 採択 API (`POST /v1/decisions/{id}/choice`) レイテンシ p95 < **300ms** (LLM 呼ばない、Nudge は非同期)。**内訳**: DB write (50ms) + EventBridge publish 同期 (100ms) + BackgroundTasks 起動 (10ms) + JSON serialize (10ms) ≈ 170ms (余裕 130ms)。レイテンシ問題時は `EVENT_BACKEND` を `inline-async` (BackgroundTasks 経由 EventBridge) に切替可能 (ultrathink Imp1 反映 2026-05-16) | uvicorn access log |
| **PERF-U4-05** | Nudge polling (`GET /v1/decisions/{id}/nudge`) レイテンシ p95 < **200ms** (in-memory cache hit)。**TTL 切れ** (`NUDGE_CACHE_TTL_SECONDS=600` 経過後) は **410 Gone** 返却、FE は 410 受領時に再発火しない (ultrathink Imp3 反映 2026-05-16) | 同上 |
| **PERF-U4-06** | Nudge 生成 (BackgroundTasks 内) は **5 秒以内に完了** (生成が遅いと FE 側 polling が無駄打ち) | `nudge.generation_ms` |
| **PERF-U4-07** | AutonomyScorer (`GET /v1/scores/me`) レイテンシ p95 < **100ms** (U2 Repository ヒット時) | uvicorn access log |
| **PERF-U4-08** | LLMProviderAdapter / EventPublisher / NudgeMessageGenerator は **プロセスワイド singleton** (lifespan で 1 回生成、リクエストごとの生成禁止) | コード review |
| **PERF-U4-09** | プロンプト構築 (ConsensusOrchestrator.build_prompt) のローカル処理 < **20ms** (LLM 呼び出し前の前処理) | unit test 計測 |

---

## 2. セキュリティ要件 (SEC)

| ID | 要件 |
|---|---|
| **SEC-U4-01** | **PII フィルタ** (NFR-SEC-05 対応): `apps/api/src/yesman_api/shared/pii_filter.py` の `mask_pii(text)` を **LLM 送信前**に DecisionEngine と NudgeMessageGenerator 両方で適用。マスク対象: email / 電話番号 (日本/米国フォーマット) / クレジットカード番号 (Luhn なし regex) / 住所番地 (オプション) |
| **SEC-U4-02** | SilenceLog の `user_input` 本文は **保存しない** (`user_input_hash` のみ、U2 既存設計、NFR-PRIV-04) |
| **SEC-U4-03** | SilenceLog の `user_input_hash` 計算: `sha256(salt + user_id + user_input).hexdigest()` (salt は process-wide 固定 + 環境変数 `SILENCE_HASH_SALT`、prod では **Secrets Manager 経由で ECS Task に注入** (環境変数直書き禁止、ultrathink Imp2 反映 2026-05-16)。dev/ci では `.env` 直書き OK |
| **SEC-U4-04** | LLM API キー (Bedrock 以外のプロバイダーが将来加わる場合) は **Secrets Manager 経由**、環境変数に直接書かない (NFR-SEC-06) |
| **SEC-U4-05** | Bedrock 呼び出し時は **IAM Role 認証** (U1 で `bedrockAccessPolicy` 付与済)、ハードコードキー不要 |
| **SEC-U4-06** | **沈黙演出ガード二重化** (NFR-PRIV-04): (a) SilenceGuard 内の正規表現 + LLM 自己判定、(b) `config.app_env == "prod"` 時のみ追加で Bedrock Guardrails を LLMProviderAdapter 内で適用 |
| **SEC-U4-07** | Bedrock Guardrails の `guardrailId` は U1 AI Stack で常に生成され ApiStack に **CFN Cross-Stack Reference で注入**、環境変数 `BEDROCK_GUARDRAIL_ID` には常に値が存在。**Mock LLM Provider** は Guardrails 呼び出しを adapter 内ロジックで skip (env 値の有無ではなく adapter で判断)。ultrathink I7 反映 2026-05-16 |
| **SEC-U4-08** | DecisionEngine / DiscussionStreamer は `request.state.user.sub` を user_id として使い、**cross-user データアクセスを構造的に防ぐ** (FR-CV-11 / U2 SEC-U2-06 整合) |
| **SEC-U4-09** | Yes/No choice API の `decision_id` パスパラメータは **所有者検証**: `DecisionRepository.get(decision_id)` → `.user_id == request.state.user.sub` でなければ 404 (= leak 防止) |
| **SEC-U4-10** | EventBridge `DecisionConfirmed` の Detail には **本文を含めない** (sub / decision_id / choice / domain / timestamp のみ)、PII リークを構造的に防ぐ |
| **SEC-U4-11** | Mock LLM Provider は **`APP_ENV in {dev, ci}` 限定** (U3 SEC-U3-11 と同パターン)、prod/stg では `config.validate_runtime` で起動拒否 |
| **SEC-U4-12** | プロンプトインジェクション緩和: user_input の前後に **区切りトークン** (例: `<user_input>...</user_input>`) を入れ、システム指示と混同しない構造に。完全防御ではないが緩和層 |

---

## 3. 拡張性要件 (EXT)

| ID | 要件 |
|---|---|
| **EXT-U4-01** | LLMProviderAdapter Protocol は `complete` + `stream` + `aclose` の 3 メソッド固定。追加プロバイダー (OpenAI / Anthropic API / Google / CLI 系) は Protocol 実装のみで差し替え可能 (FR-AI-01〜03) |
| **EXT-U4-02** | EventPublisher Protocol は `publish_decision_confirmed` + `aclose` の 2 メソッド固定。3 backend (eventbridge / inline-async / sync) を環境変数 `EVENT_BACKEND` で切替 |
| **EXT-U4-03** | LLM provider 選択は `LLM_PROVIDER` 環境変数 (`bedrock` / `mock` / 将来 `openai` / `anthropic` 等) で完結 (FR-AI-02) |
| **EXT-U4-04** | ConsensusOrchestrator のペルソナ数は **2-N 個動的対応** (FR-PERSONA-03 整合)、プロンプトテンプレに hard-code しない |
| **EXT-U4-05** | プロンプトテンプレ (ConsensusOrchestrator.PROMPT_TEMPLATE) は **クラス変数として定数化**、将来 i18n 対応で外部リソース化可能な構造 (MVP では日本語ハードコード) |

---

## 4. 可用性 / 障害耐性 (AVAIL)

| ID | 要件 |
|---|---|
| **AVAIL-U4-01** | `LLMProviderAdapter.complete` タイムアウト = **30 秒**、`httpx.Timeout(connect=5, read=25, write=2, pool=5)` 相当 (LiteLLM 経由でタイムアウト渡し) |
| **AVAIL-U4-02** | `LLMProviderAdapter.stream` タイムアウト: **初 chunk 5 秒以内 / 全 chunk 完了 120 秒以内** (ALB Idle Timeout と整合)、超過時は client 切断 + background 永続化で degraded 完了 |
| **AVAIL-U4-03** | LLM 失敗時のリトライ: **complete は 1 回 retry** (200ms backoff)、**stream は retry なし** (中途半端な chunk 配信を避ける、即座にエラーイベント `event: error` 配信) |
| **AVAIL-U4-04** | LLM 完全失敗時のフォールバック (NFR-AVAIL-03): (a) 沈黙レスポンス (`event: silence`) を配信、(b) Mock LLM への自動切替は **しない** (本番で fake 出力するのは UX 上問題) |
| **AVAIL-U4-05** | DecisionRepository / SilenceLogRepository / PersonaRepository への DB エラー時は **HTTPException 503**、500 を返さない |
| **AVAIL-U4-06** | EventBridge publish 失敗時は **CloudWatch ERROR ログ + 採択 API 自体は成功で返却** (= イベント発火失敗で UX を壊さない、U5 側で eventual 整合) |
| **AVAIL-U4-07** | SSE クライアント切断時 (`asyncio.CancelledError` 検出): 進行中の LLM ストリーム読み取りを継続 + ConsensusOutput 組み立て + `DecisionRepository.insert` を `asyncio.create_task` で **best-effort background 永続化** (FR-CV-09)。**process が生存する限り完遂を試みる**、ECS タスク終了 / プロセスクラッシュ時の保証はない (U-Test 段階で SQS DLQ 等の別パターンで補完検討)。ultrathink I4 反映 2026-05-16 |
| **AVAIL-U4-08** | Nudge 生成失敗時 (LLM error): polling endpoint が `{"status": "failed", "message": "再考の余地がありますね"}` 固定 fallback メッセージ返却。FE は ML テキストとして表示 |
| **AVAIL-U4-09** | LLMProviderAdapter / EventPublisher の初期化失敗 (config 不正) は **lifespan startup で fail-fast** (= ECS タスク起動失敗、U3 AVAIL-U3-03 と同パターン)。`validate_runtime` 拡張: (a) `LLM_PROVIDER=mock` かつ `APP_ENV in {stg, prod}` → 起動拒否、(b) **`APP_ENV=prod` かつ `SILENCE_HASH_SALT` 空文字 → 起動拒否** (ultrathink I1 反映 2026-05-16)、(c) `EVENT_BACKEND=eventbridge` かつ `EVENT_BUS_NAME` 空文字 → 起動拒否 |

---

## 5. テスト要件 (TEST)

| ID | 要件 |
|---|---|
| **TEST-U4-01** | Contract test: BedrockAuthAdapter / MockLLMProvider が同一 `LLMProviderAdapter` Protocol を `@runtime_checkable` + `isinstance()` で適合検証 (U3 採用済パターン) |
| **TEST-U4-02** | Contract test: EventBridgePublisher / InlineAsyncPublisher / SyncPublisher が同一 `EventPublisher` Protocol を適合検証 |
| **TEST-U4-03** | PBT: ConsensusOrchestrator.parse(任意文字列) → 必ず `ConsensusOutput` (proposal 抽出成功) or 部分抽出 (utterances=[]) で完了、プロセスクラッシュなし。Hypothesis `max_examples=100` |
| **TEST-U4-04a** | PBT (入力ロバストネス): SilenceGuard.evaluate(**任意 user_input**) → 必ず `SilenceVerdict(is_silenced: bool)` 返却、例外なし。`max_examples=100`。ultrathink I6 反映 |
| **TEST-U4-04b** | PBT (LLM 出力ロバストネス): Mock LLM が **任意の文字列 / 空 / バイナリ風応答** を返した時も SilenceGuard が `SilenceVerdict` 返却、例外なし。`max_examples=100`。ultrathink I6 反映 |
| **TEST-U4-05** | PBT + Unit: ConsensusOrchestrator.build_prompt(任意 profile + 任意 user_input + builtin personas) → **通常時** プロンプト < 100,000 文字 / **異常入力** (100k 文字超 user_input) は API 入口で **HTTPException 413 Payload Too Large** を返し reject。ultrathink I2 反映 2026-05-16 |
| **TEST-U4-06** | Unit: DecisionEngine の沈黙パス / 通常パス / No 再合議パス (`no_attempt_count` 計算が既存 +1 になっていることを assertion) |
| **TEST-U4-07** | Integration: Mock LLM + Mock Repo で E2E (`POST /request` → `POST /{id}/choice yes` → `GET /scores/me`) を一気通貫 |
| **TEST-U4-08** | Integration: SSE chunk 順序検証 (`start → domain → utterance × N → proposal → complete` の順) + `start` event で decision_id が事前確定していることを assertion |
| **TEST-U4-09** | Integration: SSE 切断シミュレーション (client side で connection close) → 後で `DecisionRepository.get(decision_id)` で永続化が完了していることを assertion (FR-CV-09) |
| **TEST-U4-10** | Unit: NudgeMessageGenerator の Yes / No streak 1/2/3 / no_attempt_count 取得パターンの 4 ケース、PII マスクが適用されていること |
| **TEST-U4-11** | Unit: AutonomyScorer の total=0 / no_count=0 / 通常パス / pending 除外の 4 ケース |
| **TEST-U4-12** | Unit: EventPublisher 3 backend (eventbridge / inline-async / sync) が同一インターフェースで動作、Yes/No 両方発火 |
| **TEST-U4-13** | Unit: PII フィルタ (`shared/pii_filter.py`) — email / phone / credit card 各 3 サンプル、マスク後の出力に PII が残っていないことを正規表現で再検証 |
| **TEST-U4-14** | Unit: LLM timeout エッジケース (ultrathink Imp4 反映 2026-05-16) — `tests/unit/decision/test_llm_timeout.py`: (a) complete timeout → `DecisionError("llm_timeout")` → HTTPException 503、(b) stream initial timeout (5s 超) → `event: error reason=llm_initial_timeout` 配信後 close、(c) stream total timeout (120s 超) → 中間段階で best-effort 永続化 + close |

---

## 6. 環境変数 (U4 新規) — ultrathink I5 + Imp5 反映: Type 列追加 + Claude region 注記

| 環境変数 | デフォルト | 必須 | Type | 説明 |
|---|---|---|---|---|
| `LLM_PROVIDER` | `mock` | - | plain | `bedrock` / `mock` (将来: `openai` / `anthropic` / `cli`) (U2 で AppConfig に追加済) |
| `EVENT_BACKEND` | `sync` | - | plain | `eventbridge` / `inline-async` / `sync` (U2 既存) |
| `BEDROCK_REGION` | `ap-northeast-1` | LLM_PROVIDER=bedrock 時 | plain | **Claude 3 Haiku は ap-northeast-1 で 2024 後半から利用可**、それ以外のモデル / リージョンでは `BEDROCK_MODEL_ID` と組み合わせて要確認 (ultrathink I5) |
| `BEDROCK_MODEL_ID` | `anthropic.claude-3-haiku-20240307-v1:0` | - | plain | LiteLLM model identifier |
| `BEDROCK_GUARDRAIL_ID` | `` | - | plain | U1 AI Stack Output (CFN Cross-Stack で常に注入)、Mock backend で adapter 内 skip |
| `BEDROCK_GUARDRAIL_VERSION` | `DRAFT` | - | plain | Guardrails のバージョン |
| `DECISION_LLM_TIMEOUT_SECONDS` | `30.0` | - | plain | complete 用 |
| `DECISION_LLM_STREAM_INITIAL_TIMEOUT_SECONDS` | `5.0` | - | plain | stream 用 (初 chunk) |
| `DECISION_LLM_STREAM_TOTAL_TIMEOUT_SECONDS` | `120.0` | - | plain | stream 用 (全完了) |
| `DECISION_LLM_RETRY_COUNT` | `1` | - | plain | complete の retry 回数 (stream は固定 0) |
| `NUDGE_GENERATION_ENABLED` | `true` | - | plain | false で固定文 fallback (Mock backend で false 推奨) |
| `NUDGE_CACHE_TTL_SECONDS` | `600.0` | - | plain | in-memory cache TTL |
| `EVENT_BUS_NAME` | `` | EVENT_BACKEND=eventbridge 時必須 | plain | U1 ApiStack Output 由来 |
| `SILENCE_HASH_SALT` | `` | prod 時必須 | **secret** | prod では Secrets Manager 経由で ECS Task に注入 (`ecs.Secret.fromSecretsManager` パターン)、dev では .env 直書き OK |

**Type 列の凡例** (ultrathink Imp5 反映):
- `plain`: ECS Task の `environment` ブロックに直書き OK (機微情報なし)
- `secret`: ECS Task の `secrets` ブロックで Secrets Manager から注入 (=`environment` 直書き禁止)

---

## 7. 引き継ぎ (NFR Design / Infrastructure Design)

### NFR Design で確定する事項
- **LiteLLM 統合パターン**: `litellm.acompletion(...)` の呼び出し方、AWS Bedrock provider 設定、stream=True 時の async iterator パターン
- **httpx 不要** (LiteLLM 内部で boto3/aiohttp 経由) — U3 と異なる依存ツリー
- **EventBridge publish 実装**: `boto3.client("events").put_events` の async wrapper (botocore は同期、`asyncio.to_thread` で呼ぶ or aioboto3)
- **SSE StreamingResponse**: FastAPI `StreamingResponse(generator, media_type="text/event-stream")` + `asyncio.create_task` で切断耐性
- **Nudge in-memory cache**: `dict[decision_id, tuple[str, float]]` (sub-scope 不要、decision_id 自体が user 紐付けで権限管理) + asyncio.Lock per-decision
- **PII フィルタ正規表現**: email (RFC5322 簡略版) / 日本電話 / 米国電話 / Luhn なし CC / オプション住所
- **SilenceGuard 正規表現キーワードリスト**: 宗教 (神/仏/宗教団体名) / 選挙 (投票/政党/選挙) / 暴力 (殺す/暴力) / 卑猥 (NSFW キーワード) — 各 10-20 語、日本語ベース

### Infrastructure Design で確定する事項
- **ディレクトリ構造**:
  - `domain/decision/` (silence_guard / consensus_orchestrator / engine / scorer / nudge / models)
  - `domain/persistence/constants.py` (新規、SYSTEM_USER_ID 定数)
  - `application/decision/` (llm_provider Protocol / event_publisher Protocol)
  - `infrastructure/decision/llm_providers/` (bedrock_adapter / mock_adapter / factory)
  - `infrastructure/decision/event_publishers/` (eventbridge / inline_async / sync / factory)
  - `interface/http/decisions.py` (4 endpoint + SSE)
  - `interface/http/scores.py` (GET /v1/scores/me)
  - `interface/http/dto/decision.py` (DecisionRequest DTO / DecisionResponse / NudgeResponse / ScoreResponse)
  - `shared/pii_filter.py` (新規)
- **U2 への遡及修正**: `domain/persistence/constants.py` の SYSTEM_USER_ID 定数化 (既存 Alembic 0002 への変更は不要、値の一致のみ)
- **U2 への遡及確認**: `DecisionRepository.count_no_by_user` の SQL 実装が pending を除外しているか、`MockProfileRepository` も同様か (Imp5 関連)
- **U1 ApiStack 環境変数追加**: BEDROCK_MODEL_ID / BEDROCK_GUARDRAIL_ID (本番) / SILENCE_HASH_SALT (Secrets Manager) / DECISION_LLM_TIMEOUT_* / NUDGE_*
- **pyproject.toml**: `litellm>=1.50,<2.0` + 既存 `boto3` / `httpx` (U3 で追加済) を利用
- **`shared/pii_filter.py` のテスト**: `tests/unit/shared/test_pii_filter.py` を新設 (TEST-U4-13)

---

## 8. 承認チェックリスト

- [x] PERF-U4 (合議 p95<5s **+ p99<10s ハード上限** / SSE 初 chunk<1.5s / 全 120s / **採択 300ms 内訳 + EventBridge 切替案** / **Nudge polling 200ms + TTL 切れ 410 Gone** / Score 100ms / singleton + プロンプト構築 20ms)
- [x] SEC-U4 (PII フィルタ shared helper / **SilenceLog hash + SILENCE_HASH_SALT (prod Secrets Manager)** / IAM Role / **Bedrock Guardrails Cross-Stack 常時注入 + Mock adapter 内 skip** / cross-user 構造防御 / 所有者検証 / Event Detail 本文非含 / Mock dev/ci 限定 / プロンプトインジェクション区切り)
- [x] EXT-U4 (LLMProvider/EventPublisher Protocol 固定 / 環境変数で切替 / persona 数 2-N / プロンプト定数化)
- [x] AVAIL-U4 (LLM timeout 2 段 / retry complete 1 stream 0 / フォールバック沈黙 + Mock 自動切替なし / DB エラー 503 / EventBridge 失敗で API 成功 / **SSE 切断 best-effort background 永続化** / Nudge 失敗 fallback / **lifespan fail-fast に SILENCE_HASH_SALT prod 必須追加**)
- [x] TEST-U4 (Contract 2 + **PBT 4 (parser + silence input + silence LLM output + prompt size)** + Unit 9 (+ LLM timeout) + Integration 3 = 18)
- [x] 環境変数 (14 個 + **Type 列 (plain/secret) 分類** + Claude 3 Haiku ap-northeast-1 注記)
- [x] NFR Design / Infra Design への引き継ぎ事項 (LiteLLM 統合 / SSE / Nudge cache / PII regex / SilenceGuard キーワード / U2 遡及確認)

### ultrathink レビュー (2026-05-16) 反映済 12 件
- **Important 7**:
  - I1 SILENCE_HASH_SALT prod 必須を AVAIL-U4-09 validate_runtime に追加
  - I2 TEST-U4-05 を「異常入力 100k 文字超は HTTPException 413」に明確化
  - I3 PERF-U4-01 デモ目標 + p99<10s ハード上限を併記
  - I4 AVAIL-U4-07 best-effort background 永続化を明示
  - I5 BEDROCK_REGION Claude 3 Haiku 利用可注記
  - I6 TEST-U4-04 を 4a (入力) + 4b (LLM 出力) に分離
  - I7 SEC-U4-07 BEDROCK_GUARDRAIL_ID Cross-Stack 常時注入 + Mock adapter 内 skip 整理
- **Improvements 5**:
  - Imp1 PERF-U4-04 採択 API レイテンシ内訳 + EventBridge sync/async 切替案
  - Imp2 SEC-U4-03 SILENCE_HASH_SALT prod Secrets Manager 経由
  - Imp3 PERF-U4-05 Nudge cache TTL 切れ 410 Gone
  - Imp4 TEST-U4-14 LLM timeout エッジケース 3 サブテスト
  - Imp5 §6 環境変数表に Type 列 (plain/secret) 追加

---

## Post-CONSTRUCTION 改修注記 (2026-05-17 〜 2026-05-19)

本ドキュメント本体は 2026-05-16 承認時の Snapshot (ultrathink full 12 fixes 適用済) を保持。

**Important 7 / Improvements 5 の合計 12 件の NFR 修正点は全て継続有効**。Post-CONSTRUCTION で追加された機能は既存 NFR の枠内:

### 影響評価
- **Yes-ratio 反転** (`317280b`): scorer の計算式変更のみ、PERF (`POST /v1/scores/me` < 200ms p95) には影響なし。
- **`_build_history` + `ScoreResponse.history`** (`2400f45`): 30日 × `O(1)` 集計、p95 latency への影響は実測で +5ms 未満を想定。
- **Dynamic Persona Routing** (`07c1c78`): `_resolve_personas` 内で `PreferenceProfileRepository.get_by_user` を 1 回追加読み (per request)、cache 効果込みで PERF への影響軽微。

### 新規 NFR は追加なし
- prefetch buffer (`usePrefetchedDecisions`) は U7d frontend 担当、U4 NFR には影響なし。
- decision SSE の throughput / SilenceGuard latency 目標値は不変。

→ U4 NFR Req は CONSTRUCTION 完了状態を維持しつつ、Dynamic Persona Routing による追加コストを許容範囲内で吸収。
