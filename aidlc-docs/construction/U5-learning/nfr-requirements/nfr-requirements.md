# U5 / learning — NFR Requirements

**Unit**: U5 / learning
**Phase**: CONSTRUCTION — NFR Requirements
**Created**: 2026-05-16
**Status**: 🟡 IN REVIEW
**Upstream**: U5 FD (approved + 10 ultrathink fixes)

---

## 0. 位置付け

U5 FD §8 引き継ぎを ID 付きで具体化。U2-U4 で確立した PERF/SEC/EXT/AVAIL/TEST 5 軸 + 環境変数を踏襲。

| 上位 NFR | U5 担当範囲 |
|---|---|
| NFR-PERF-02 | 嗜好プロファイル更新は非同期 (= 提案レイテンシ非ブロッキング) |
| NFR-SEC-04 | preference_profiles は Aurora KMS 暗号化 (U1 既存) |
| NFR-SEC-05 | LLM 送信前 PII 除去 (Loader が YAML format 生成時に適用) |
| NFR-PRIV-04 | preference_profile 自体は user_id 紐付け、cross-user 構造防御 |
| NFR-EXT-02 | EVENT_BACKEND Strategy (eventbridge / inline-async / sync) |
| NFR-AVAIL | SQS Consumer 失敗時のリトライ + DLQ + supervisor 再起動 |

---

## 1. 性能要件 (PERF)

| ID | 要件 | 計測方法 |
|---|---|---|
| **PERF-U5-01** | SQS Consumer の単一 message 処理レイテンシ p95 < **100ms** (Aurora upsert + builder ロジック) | CloudWatch metric `learning.consumer.process_ms` |
| **PERF-U5-02** | SQS `receive_messages` の `WaitTimeSeconds=5` (ultrathink I5、shutdown 検知最大 5s) | コード review |
| **PERF-U5-03** | `MaxNumberOfMessages=10` (1 回の poll で最大 10 件取得、Aurora 接続効率化) | コード review |
| **PERF-U5-04** | `PreferenceProfileLoader.load_for_prompt` レイテンシ p95: **通常パス (履歴あり) < 50ms** / **ColdStart パス (初回ユーザー、upsert 込み) < 100ms** (ultrathink I2 反映)。Aurora 1 回 SELECT + format vs SELECT+ColdStart+UPSERT | uvicorn access log + `loader.load_ms` |
| **PERF-U5-05** | Preference API (GET/PATCH/DELETE `/v1/preferences/me`) p95 < **100ms** (Aurora 1-2 回操作) | uvicorn access log |
| **PERF-U5-06** | Consumer + Loader + Estimator は **プロセスワイド singleton** (lifespan で生成、リクエストごと生成禁止) | コード review |
| **PERF-U5-07** | `accepted_patterns` / `rejected_patterns` 上限 100 件、`persona_style_preference` 50 key、`inferred_tags` 50 件で **dict/list が肥大化しない** | builder 内部の slice/cap |
| **PERF-U5-08** | Loader YAML 出力サイズ < **2KB** (recent_accepted/rejected 最新 5 件まで、persona_style top 5 のみ)。加えて **LLM プロンプト全体** (system + profile_yaml + preference_yaml + user_input) を **5KB 以下** に収める (ultrathink Imp2 反映、Bedrock Haiku context window への配慮) | unit test 計測 |

---

## 2. セキュリティ要件 (SEC)

| ID | 要件 |
|---|---|
| **SEC-U5-01** | Loader が YAML format 生成時、**ユーザー入力由来テキスト (keywords / proposal 抜粋等)** に対し `mask_pii` を適用 (NFR-SEC-05)。MVP では keywords が空 list のため適用箇所は inferred_tags + future 拡張点 |
| **SEC-U5-02** | preference_profiles テーブルは **U1 既存の Aurora KMS 暗号化** で保存時暗号化済 (NFR-SEC-04) |
| **SEC-U5-03** | Consumer / Loader / API 全てで **user_id ベースの cross-user 構造防御** (NFR-PRIV-04、U2 SEC-U2-06 整合): preference_repo.get / upsert は user_id 必須 |
| **SEC-U5-04** | Preference API は `request.state.user.sub` を user_id として強制使用、URL パスに user_id を含めない (`/v1/preferences/me` 形式で leak 防止) |
| **SEC-U5-05** | Consumer の SQS receive は **IAM Role 認証** (U1 で `sqs:ReceiveMessage` `sqs:DeleteMessage` 権限が `decisionEventsQueue.queueArn` に限定で付与済を前提) |
| **SEC-U5-06** | PATCH /v1/preferences/me の入力上限 (DTO バリデーション、ultrathink Imp2/Imp3): accepted/rejected_patterns ≤ 100 件、persona_style_preference 50 key + 値 [-1.0, 1.0] clip、inferred_tags ≤ 50 件 |
| **SEC-U5-07** | DELETE /v1/preferences/me は **ColdStart 再推定で再初期化** (ultrathink Imp4)、完全削除ではないため SEC レビュー上は「リセット = 初期状態への戻し」と解釈、FR-LEARN-04 と整合 |
| **SEC-U5-08** | DecisionConfirmedPayload の parse 失敗時 (= 不正な SQS message): **delete_message しない + WARN log** (= visibility timeout 後に再配送、最終的に **SQS redrive policy** で DLQ 移動)。ultrathink I3 反映 2026-05-16 — delete すると DLQ に触れず poison message が消失するため、SQS の `maxReceiveCount=3` redrive policy 経由で DLQ 自動配送に統一 |

---

## 3. 拡張性要件 (EXT)

| ID | 要件 |
|---|---|
| **EXT-U5-01** | ColdStartEstimator の推定ルールは **クラス内定数化** (将来 ML モデル差替え可能、interface 維持) |
| **EXT-U5-02** | PreferenceProfileBuilder の `apply_yes` / `apply_no` は純粋関数として実装、副作用は呼び出し側で持つ (テスタビリティ向上) |
| **EXT-U5-03** | Consumer の起動条件は **`LEARNING_CONSUMER_ENABLED=true` AND `EVENT_BACKEND=eventbridge` の AND 論理** (ultrathink I4 反映 2026-05-16)。Mock backend (`EVENT_BACKEND=sync`) では `LEARNING_CONSUMER_ENABLED` の値に関わらず consumer を起動しない (= SQS URL なし、起動失敗を防ぐ)。inline-async / sync では起動なし |
| **EXT-U5-04** | `keywords` 抽出は MVP 空 list だが、将来 `_extract_keywords` 関数の signature 維持で `janome` / LLM ベースに差替え可能 |
| **EXT-U5-05** | YAML format の Schema は internal、変更時は U4 DecisionEngine 側の prompt template も同時更新 (Code Gen Phase で 2 ファイル PR 集約) |

---

## 4. 可用性 / 障害耐性 (AVAIL)

| ID | 要件 |
|---|---|
| **AVAIL-U5-01** | SQS receive_messages 失敗時 (network error 等): **30 秒 sleep + 再 receive** (= long polling + retry のループ継続) |
| **AVAIL-U5-02** | Aurora 一時的エラー時の message: delete_message しない → SQS visibility timeout (default 60s) 後に再配送 (= retry-as-redelivery) |
| **AVAIL-U5-03** | 致命的エラー (Config 不正 / IAM 権限なし 等) は **lifespan startup で fail-fast** (U3 AVAIL-U3-03 と同パターン) |
| **AVAIL-U5-04** | DecisionConfirmedPayload parse 失敗 (malformed JSON / 必須 key 不足): **delete しない + WARN log** (= SQS visibility timeout 後に再配送、`maxReceiveCount=3` 到達後に redrive policy で DLQ 自動移動)。ultrathink I3 反映 |
| **AVAIL-U5-05** | Consumer が `decision_repo.get(decision_id)` で None を返す場合 (整合性問題): **delete_message + WARN log** (retry しても解決しない、上流で発火されたが永続化前にクラッシュ等) |
| **AVAIL-U5-06** | Loader が `preference_repo.get(user_id)` で None かつ `profile_repo.get(user_id)` でも None: **ColdStart で空 inferred_tags の最小 profile** を生成 (= 例外を投げず、空 YAML を返す) |
| **AVAIL-U5-07** | Preference API の DB エラー: HTTPException 503 (`reason: storage_unavailable`)、500 を返さない (U3 AVAIL-U3-04 と同パターン) |
| **AVAIL-U5-08** | Consumer の **graceful shutdown** (`asyncio.Event` + `WaitTimeSeconds=5`): ECS Task SIGTERM 受領後、最大 5s で stop_event 検知、in-flight messages を処理完了してから close |
| **AVAIL-U5-09** | Consumer が予期せぬ例外でクラッシュした場合、**lifespan supervisor が再起動 (asyncio.Task wrap で例外捕捉 + exponential backoff: 60s → 120s → 300s で cap、上限なし永続継続)**。ultrathink I1 反映 — 「max 3 回」固定の永久停止リスクを排し、short-lived な network error でもサービス継続。crash loop 検知は CloudWatch alarm (`learning.consumer.restart_count` per 10 min) で別途実装 |

---

## 5. テスト要件 (TEST)

| ID | 要件 |
|---|---|
| **TEST-U5-01** | Unit: PreferenceProfileBuilder の apply_yes / apply_no / accepted_patterns 上限 100 / persona_style clip / inferred_tags 50 上限 / 50 key persona_style cap |
| **TEST-U5-02** | Unit: ColdStartEstimator の 4 推定ルール (年齢層 / 職業 / 価値観タグ / life_stage) × 各 2-3 ケース |
| **TEST-U5-03** | Unit: PreferenceProfileLoader の (a) 履歴あり通常パス、(b) 履歴なし → ColdStart fallback + upsert、(c) YAML format サイズ < 2KB |
| **TEST-U5-04** | Unit: SQS Consumer の parse 成功 / 不正 JSON / 必須 key 不足 / decision_id 不整合 / DB エラー retry の 5 ケース |
| **TEST-U5-05** | PBT: 任意の Decision 列 → builder.apply_*** を順次適用後、**5 不変条件** を Hypothesis で検証 (max_examples=100): (a) accepted_patterns ≤ 100、(b) rejected_patterns ≤ 100、(c) persona_style_preference 値 ∈ [-1.0, 1.0]、(d) persona_style_preference key ≤ 50、(e) inferred_tags ≤ 50、加えて **(f) last_updated_at が単調増加** (ultrathink Imp1 反映、regression 防止) |
| **TEST-U5-06** | Integration: Mock SQS + Mock Repo で full loop (DecisionConfirmed publish → Consumer 消費 → preference upsert 確認) |
| **TEST-U5-07** | Integration: Preference API の GET → PATCH (clip 強制) → DELETE → GET (ColdStart 再推定で空でない) の 4 ケース |
| **TEST-U5-08** | Contract: PreferenceProfileRepository は U2 既存 Protocol (`get` / `upsert` / `delete`) を変更なく利用 |

---

## 6. 環境変数 (U5 新規、ultrathink Imp3 反映: Type 列明示)

| 環境変数 | デフォルト | 必須 | Type | 説明 |
|---|---|---|---|---|
| `EVENT_BACKEND` | `sync` | - | plain | U2 既存、U5 で意味を持つ (`eventbridge` AND `LEARNING_CONSUMER_ENABLED=true` で起動) |
| `DECISION_EVENTS_QUEUE_URL` | `` | EVENT_BACKEND=eventbridge 時必須 | plain | U1 ApiStack Output 由来 (既存) |
| `LEARNING_CONSUMER_ENABLED` | `true` | - | plain | `false` で Consumer 抑止 (eventbridge 環境でも consumer 別 host に移したい時用) |
| `LEARNING_LONG_POLL_SECONDS` | `5` | - | plain | SQS `WaitTimeSeconds` (ultrathink FD I5、20→5 短縮) |
| `LEARNING_RETRY_SLEEP_SECONDS` | `30` | - | plain | AVAIL-U5-01 の error retry sleep |
| `LEARNING_SUPERVISOR_BACKOFF_MAX_SECONDS` | `300` | - | plain | AVAIL-U5-09 の exponential backoff cap (ultrathink I1 反映、`MAX_RESTARTS` 廃止) |

---

## 7. 引き継ぎ (NFR Design / Infrastructure Design)

### NFR Design で確定する事項
- **`PreferenceProfileBuilder` の純粋関数化**: `apply_yes(profile, decision) -> PreferenceProfile` で副作用なし (テスタビリティ + PBT)
- **YAML format の具体実装**: `yaml.safe_dump` を使うか手書きするか (依存追加 vs シンプル) — PyYAML は既存 (LiteLLM 経由で transitive、確認必要)
- **SQS Consumer の `asyncio.to_thread`**: boto3 同期呼び出しを async 化、`max_workers` 制御
- **Supervisor の実装**: `asyncio.create_task` でラップし、例外捕捉時に `asyncio.sleep(60)` → 再 spawn
- **PreferenceProfileLoader のキャッシュ**: per-request で都度 SELECT する設計、in-memory cache は U4 Nudge と分けて不採用 (MVP)
- **EVENT_BACKEND 別の起動制御**: `if config.event_backend == "eventbridge"` で consumer 起動、それ以外は no-op

### Infrastructure Design で確定する事項
- **ディレクトリ構造**:
  - `domain/learning/` (builder / cold_start / loader / models)
  - `application/learning/` (Protocol は不要、internal な PreferenceProfile 直接利用)
  - `infrastructure/learning/` (consumer / supervisor)
  - `interface/http/preferences.py` (3 endpoint)
  - `interface/http/dto/preference.py` (Request / Response)
- **U4 への遡及修正**: DecisionEngine コンストラクタ + `_format_profile_with_preferences` + `get_decision_engine` + main.py + test_engine.py = **5 ファイル変更** (FD I4 で確定)
- **U1 ApiStack 環境変数追加**: `LEARNING_CONSUMER_ENABLED` / `LEARNING_LONG_POLL_SECONDS` / `LEARNING_RETRY_SLEEP_SECONDS` / `LEARNING_SUPERVISOR_BACKOFF_MAX_SECONDS` (4 個、plain)。`DECISION_EVENTS_QUEUE_URL` は U1 既存
- **U1 SQS redrive policy 確認** (ultrathink I3 反映): `decisionEventsQueue` に `redrivePolicy` (`maxReceiveCount=3` + DLQ 紐付け) が設定済か確認、未設定なら U1 patch を Phase A の最初に追加 (DLQ Queue も新規作成 if needed)
- **IAM**: U1 で `sqs:ReceiveMessage` `sqs:DeleteMessage` `sqs:ChangeMessageVisibility` が `decisionEventsQueue.queueArn` に限定で付与済を確認、未付与なら追加
- **pyproject.toml**: PyYAML 確認 (= LiteLLM の transitive、明示的に追加するか) + `boto3` 既存

---

## 8. 承認チェックリスト

- [x] PERF-U5 (consumer 100ms / WaitTime 5s / MaxMessages 10 / **loader 通常 50ms + ColdStart 100ms 2 段** / API 100ms / singleton / 上限 100/50/50 / **YAML 2KB + プロンプト全体 5KB**)
- [x] SEC-U5 (PII 適用ポイント / KMS / cross-user / URL leak 防止 / IAM / PATCH 入力上限 / DELETE → ColdStart / **parse 失敗 delete しない + SQS redrive で DLQ**)
- [x] EXT-U5 (ColdStart 定数 / Builder 純粋関数 / **Consumer 起動 = `LEARNING_CONSUMER_ENABLED=true` AND `EVENT_BACKEND=eventbridge` の AND 論理** / keywords 差替え可能 / YAML schema 内部 U4 連動)
- [x] AVAIL-U5 (SQS retry 30s / DB エラー visibility 再配送 / parse 失敗 redrive policy 経由 DLQ / Loader fallback / DB → 503 / shutdown 5s / **supervisor exponential backoff cap 300s 永続継続**)
- [x] TEST-U5 (Unit 4 + **PBT 5 不変条件 + last_updated_at 単調増加** + Integration 2 + Contract 1)
- [x] 環境変数 (**6 個 + Type 列 (all plain)**: EVENT_BACKEND / DECISION_EVENTS_QUEUE_URL / LEARNING_CONSUMER_ENABLED / LEARNING_LONG_POLL_SECONDS / LEARNING_RETRY_SLEEP_SECONDS / **LEARNING_SUPERVISOR_BACKOFF_MAX_SECONDS** (旧 MAX_RESTARTS 廃止))
- [x] NFR Design / Infra Design への引き継ぎ事項 (PyYAML 確認 / consumer asyncio + exponential backoff / U4 遡及 5 ファイル / **SQS redrive policy 確認 → 未設定なら U1 patch**)

### ultrathink レビュー (2026-05-16) 反映済 7 件
- **Important 4**:
  - I1 supervisor を「max 3 回固定」→ **exponential backoff (60s→120s→300s cap、永続継続)** に変更、永久停止リスク排除
  - I2 Loader p95 を通常 50ms / ColdStart upsert 込み 100ms の 2 段に分離
  - I3 SQS parse 失敗を **delete しない + redrive policy 経由 DLQ** に変更 (delete だと poison が消失)
  - I4 Consumer 起動条件を **`LEARNING_CONSUMER_ENABLED` AND `EVENT_BACKEND=eventbridge`** の AND 論理に確定
- **Improvements 3**:
  - Imp1 PBT 5 番目の不変条件 `last_updated_at 単調増加` 追加
  - Imp2 YAML 2KB + プロンプト全体 5KB 上限を併記
  - Imp3 §6 Type 列 (all plain) 追加 + Infra Design 引き継ぎに **U1 SQS redrive policy 確認 + maxReceiveCount=3 + DLQ Queue** タスク追加

---

## Post-CONSTRUCTION 改修注記 (2026-05-19)

本ドキュメント本体は 2026-05-16 承認時の Snapshot (ultrathink full 7 fixes 適用済) を保持。

**Important 4 / Improvements 3 の合計 7 件の NFR 修正点は全て継続有効**。Post-CONSTRUCTION 期間中、U5 (learning) の SQS Consumer / ColdStart Loader / asyncio.timeout / 50 key 上限などの NFR 数値は不変。

### 軽微な波及
- **Dynamic Persona Routing が U5 学習結果を読む** (`07c1c78`): `PreferenceProfile.persona_style_preference` の **読み取り消費者が U4 に増える**ことになるが、U5 自身の書き込み path の NFR (apply_yes/no の同期処理 latency 目標) には影響なし。

→ U5 NFR Req は CONSTRUCTION 完了状態のまま継続有効。
