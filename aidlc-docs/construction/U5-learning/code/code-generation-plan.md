# U5 / learning — Code Generation Plan (Part 1)

**Unit**: U5 / learning
**Phase**: CONSTRUCTION — Code Generation Part 1 (Planning)
**Created**: 2026-05-16
**Status**: 🟡 IN REVIEW
**Upstream**: FD (10) + NFR Req (7) + NFR Design (6) + Infra Design (7) = 累計 30 fixes

---

## 0. 位置付け

Infra Design §9 確定の Phase A.0a / A.0b + A〜G を詳細チェックボックス + 完了基準 + 動作確認 + リスクに展開。U4 で確立した品質基準パターン継承。

---

## 1. 全体方針

### 1.1 ファイル集計

| カテゴリ | 数 |
|---|---|
| **新規 Python (本体)** | 10 (domain/learning 5 + infrastructure/learning 3 + interface 2) |
| **変更 Python (本体)** | 5 (config + deps + main + U4 engine + その他) |
| **U2 patch** | 0 (U5 では不要、U4 で実施済の count_no_by_user) |
| **U1 patch (条件付き)** | 0-2 (SQS redrive policy 未設定なら) |
| **新規テスト + fixture** | 9 (Unit 4 + Integration 2 + PBT 1 + init 2 + fixture 1) |
| **変更 テスト + fixture** | 2 (test_engine.py + fixtures/decision.py、U4 遡及) |
| **変更 ドキュメント / 設定** | 2 (`.env.example` + RUNBOOK §9) |
| **変更 CDK** | 1 (api-stack.ts) |
| **合計** | **約 28-30 ファイル** |

### 1.2 順序 (線形)
Phase A.0a → A.0b → B → C → D → E → F → G

### 1.3 品質基準
- AST parse OK
- import 解決
- U2-U4 既存テスト回帰なし
- U5 新規テスト pass
- ruff check 通過

---

## 2. Phase A.0a: U1 SQS redrive + IAM 確認 + 条件付き patch

- [ ] **A.0a.1** `grep -n "deadLetterQueue\|redrivePolicy\|maxReceiveCount" infra/lib/stacks/api-stack.ts` で SQS redrive 設定確認
- [ ] **A.0a.2** `grep -n "DECISION_EVENTS_QUEUE_URL\|decisionEventsQueue.queueUrl" infra/lib/stacks/api-stack.ts` で environment 確認
- [ ] **A.0a.3** `grep -n "sqs:ReceiveMessage\|sqs:DeleteMessage" infra/lib/stacks/api-stack.ts` で IAM 確認
- [ ] **A.0a.4** patch 適用判定:
  - SQS redrive 未設定 → DLQ + maxReceiveCount=3 を追加
  - DECISION_EVENTS_QUEUE_URL environment 未追加 → environment に追加
  - IAM 権限未付与 → `sqs:ReceiveMessage` + `sqs:DeleteMessage` のみ (`GetQueueAttributes` 不要、I3)
- [ ] **A.0a.5** `cdk synth` で破壊変更検出: `cd infra && cdk synth` → `Modify` のみで `Destroy` 含まれないこと確認
- [ ] **A.0a.6** snapshot 更新: `cd infra && pnpm test -- --updateSnapshot`

### 完了基準
- audit.md に確認結果 + patch 実施 / スキップを記録
- `cdk synth` 成功

---

## 3. Phase A.0b: U4 遡及修正 5 ファイル

- [ ] **A.0b.1** `tests/fixtures/decision.py` に **軽量 stub** `_StubPreferenceLoader` + `mock_preference_loader_factory()` 追加 (依存逆転防止、I2)
- [ ] **A.0b.2** `domain/decision/engine.py` 変更:
  - コンストラクタ引数 `preference_loader: "PreferenceProfileLoader"` 追加
  - `_format_profile_with_preferences(*, user_id, profile)` メソッド追加 (keyword-only)
  - `run` / `run_stream` 2 箇所で `_format_profile` → `_format_profile_with_preferences` 置換
- [ ] **A.0b.3** `interface/deps.py` 変更:
  - `get_preference_loader(request)` 新規追加
  - `get_decision_engine` 内で `preference_loader=Depends(get_preference_loader)` を inject
- [ ] **A.0b.4** `tests/unit/decision/test_engine.py` 変更:
  - `_make_engine` ヘルパーに `preference_loader=mock_preference_loader_factory()` 追加 (1 行)
- [ ] **A.0b.5** AST parse + 既存 U4 test 回帰なし確認

### 完了基準
- `python3 -m py_compile apps/api/src/yesman_api/domain/decision/engine.py` 等 5 ファイル OK
- U4 既存テスト (test_engine.py) が新 signature でも pass

---

## 4. Phase B: domain/learning (5 ファイル新規)

- [ ] **B.1** `domain/learning/__init__.py` (空)
- [ ] **B.2** `domain/learning/models.py` — `DecisionConfirmedPayload` (frozen dataclass) + `from_sqs_body(body)` classmethod (UUID/datetime 型変換、C1 反映)
- [ ] **B.3** `domain/learning/builder.py` — `apply_yes` / `apply_no` (純粋関数 + copy.deepcopy) + 定数 + `_build_pattern` + `_apply_persona_delta` (persona_names 一貫性、NFR Design I1)
- [ ] **B.4** `domain/learning/cold_start.py` — `ColdStartEstimator` + 3 定数マッピング (_AGE_GROUP_PERSONA_BIAS / _OCCUPATION_KEYWORDS_BIAS / _LIFE_STAGE_TAGS)
- [ ] **B.5** `domain/learning/loader.py` — `PreferenceProfileLoader` + `load` (ColdStart 一元発火 + upsert) + `load_for_prompt` + `_format_yaml` (json.dumps で names safe、Imp1)

### 完了基準
- AST parse OK (5 ファイル)
- import 確認: `python3 -c "from yesman_api.domain.learning.builder import apply_yes; from yesman_api.domain.learning.cold_start import ColdStartEstimator; from yesman_api.domain.learning.loader import PreferenceProfileLoader; from yesman_api.domain.learning.models import DecisionConfirmedPayload"`

---

## 5. Phase C: infrastructure/learning (3 ファイル新規)

- [ ] **C.1** `infrastructure/learning/__init__.py` (空)
- [ ] **C.2** `infrastructure/learning/consumer.py` — `DecisionConfirmedConsumer` (boto3.session.Session + asyncio.to_thread + parse 失敗 delete しない、I3 反映)
- [ ] **C.3** `infrastructure/learning/supervisor.py` — `ConsumerSupervisor` (`asyncio.timeout` + exponential backoff 60→120→240→300 cap、永続継続)

### 完了基準
- AST parse OK (3 ファイル)
- `DecisionConfirmedConsumer` / `ConsumerSupervisor` instantiate 確認

---

## 6. Phase D: interface (3 ファイル新規)

- [ ] **D.1** `interface/http/dto/preference.py` — `PreferenceProfileResponse` + `PreferenceProfileUpdateRequest` (上限 100/50/50 + 値範囲)
- [ ] **D.2** `interface/http/preferences.py` — 3 endpoint (GET/PATCH/DELETE `/v1/preferences/me`) + handler 内 `_clip_persona_style` (NFR Req Imp3)
- [ ] **D.3** `interface/deps.py` 既存変更を Phase A.0b で対応済、ここでは追加なし

### 完了基準
- AST parse OK (3 ファイル)
- preferences_router の 3 endpoint が登録される

---

## 7. Phase E: AppConfig + main.py 拡張

- [ ] **E.1** `infrastructure/config.py` 変更:
  - U5 環境変数 5 個追加 (`learning_consumer_enabled` / `learning_long_poll_seconds` / `learning_retry_sleep_seconds` / `learning_supervisor_backoff_max_seconds` / `decision_events_queue_url`)
  - `validate_runtime` に「eventbridge + consumer_enabled → QUEUE_URL 必須」追加
- [ ] **E.2** `main.py` 変更:
  - lifespan で `ColdStartEstimator()` + `PreferenceProfileLoader(...)` 初期化、`app.state.preference_loader` に格納
  - 条件付きで `DecisionConfirmedConsumer` + `ConsumerSupervisor` 起動 (`config.event_backend == "eventbridge"` AND `config.learning_consumer_enabled`)
  - shutdown で `supervisor.stop()`
  - `app.include_router(preferences_router)` 追加

### 完了基準
- AST parse OK
- `uvicorn yesman_api.main:app --port 8000` で起動 (Mock backend)
- 動作確認 5 curl (Mock backend、Infra Design §7.1)

---

## 8. Phase F: テスト 8 + fixture 1 + U4 既存テスト更新 2

### Unit (4 ファイル + init 2)
- [ ] **F.1.1** `tests/unit/learning/__init__.py`
- [ ] **F.1.2** `tests/unit/learning/test_builder.py` — apply_yes/no + 上限 + clip + persona_names 一貫性 + last_updated_at
- [ ] **F.1.3** `tests/unit/learning/test_cold_start.py` — 4 推定ルール
- [ ] **F.1.4** `tests/unit/learning/test_loader.py` — 履歴あり/なし + YAML format + persona_names YAML-safe
- [ ] **F.1.5** `tests/unit/learning/test_consumer.py` — parse 5 ケース (成功/不正 JSON/必須 key 不足/decision_id 不整合/DB エラー)

### Integration (2 ファイル + init)
- [ ] **F.2.1** `tests/integration/learning/__init__.py`
- [ ] **F.2.2** `tests/integration/learning/test_consumer_loop.py` (placeholder + TODO)
- [ ] **F.2.3** `tests/integration/learning/test_preferences_api.py` (placeholder + TODO)

### PBT
- [ ] **F.3.1** `tests/property/test_builder_invariants.py` — 5 + 1 不変条件 (accepted/rejected/persona_style range/persona_style key/inferred_tags + last_updated_at 単調増加)

### Fixture
- [ ] **F.4.1** `tests/fixtures/learning.py` — `decision_factory` / `preference_profile_factory` / `sqs_message_factory`

### U4 既存テスト更新 (Phase A.0b で実施済の test_engine.py + fixtures/decision.py)
- Phase A.0b で完了済、追加変更なし

### 完了基準
- `pytest apps/api/tests/unit/learning tests/property/test_builder_invariants.py` 全 pass
- U4 既存テスト回帰なし

---

## 9. Phase G: ドキュメント + CDK + pyproject

- [ ] **G.1** `apps/api/.env.example` に U5 5 環境変数追記
- [ ] **G.2** `apps/api/RUNBOOK.md` に **§9 U5 / learning** 章追記
  - LLM-Loader 連携の YAML 例
  - Consumer 起動条件 (`LEARNING_CONSUMER_ENABLED=true AND EVENT_BACKEND=eventbridge`)
  - Mock backend で動作確認 (5 curl + clip 確認)
  - SLO 計測項目 (`learning.consumer.process_ms` < 100ms, `loader.load_ms` < 50ms)
  - **SQS redrive policy 注記** (初回 patch 時の運用注意、I1)
- [ ] **G.3** `apps/api/pyproject.toml` — **依存追加なし** (boto3/structlog/pydantic 既存)
- [ ] **G.4** `infra/lib/stacks/api-stack.ts` 変更:
  - environment +4 個 (Phase A.0a で確認済の `DECISION_EVENTS_QUEUE_URL` 含めれば +5)
  - unit コメント (U2 → U3 → U4 → U5、Imp2)
  - SQS redrive (Phase A.0a 結果次第)
- [ ] **G.5** `cd infra && pnpm test -- --updateSnapshot` で snapshot 更新

### 完了基準
- `pip install -e ".[dev]"` 成功 (依存追加なしのため U4 から変化なし)
- `cd infra && cdk synth` 成功
- snapshot diff: environment +4-5 + IAM (条件付き) + DLQ Queue (条件付き)

---

## 10. 動作確認 (Phase E/F/G 完了後)

```bash
# 1. 依存解決 (U4 から変化なし)
cd apps/api && pip install -e ".[dev]"

# 2. Mock backend で起動
cp .env.example .env  # EVENT_BACKEND=sync → consumer 起動しない
uvicorn yesman_api.main:app --port 8000

# 3. Preference API 動作確認 5 curl (Infra Design §7.1 ultrathink I4 反映)
HEADERS=(-H "Authorization: Bearer anything" -H "Content-Type: application/json")
curl -i -H "Authorization: Bearer anything" http://localhost:8000/v1/preferences/me  # GET 初回 ColdStart
curl -i -X PATCH "${HEADERS[@]}" -d '{"persona_style_preference": {"効率派": 0.5}}' http://localhost:8000/v1/preferences/me
curl -i -X PATCH "${HEADERS[@]}" -d '{"persona_style_preference": {"効率派": 100.0, "慎重派": -50.0}}' http://localhost:8000/v1/preferences/me  # clip 確認
curl -i -X DELETE -H "Authorization: Bearer anything" http://localhost:8000/v1/preferences/me
curl -i -H "Authorization: Bearer anything" http://localhost:8000/v1/preferences/me  # ColdStart 再推定

# 4. U4 と U5 連携 (Loader 経由でプロンプトに preference YAML が含まれることを確認)
#   - 合議実行 → /v1/decisions/request → preference_yaml が profile_yaml に append される
#   - サーバログで "decision.confirmed" event が EventPublisher 経由で発火 (sync の場合は log のみ)

# 5. テスト一括実行
pytest apps/api/tests/unit/learning apps/api/tests/property/test_builder_invariants.py

# 6. CDK synth
cd infra && pnpm test -- --updateSnapshot && cdk synth
```

---

## 11. リスク

| リスク | 影響 | 対応 |
|---|---|---|
| U1 SQS redrive policy 追加で Queue 再作成 | in-flight メッセージ喪失 | Phase A.0a で `cdk diff` 確認、`Destroy` 含まれれば初回運用前に実施 (RUNBOOK §9 注記、I1 反映) |
| U4 engine.py への遡及修正で既存 U4 テスト壊れる | 回帰 | Phase A.0b で `_make_engine` ヘルパー更新 + AST parse 確認、Phase F の F.1.x 着手前に U4 test の再 pass を確認 |
| Consumer の persona_names 取得が persona_outputs に依存 (空なら空 list) | persona_style_preference 更新されず | NFR Design §1.1 `_build_pattern` で `persona_outputs.utterances` から抽出、空なら空 list、ログ警告 |
| ColdStart Loader が `profile_repo.get` で None (Profile 未作成) | 空 PreferenceProfile 返却で機能停止 | NFR Design §3.1 で `PreferenceProfile(user_id=user_id)` を返却、`profile_repo.get` 失敗時のフォールバック明示 |
| Supervisor の `asyncio.timeout` が Python 3.10 以下で動作不可 | 起動失敗 | `pyproject.toml` で `requires-python = ">=3.12"` 既定済、確認のみ |

---

## 12. 承認チェックリスト

- [x] Phase A.0a〜G の 9 段階タスクが checkbox 形式で列挙
- [x] 各 Phase の完了基準が明示
- [x] U2 patch 不要 (U4 で実施済)
- [x] U1 patch 計画 (Phase A.0a 条件付き)
- [x] U4 遡及修正計画 (Phase A.0b で 5 ファイル)
- [x] 動作確認手順 6 ステップ + 5 curl パターン
- [x] リスク 5 項目 + 緩和策
- [x] 全ファイル集計 (新規 10 + 変更 5 + テスト 9 + 変更 2 + ドキュメント 2 + CDK 1 = 約 29 ファイル)
- [x] ultrathink 累計 30 件全反映の引き継ぎ (FD 10 + NFR Req 7 + NFR Design 6 + Infra Design 7)

---

## Post-CONSTRUCTION 改修注記 (2026-05-19)

本 plan 本体は 2026-05-16 承認時の Snapshot を保持。

**SQS Consumer + ColdStart Loader + apply_yes/no + PATCH/DELETE 等の生成計画は全て継続有効**。Post-CONSTRUCTION 期間中、`apps/api/src/yesman_api/{domain,application,infrastructure,interface}/learning/` および preference module 配下に commit による変更なし。

### 波及効果のみ (本 plan の scope 外)
- U4 DecisionEngine が `PreferenceProfileRepository.get_by_user` を読むようになった (`07c1c78`)、U5 自身の書き込み path は不変

→ U5 Code Gen Plan は CONSTRUCTION 完了状態のまま継続有効。
