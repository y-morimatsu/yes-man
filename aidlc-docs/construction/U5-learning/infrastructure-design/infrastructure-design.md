# U5 / learning — Infrastructure Design

**Unit**: U5 / learning
**Phase**: CONSTRUCTION — Infrastructure Design
**Created**: 2026-05-16
**Status**: 🟡 IN REVIEW
**Upstream**: FD (10) + NFR Req (7) + NFR Design (6)

---

## 0. 位置付け

NFR Design §10 引き継ぎを実物理レイアウトに確定。U2 (Repository) / U3 (validate_runtime) / U4 (DecisionEngine 遡及) との接続点を明示。

---

## 1. ディレクトリ構造

```
apps/api/src/yesman_api/
├── domain/learning/                           ← (新規 U5) 5 ファイル
│   ├── __init__.py
│   ├── models.py                              ← DecisionConfirmedPayload (from_sqs_body classmethod)
│   ├── builder.py                             ← apply_yes / apply_no (純粋関数) + 定数 + _build_pattern
│   ├── cold_start.py                          ← ColdStartEstimator + 3 定数マッピング
│   └── loader.py                              ← PreferenceProfileLoader + _format_yaml
├── infrastructure/learning/                   ← (新規 U5) 3 ファイル
│   ├── __init__.py
│   ├── consumer.py                            ← DecisionConfirmedConsumer (asyncio.to_thread + boto3 sqs)
│   └── supervisor.py                          ← ConsumerSupervisor (asyncio.timeout + exponential backoff)
├── interface/
│   ├── deps.py                                ← (変更) get_preference_loader / get_preference_repo accessors (既存) + get_decision_engine に preference_loader inject
│   └── http/
│       ├── preferences.py                     ← (新規 U5) 3 endpoint
│       └── dto/preference.py                  ← (新規 U5) Request/Response
├── infrastructure/config.py                   ← (変更) 5 環境変数 + validate_runtime 拡張
├── main.py                                    ← (変更) lifespan で PreferenceProfileLoader / Supervisor 初期化
└── domain/decision/engine.py                  ← (U4 遡及変更) preference_loader 引数 + _format_profile_with_preferences
```

### 1.1 集計

| カテゴリ | 数 |
|---|---|
| **新規 Python (本体)** | 10 (domain/learning 5 + infrastructure/learning 3 + interface/http/preferences 1 + dto/preference 1) |
| **変更 Python (本体)** | 5 (config + deps + main + engine + test_engine + fixtures、U4 遡及含む) |
| **新規テスト** | 8 (unit 4 + integration 2 + contract 0 + PBT 1 + __init__ 1) |
| **変更 テスト** | 2 (test_engine.py + fixtures/decision.py、U4 遡及) |
| **変更 ドキュメント / 設定** | 2 (`.env.example` + RUNBOOK §9) |
| **変更 CDK** | 1 (api-stack.ts: 環境変数 4 + SQS redrive 確認) |
| **U1 patch (条件付き)** | 0-2 (redrive policy 未設定なら) |
| **合計** | **約 28 ファイル** (U4 の 47 / U3 の 37 比で小規模) |

### 1.2 新規ディレクトリ (2 個)
- `domain/learning/`
- `infrastructure/learning/`

---

## 2. U4 への遡及修正 (NFR Design §8 + FD I4 確定)

Code Gen Phase A.0 として実施 (U4 で確立した条件付き patch パターン継承)。

### 2.1 `domain/decision/engine.py` (変更)
- コンストラクタに `preference_loader: PreferenceProfileLoader` 引数追加
- `_format_profile_with_preferences(*, user_id, profile)` メソッド追加 (keyword-only)
- `run` / `run_stream` 内 2 箇所で `_format_profile` → `_format_profile_with_preferences` 置換

### 2.2 `interface/deps.py` (変更)
- `get_preference_loader(request)` 新規追加 — `app.state.preference_loader`
- `get_decision_engine` 内で `preference_loader=preference_loader` を inject

### 2.3 `main.py` (変更)
- lifespan で `PreferenceProfileLoader(...)` を生成、`app.state.preference_loader` に格納
- 同 lifespan で **`ConsumerSupervisor` を起動** (条件付き: `EVENT_BACKEND=eventbridge` AND `LEARNING_CONSUMER_ENABLED=true`)
- shutdown で supervisor.stop()
- `app.include_router(preferences_router)` 追加

### 2.4 `tests/unit/decision/test_engine.py` (変更)
- `_make_engine` ヘルパーに `preference_loader=mock_preference_loader_factory()` 追加 (1 行)

### 2.5 `tests/fixtures/decision.py` (変更)
- `mock_preference_loader_factory()` 追加 (空 YAML を返す stub)

---

## 3. U1 (CDK) 遡及修正計画

### 3.1 ApiStack environment 追加 (api-stack.ts)

```typescript
environment: {
  // 既存 ... (U2/U3/U4)

  // U5 / learning (NFR Req §6)
  LEARNING_CONSUMER_ENABLED: 'true',
  LEARNING_LONG_POLL_SECONDS: '5',
  LEARNING_RETRY_SLEEP_SECONDS: '30',
  LEARNING_SUPERVISOR_BACKOFF_MAX_SECONDS: '300',
  // DECISION_EVENTS_QUEUE_URL は U1 既存 (this.decisionEventsQueue.queueUrl)
},
```

### 3.2 IAM 権限 (api-stack.ts)

U1 で `sqs:ReceiveMessage` / `sqs:DeleteMessage` 権限が `decisionEventsQueue.queueArn` に限定で付与済を確認。**未付与なら追加** (現状の SQS Queue は EventBridge target でアプリ側は consume 側のみ):

```typescript
apiTaskRole.addToPolicy(new iam.PolicyStatement({
  actions: ['sqs:ReceiveMessage', 'sqs:DeleteMessage', 'sqs:GetQueueAttributes'],
  resources: [this.decisionEventsQueue.queueArn],
}));
```

### 3.3 SQS redrive policy + DLQ (ultrathink NFR Req I3 反映)

U1 ApiStack の `decisionEventsQueue` に **redrive policy** + **DLQ Queue** が設定済か確認。未設定なら追加:

```typescript
// DLQ
this.decisionEventsDlq = new sqs.Queue(this, 'DecisionEventsDlq', {
  queueName: `yesman-${ctx.envName}-decision-events-dlq`,
  encryption: sqs.QueueEncryption.KMS,
  encryptionMasterKey: secretsKey,
  retentionPeriod: cdk.Duration.days(14),
});

// Main queue with redrive policy
this.decisionEventsQueue = new sqs.Queue(this, 'DecisionEventsQueue', {
  queueName: `yesman-${ctx.envName}-decision-events`,
  // 既存 props ...
  deadLetterQueue: {
    queue: this.decisionEventsDlq,
    maxReceiveCount: 3,
  },
});
```

Code Gen Phase A.0 で U1 の現状を grep 確認 + 未設定なら patch (= 条件付き U1 patch、U2 patch パターンと同じ)。

---

## 4. `.env.example` 追記 (U5 5 環境変数)

```dotenv

# === U5 / learning (5 個、Infrastructure Design §3.1) ===
# Consumer 起動条件: LEARNING_CONSUMER_ENABLED=true AND EVENT_BACKEND=eventbridge
LEARNING_CONSUMER_ENABLED=true
LEARNING_LONG_POLL_SECONDS=5
LEARNING_RETRY_SLEEP_SECONDS=30
LEARNING_SUPERVISOR_BACKOFF_MAX_SECONDS=300

# DECISION_EVENTS_QUEUE_URL (EVENT_BACKEND=eventbridge + LEARNING_CONSUMER_ENABLED=true で必須、U1 ApiStack 由来)
# DECISION_EVENTS_QUEUE_URL=
```

合計環境変数: U4 終了時 36 個 + U5 4 個 (DECISION_EVENTS_QUEUE_URL は既存) = **40 個**

---

## 5. テストファイル一覧 (新規 8)

| ファイル | 種別 | 対象 |
|---|---|---|
| `tests/unit/learning/__init__.py` | - | - |
| `tests/unit/learning/test_builder.py` | unit | apply_yes / apply_no / 上限 100/50/50 / clip / persona_names 一貫性 (I1 反映) / last_updated_at 単調増加 |
| `tests/unit/learning/test_cold_start.py` | unit | 年齢層 / 職業 / 価値観タグ / life_stage の 4 推定ルール |
| `tests/unit/learning/test_loader.py` | unit | 履歴あり通常 / 履歴なし ColdStart fallback + upsert / YAML format < 2KB / persona_names YAML-safe |
| `tests/unit/learning/test_consumer.py` | unit | parse 成功 / 不正 JSON (delete しない) / 必須 key 不足 / decision_id 不整合 (delete) / DB エラー (delete しない) |
| `tests/integration/learning/__init__.py` | - | - |
| `tests/integration/learning/test_consumer_loop.py` | integration | Mock SQS + Mock Repo で full loop (placeholder + TODO) |
| `tests/integration/learning/test_preferences_api.py` | integration | GET → PATCH (clip) → DELETE → GET (ColdStart 再推定) 一気通貫 (placeholder + TODO) |
| `tests/property/test_builder_invariants.py` | PBT | 5 不変条件 (accepted ≤100, rejected ≤100, persona_style ∈[-1,1], persona_style ≤50, inferred_tags ≤50) + last_updated_at 単調増加 |

---

## 6. ファイル依存グラフ

```mermaid
graph TD
    subgraph domain[domain/learning/]
        DM[models.py<br/>DecisionConfirmedPayload]
        DB[builder.py<br/>apply_yes/no]
        DC[cold_start.py<br/>ColdStartEstimator]
        DL[loader.py<br/>PreferenceProfileLoader]
    end

    subgraph infra[infrastructure/learning/]
        IC[consumer.py<br/>DecisionConfirmedConsumer]
        IS[supervisor.py<br/>ConsumerSupervisor]
    end

    subgraph iface[interface/]
        DEPS[deps.py<br/>★ get_preference_loader + decision_engine inject]
        PROF[http/preferences.py<br/>GET/PATCH/DELETE]
        PDTO[http/dto/preference.py]
    end

    subgraph u4[U4 (遡及変更)]
        ENG[domain/decision/engine.py<br/>★ preference_loader 引数]
    end

    MAIN[main.py<br/>★ Loader/Supervisor 初期化 + preferences_router]
    CFG[infrastructure/config.py<br/>★ 5 env vars + validate_runtime]

    DM --> IC
    DB --> IC
    DC --> DL
    DL --> IC
    DL --> ENG
    DL --> PROF
    PDTO --> PROF
    IC --> IS
    CFG --> MAIN
    IS --> MAIN
    DL --> MAIN
    PROF --> MAIN
    DEPS --> PROF
    DEPS --> ENG

    classDef changed fill:#fffacd,stroke:#daa520,stroke-width:2px
    class CFG,MAIN,DEPS,ENG changed
```

---

## 7. ローカル開発フロー

### 7.1 Mock backend (Consumer 起動なし)

```bash
cp .env.example .env  # EVENT_BACKEND=sync → consumer 起動しない
uvicorn yesman_api.main:app --port 8000

# Preference API 動作確認
curl -i -H "Authorization: Bearer anything" http://localhost:8000/v1/preferences/me
# → 200 + ColdStart 経由の初期 profile

curl -i -X PATCH -H "Authorization: Bearer anything" -H "Content-Type: application/json" \
  -d '{"persona_style_preference": {"効率派": 0.5}}' \
  http://localhost:8000/v1/preferences/me

curl -i -X DELETE -H "Authorization: Bearer anything" http://localhost:8000/v1/preferences/me
# → 204 + 次の GET で ColdStart 再推定
```

### 7.2 EventBridge backend (Consumer 起動)

```bash
# EVENT_BACKEND=eventbridge + DECISION_EVENTS_QUEUE_URL を .env に設定
# (本番 ECS Task では U1 ApiStack 自動注入)
LEARNING_CONSUMER_ENABLED=true uvicorn yesman_api.main:app
# → Supervisor が Consumer を起動、SQS long polling
# 起動ログ確認:
# {"event": "consumer.start", "queue_url": "..."}
```

---

## 8. デプロイ順序 (U4 継承)

1. (初回) SSM Parameter ブートストラップ (U3 から継続)
2. `cdk deploy YesmanAuth YesmanData YesmanAi YesmanNetwork`
3. `cdk deploy YesmanApi` — **SQS redrive policy 設定込み** (本 U5 で確認 + 必要なら patch)
4. `cdk deploy YesmanEdge`
5. `cdk deploy YesmanApi` (再、SSM/Secrets 反映)
6. `cdk deploy YesmanMonitoring`

---

## 9. 引き継ぎ (Code Generation Plan)

### Phase 分割案
- **Phase A.0 (U1 SQS redrive + IAM 確認 + 必要なら patch)**
- **Phase A.1 (U4 遡及修正 5 ファイル)**
- Phase A: constants → 不要 (U5 で新規定数不要、SYSTEM_USER_ID 等は U4 で導入済)
- Phase B: domain/learning/(models + builder + cold_start + loader) 5 ファイル
- Phase C: infrastructure/learning/(consumer + supervisor) 3 ファイル
- Phase D: interface (preferences endpoint + DTO + deps 拡張) 3 ファイル
- Phase E: AppConfig 拡張 + main.py 拡張 (Loader + Supervisor 初期化、preferences_router include)
- Phase F: テスト 8 + U4 既存テスト更新 2
- Phase G: ドキュメント + CDK 修正 + pyproject (依存追加なし)

### PR 集約方針
- **推奨 1 PR**: 全 28 ファイル + U1 SQS patch (条件付き) + U4 遡及 5 ファイル
- **オプション 2 PR**: PR1 = U4 遡及 + Phase A-B (基盤) / PR2 = Phase C-G

---

## 10. 承認チェックリスト

- [x] ディレクトリ構造 (domain/learning + infrastructure/learning の 2 新規)
- [x] 集計 (新規 10 + 変更 5 + テスト 8 + 変更 2 + ドキュメント 2 + CDK 1 = **約 28 ファイル**)
- [x] U4 遡及修正 5 ファイル (engine + deps + main + test_engine + fixtures)
- [x] U1 CDK 修正計画 (api-stack environment +4 + SQS redrive policy 確認 + IAM 確認)
- [x] .env.example 5 環境変数追記
- [x] テスト 8 ファイル一覧
- [x] ファイル依存グラフ (Mermaid)
- [x] ローカル開発フロー 2 パターン (Mock / EventBridge)
- [x] デプロイ順序 (U4 継承、SQS redrive 注記)
- [x] Code Generation Plan への引き継ぎ (Phase A.0/A.1 + A-G の 9 段階、約 28 ファイル + 1 PR)
