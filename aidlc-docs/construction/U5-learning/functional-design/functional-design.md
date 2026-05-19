# U5 / learning — Functional Design

**Unit**: U5 / learning — PreferenceProfileBuilder + EventBridge consumer + Cold start
**Phase**: CONSTRUCTION — Functional Design
**Author**: AI-DLC workflow
**Created**: 2026-05-16
**Status**: 🟡 IN REVIEW

---

## 0. 位置付け

U4 / decision が発火する `DecisionConfirmed` イベントを SQS 経由で消費し、`preference_profiles` テーブルを非同期更新する閉ループを完成させる (FR-LEARN-07)。同時にコールドスタート時の初期嗜好推定 (FR-LEARN-05) と Profile 閲覧/部分修正/全リセット API (FR-LEARN-04) を提供する。

### 関連要件
- **FR-LEARN-01** — Yes/No 履歴から嗜好プロファイル構築
- **FR-LEARN-02** — 嗜好プロファイルを LLM プロンプトに注入 (U4 連携)
- **FR-LEARN-03** — 継続更新
- **FR-LEARN-04** — 閲覧/部分修正/全リセット API
- **FR-LEARN-05** — コールドスタート対応 (プロフィールから推定)
- **FR-LEARN-06** — PII 除去 + Aurora KMS 暗号化保存
- **FR-LEARN-07** — 非同期更新 (提案レイテンシ非ブロッキング)

### 上流前提
| 出典 | 内容 |
|---|---|
| U2 PreferenceProfileRepository | `get(user_id)` / `upsert(profile)` / `delete(user_id)` 既定義 |
| U2 PreferenceProfile モデル | `accepted_patterns` / `rejected_patterns` / `persona_style_preference` / `inferred_tags` の 4 JSONB |
| U2 DecisionRepository | `list_by_user(user_id, limit, offset)` で履歴取得 (Builder の入力) |
| U2 ProfileRepository | `get(user_id)` で年齢層/職業/価値観タグ等のコールドスタート用情報 |
| U4 EventPublisher | `DecisionConfirmed` イベント (Yes/No 両方発火、user_id/decision_id/choice/domain/timestamp) |
| U1 EventBridge + SQS | `yesman-bus` + `decision-events` queue 既存 (`EVENT_BUS_NAME` + `DECISION_EVENTS_QUEUE_URL`) |

### MVP スコープ (U5 内)
- ✅ PreferenceProfileBuilder (Yes/No 履歴 → 4 JSONB フィールド構築ロジック)
- ✅ SQS Consumer (ECS Task 内 background poller、`asyncio.Task` で起動)
- ✅ Cold start fallback (Profile から推定、初回 LLM プロンプト用)
- ✅ Preference API (`GET /v1/preferences/me`, `PATCH /v1/preferences/me`, `DELETE /v1/preferences/me`)
- ✅ U4 への注入用 helper (`PreferenceProfileLoader` を DecisionEngine に提供)
- ✅ DecisionConfirmed イベントスキーマの consumer 側 schema (U4 と整合)
- ⏭ Lambda 関数版 consumer → 本ユニットは ECS Task 内 poller、Lambda 化は将来
- ⏭ 古い patterns の自動 pruning (容量管理) → MVP では shape の上限 cap で対応
- ⏭ A/B test 用の preference branching → 将来

---

## 1. ドメインモデル

### 1.1 PreferenceUpdate (in-flight、消費した DecisionConfirmed) — ultrathink C1 反映

```python
@dataclass(frozen=True, slots=True)
class DecisionConfirmedPayload:
    """SQS message body から parse される DecisionConfirmed イベント.

    U4 EventPublisher は `boto3.events.put_events(Detail=json.dumps({...}))` で発火、
    EventBridge → SQS Rule で配送される際、SQS message body は EventBridge envelope 全体:
        {"version": "0", "detail-type": "DecisionConfirmed",
         "source": "yesman.api", "time": "...", "detail": {...}}
    detail.user_id / decision_id は文字列、Python 側で UUID 変換が必要 (C1).
    """
    user_id: UUID
    decision_id: UUID
    choice: Literal["yes", "no"]
    domain: str
    timestamp: datetime

    @classmethod
    def from_sqs_body(cls, body: dict) -> "DecisionConfirmedPayload":
        """SQS body (EventBridge envelope) から parse、UUID/datetime 型変換."""
        detail = body["detail"]
        return cls(
            user_id=UUID(detail["user_id"]),
            decision_id=UUID(detail["decision_id"]),
            choice=detail["choice"],
            domain=detail["domain"],
            timestamp=datetime.fromisoformat(detail["timestamp"]),
        )
```

### 1.2 PreferenceProfile (U2 既存) の意味づけ + 上限

| フィールド | 内容 | 上限 | 更新トリガ |
|---|---|---|---|
| `accepted_patterns: list[dict]` | Yes 採択された提案のパターン | **100 件** (古い順 prune) | Yes 採択時 |
| `rejected_patterns: list[dict]` | No 採択された提案のパターン | **100 件** | No 採択時 |
| `persona_style_preference: dict[str, float]` | persona_name → preference_score | **50 key** (古い順 prune、ultrathink Imp2 反映)、値 ∈ [-1.0, 1.0] | Yes/No に応じて加減 |
| `inferred_tags: list[str]` | 履歴から累積した特徴タグ | **50 件** (set union) | 初回 + 定期更新 |

pattern 形式の例:
```json
{"domain": "daily", "keywords": ["lunch", "engineer-friendly"],
 "persona_names": ["効率派"], "weight": 1.0,
 "decision_id": "...", "timestamp": "..."}
```

### 1.3 SQL 永続化 (U2 既存)
- `PreferenceProfile.user_id` を PK、`profiles.user_id` への FK
- Aurora KMS 暗号化済 (U1 NFR-SEC-04)

---

## 2. PreferenceProfileBuilder

`apps/api/src/yesman_api/domain/learning/builder.py`

### 2.1 責務
- 1 つの DecisionConfirmed イベントを受けて preference_profile を **incremental に更新** (履歴全体を再走査しない、O(1) 更新)
- 既存 profile がなければ新規作成 (Cold start 経由で初期化済の場合あり)

### 2.2 アルゴリズム (Yes 採択時)

```python
def apply_yes(profile: PreferenceProfile, decision: Decision) -> PreferenceProfile:
    # 1. accepted_patterns に追加 (上限 100 件、古い順に pruning)
    pattern = {
        "domain": decision.domain_classification,
        "keywords": _extract_keywords(decision.user_input, decision.proposal_text),
        "persona_names": [_get_persona_name(pid) for pid in decision.selected_persona_ids],
        "weight": 1.0,
        "decision_id": str(decision.id),
        "timestamp": decision.created_at.isoformat(),
    }
    profile.accepted_patterns = (profile.accepted_patterns + [pattern])[-100:]
    # 2. persona_style_preference の各 persona に +0.1 加算 (clip [-1.0, 1.0])
    for name in pattern["persona_names"]:
        current = profile.persona_style_preference.get(name, 0.0)
        profile.persona_style_preference[name] = max(-1.0, min(1.0, current + 0.1))
    # 3. inferred_tags にドメインキーワードを蓄積 (集合論的 union、上限 50)
    profile.inferred_tags = list(set(profile.inferred_tags + pattern["keywords"]))[:50]
    return profile
```

### 2.3 アルゴリズム (No 採択時)

```python
def apply_no(profile: PreferenceProfile, decision: Decision) -> PreferenceProfile:
    # 1. rejected_patterns に追加 (上限 100 件)
    pattern = {
        "domain": decision.domain_classification,
        "keywords": _extract_keywords(decision.user_input, decision.proposal_text),
        "persona_names": [_get_persona_name(pid) for pid in decision.selected_persona_ids],
        "weight": 1.0,
        "decision_id": str(decision.id),
        "timestamp": decision.created_at.isoformat(),
    }
    profile.rejected_patterns = (profile.rejected_patterns + [pattern])[-100:]
    # 2. persona_style_preference に -0.05 (Yes より弱い負シグナル)
    for name in pattern["persona_names"]:
        current = profile.persona_style_preference.get(name, 0.0)
        profile.persona_style_preference[name] = max(-1.0, min(1.0, current - 0.05))
    # 3. inferred_tags は No では更新しない (傾向ノイズ防止)
    return profile
```

### 2.4 キーワード抽出 (`_extract_keywords`) — ultrathink I2 反映: MVP では完全 skip

- **MVP: 空 list を返す** (`keywords=[]`)。日本語形態素は正規表現で困難、`janome` 依存追加もハッカソンスコープ外
- ハッカソンでの学習効果は **`domain` + `persona_names` だけで十分** (= 効率派が好まれる、daily ドメインで Yes が多い、等)
- 将来 (Phase 2): `janome` or LLM ベース抽出に差替え、interface は変更しない
- 注: PII フィルタは将来 keywords 実装時に `mask_pii` 経由

---

## 3. ColdStartEstimator

`apps/api/src/yesman_api/domain/learning/cold_start.py`

### 3.1 責務
- 履歴なしユーザーの **初期 preference_profile** を Profile (age_group / occupation / value_tags / preferences / life_stage) から推定 (FR-LEARN-05)

### 3.2 推定ルール (固定マッピング、MVP)

```python
def estimate(profile: Profile) -> PreferenceProfile:
    inferred_tags = []
    persona_preference: dict[str, float] = {}

    # 年齢層 → 慎重派/楽観派の傾向
    if profile.age_group in ("10s", "20s"):
        persona_preference["楽観派"] = 0.2
    elif profile.age_group in ("50s", "60s+"):
        persona_preference["慎重派"] = 0.2

    # 職業 → 効率派バイアス
    if profile.occupation and "engineer" in profile.occupation.lower():
        persona_preference["効率派"] = 0.3

    # 価値観タグを inferred_tags に転写
    inferred_tags.extend(profile.value_tags)
    # life_stage → ドメインヒント
    if profile.life_stage == "working":
        inferred_tags.append("work-focused")
    elif profile.life_stage == "parenting":
        inferred_tags.append("family-focused")

    return PreferenceProfile(
        user_id=profile.user_id,
        accepted_patterns=[],
        rejected_patterns=[],
        persona_style_preference=persona_preference,
        inferred_tags=inferred_tags,
    )
```

### 3.3 トリガ (ultrathink I1 反映: 発火を Loader に一元化、race condition 防止)

- **Loader のみが ColdStartEstimator を呼ぶ** (Consumer は呼ばない、二重発火回避)
- **Consumer のフロー**: `preference_repo.get(user_id)` → None なら **空 PreferenceProfile (`PreferenceProfile(user_id=user_id)`)** で apply_yes/no → upsert
- **Loader のフロー**: `preference_repo.get(user_id)` → None なら ColdStartEstimator → upsert → 返却
- このパターンで Loader が「履歴なしユーザーに最初の合議で ColdStart 初期化を実行」、Consumer は「既存 profile への incremental update」を担当 (責務分離)

---

## 4. SQS Consumer (`DecisionConfirmedConsumer`)

`apps/api/src/yesman_api/infrastructure/learning/consumer.py`

### 4.1 責務
- SQS Queue (`yesman-{env}-decision-events`) を long-polling で監視
- DecisionConfirmed メッセージを受信 → PreferenceProfileBuilder で profile を更新 → 永続化
- visibility timeout / DLQ / retry は SQS 側設定で対応

### 4.2 ライフサイクル (ultrathink I5 反映: graceful shutdown 改善)

- ECS Task の lifespan で `asyncio.create_task(consumer.run())` で起動
- shutdown 時に graceful stop (`asyncio.Event` で stop_event を立てる)
- **`receive_messages(WaitTimeSeconds=5)`** に短縮 (元 20 秒) — ECS Task shutdown 検知が最大 5 秒で完了、grace period 30 秒に十分収まる
- multi-worker (uvicorn workers ≥ 2) の場合、**各 worker が個別に poll** する設計 → SQS は冪等性を持つので問題なし

### 4.3 メッセージ schema (U4 と整合、ultrathink C1 反映)

SQS body は **EventBridge envelope 全体** (発火側 U4 `boto3.events.put_events` で `Detail=json.dumps({...})` するが、配送時に envelope が追加される):

```json
{
  "version": "0",
  "id": "...",
  "detail-type": "DecisionConfirmed",
  "source": "yesman.api",
  "time": "...",
  "detail": {
    "user_id": "uuid-string",     // ← 文字列、Python 側で UUID() 変換が必要
    "decision_id": "uuid-string", // ← 同上
    "choice": "yes" | "no",
    "domain": "daily",
    "timestamp": "ISO 8601 string" // ← 同上、datetime.fromisoformat 変換
  }
}
```

→ §1.1 `DecisionConfirmedPayload.from_sqs_body(body)` classmethod で parse。

### 4.4 処理フロー (ultrathink I1 + Imp1 反映)

```
1. receive_messages(MaxNumberOfMessages=10, WaitTimeSeconds=5)  # short polling for fast shutdown
2. for msg in messages:
   2a. payload = DecisionConfirmedPayload.from_sqs_body(json.loads(msg.Body))
   2b. decision = await decision_repo.get(payload.decision_id)
   2c. if decision is None: log warning + delete_message (= 不整合だが retry しても解決しない)
   2d. profile = await preference_repo.get(payload.user_id)
       # ultrathink I1 反映: Consumer は ColdStart を呼ばず、空 profile で incremental update
       if profile is None:
           profile = PreferenceProfile(user_id=payload.user_id)  # 空初期化
   2e. updated = builder.apply_yes(profile, decision) if choice=yes else apply_no(...)
   2f. await preference_repo.upsert(updated)
   2g. delete_message
        # ultrathink Imp1 反映: delete_message 失敗時は log + 次の visibility timeout で再配送
        # 冪等性は MVP では「accepted_patterns に重複が乗る」許容、将来 decision_id ベースの dedup 検討
3. loop until stop_event.is_set()
```

### 4.5 エラーハンドリング
- parse 失敗 → log error + delete_message (poison message を queue に残さない、SQS DLQ 設定があれば DLQ へ)
- DB エラー (Aurora 一時的) → message を visibility timeout 後に再配送 (delete しない)
- 致命的エラー (ConfigError 等) → consumer stop + supervisor が再起動

### 4.6 EVENT_BACKEND=sync / inline-async 時の挙動
- `sync` (Mock backend): consumer は **起動しない**、SQS 自体を使わない
- `inline-async`: SQS 不使用、U4 EventPublisher が直接 builder を呼ぶ
- `eventbridge` のみ consumer 起動

---

## 5. PreferenceProfileLoader (U4 連携)

`apps/api/src/yesman_api/domain/learning/loader.py`

### 5.1 責務
- U4 ConsensusOrchestrator が プロンプト構築時に呼び出すヘルパー
- `load(user_id)` → 現在の PreferenceProfile を返す (なければ ColdStart 経由で空に近い初期化)
- LLM に注入する形式 (YAML or 短縮 JSON) で format

### 5.2 シグネチャ + YAML format (ultrathink I3 反映)

```python
class PreferenceProfileLoader:
    def __init__(self, *, preference_repo, profile_repo, cold_start: ColdStartEstimator) -> None: ...

    async def load_for_prompt(self, user_id: UUID) -> str:
        """LLM プロンプトに inject する YAML 形式の preference summary.

        履歴なし → ColdStartEstimator で生成 + upsert (ColdStart の一元化、I1 反映).
        accepted/rejected_patterns は最新 5 件まで要約、persona_style_preference は top 5 のみ.
        """
```

**YAML format サンプル** (LLM への injection):

```yaml
# ユーザー嗜好プロファイル (PreferenceProfileLoader 生成)
inferred_tags: [growth, stability, work-focused]
preferred_personas:
  - 効率派: +0.3
  - 慎重派: +0.1
recent_accepted:
  - {domain: daily, persona_names: [効率派], when: "2026-05-15"}
  - {domain: work, persona_names: [効率派, 慎重派], when: "2026-05-14"}
recent_rejected_count: 3   # 詳細は省略 (LLM プロンプト肥大化防止)
```

→ DecisionEngine は `profile_yaml` (Profile) + `preference_yaml` (この出力) を **連結** して ConsensusOrchestrator.build_prompt に渡す。

### 5.3 U4 統合 (ultrathink I4 反映: 遡及修正範囲を具体化)

DecisionEngine の改修範囲:

1. **コンストラクタに `preference_loader: PreferenceProfileLoader` 引数を追加**:
   ```python
   def __init__(
       self,
       *,
       llm, orchestrator, silence_guard,
       decision_repo, silence_repo, persona_repo, profile_repo,
       event_publisher,
       preference_loader: PreferenceProfileLoader,  # U5 追加
   ):
   ```
2. **`_format_profile_with_preferences(profile, user_id)` メソッド追加**:
   - 既存 `_format_profile` を内部呼び出し
   - `preference_loader.load_for_prompt(user_id)` を append
3. **`run` / `run_stream` で `_format_profile_with_preferences` を使う** (1 行差し替え)
4. **main.py の lifespan** で PreferenceProfileLoader を初期化、`get_decision_engine` に渡す

**U4 への遡及修正**: コンストラクタ + 1 メソッド + main.py = **3 ファイル変更** (DecisionEngine / get_decision_engine / main.py)、U4 既存テスト (test_engine.py) も `_make_engine` ヘルパーに preference_loader 引数を追加する必要あり (1 行)。

Code Gen Phase で U5 Phase A の最初に「U4 遡及修正タスク」として組み込む (U2 Phase A.0 と同パターン)。

---

## 6. Preference API (FR-LEARN-04)

`apps/api/src/yesman_api/interface/http/preferences.py`

### 6.1 エンドポイント

| Method | Path | 認証 | 説明 |
|---|---|---|---|
| GET | `/v1/preferences/me` | 必須 | 自分の preference_profile 取得 (なければ Loader 経由で ColdStart 推定) |
| PATCH | `/v1/preferences/me` | 必須 | 部分修正 (4 JSONB フィールドを optional で更新)、サーバ側 clip 強制 (ultrathink Imp3) |
| DELETE | `/v1/preferences/me` | 必須 | **Profile から ColdStart 再推定** で再初期化 (ultrathink Imp4: 完全空ではなく、UX 悪化防止) |

### 6.2 DTO (ultrathink Imp3 反映: persona_style サーバ側 clip 強制)

```python
class PreferenceProfileResponse(BaseModel):
    user_id: UUID
    accepted_patterns: list[dict[str, Any]]
    rejected_patterns: list[dict[str, Any]]
    persona_style_preference: dict[str, float]
    inferred_tags: list[str]
    last_updated_at: datetime


class PreferenceProfileUpdateRequest(BaseModel):
    accepted_patterns: list[dict[str, Any]] | None = Field(default=None, max_length=100)
    rejected_patterns: list[dict[str, Any]] | None = Field(default=None, max_length=100)
    persona_style_preference: dict[str, float] | None = None
    inferred_tags: list[str] | None = Field(default=None, max_length=50)


# Handler 内で persona_style_preference を clip:
def _clip_persona_style(values: dict[str, float]) -> dict[str, float]:
    return {k: max(-1.0, min(1.0, v)) for k, v in list(values.items())[:50]}
```

- `persona_style_preference` の Value 範囲は handler 側で **clip [-1.0, 1.0]** + key 上限 50 (ultrathink Imp2 + Imp3)

---

## 7. テスト戦略

| ファイル | 種別 | 対象 |
|---|---|---|
| `tests/unit/learning/test_builder.py` | unit | apply_yes / apply_no / persona_style clip / accepted_patterns cap / inferred_tags 重複排除 |
| `tests/unit/learning/test_cold_start.py` | unit | 年齢層 / 職業 / 価値観タグ / life_stage の 4 推定ルール |
| `tests/unit/learning/test_loader.py` | unit | 履歴あり/なし / ColdStart fallback / YAML format |
| `tests/unit/learning/test_consumer.py` | unit | parse_decision_confirmed / 不正 message handling / DB エラー retry |
| `tests/integration/learning/test_consumer_loop.py` | integration | Mock SQS + Mock Repo で full loop |
| `tests/integration/learning/test_preferences_api.py` | integration | GET → PATCH → DELETE → GET 一気通貫 |
| `tests/property/test_builder_invariants.py` | PBT | 任意 Decision 列 → accepted/rejected の上限 100 件 / persona_style ∈ [-1, 1] / inferred_tags 上限 50 |

---

## 8. 引き継ぎ (NFR Requirements)

NFR Req で確定する事項:
- **PERF**: consumer 処理 1 message < 100ms (Aurora upsert + ロジック)、long polling 20 秒間隔
- **SEC**: PII フィルタを keywords 抽出時に適用 (NFR-SEC-05)、preference_profile 自体は Aurora KMS 暗号化 (U1 既存)
- **AVAIL**: SQS 受信失敗 → 30 秒 sleep + retry、致命的エラー → consumer stop + lifespan で supervisor 再起動
- **EXT**: ColdStartEstimator のルールは **クラス内定数化** (将来 ML モデル差替え可能)
- **TEST**: Builder PBT (上限 + clip 不変条件)
- **環境変数**: DECISION_EVENTS_QUEUE_URL (U1 既存) / LEARNING_CONSUMER_ENABLED (sync/inline-async モードで false) / LEARNING_LONG_POLL_SECONDS (default 20)

---

## 9. 承認チェックリスト

- [x] スコープ確定 (5 機能 in / 3 out)
- [x] ドメインモデル (DecisionConfirmedPayload + **from_sqs_body classmethod 明示** + 既存 PreferenceProfile の 4 フィールド意味づけ + **上限 100/50 明示**)
- [x] PreferenceProfileBuilder (Yes/No 別アルゴリズム + 上限 + clip + **persona_style_preference 50 key 上限**)
- [x] ColdStartEstimator (4 推定ルール + **Loader 一元発火、Consumer は空 profile で incremental update**)
- [x] SQS Consumer (**WaitTimeSeconds=5 short polling** + 冪等性 + multi-worker + delete_message error handling)
- [x] PreferenceProfileLoader (U4 連携 + **YAML format サンプル明示** + ColdStart fallback 一元化)
- [x] Preference API (GET/PATCH/**DELETE → ColdStart 再推定** + DTO サーバ側 clip)
- [x] テスト戦略 (7 ファイル)
- [x] EVENT_BACKEND 3 種それぞれの挙動明示
- [x] **U4 への遡及修正範囲を具体化** (DecisionEngine コンストラクタ + 1 メソッド + main.py = 3 ファイル変更 + test_engine.py 1 行)
- [x] 次ステージ (NFR Req) への引き継ぎ

### ultrathink レビュー (2026-05-16) 反映済 10 件
- **Critical 1**: C1 DecisionConfirmedPayload.from_sqs_body classmethod で UUID/datetime 型変換明示
- **Important 5**:
  - I1: ColdStart 発火を Loader 一元化、Consumer は空 profile で incremental update (race condition 防止)
  - I2: keywords 抽出を MVP では完全 skip、空 list、interface 維持で将来差替え
  - I3: PreferenceProfileLoader.load_for_prompt の YAML format サンプル提示 (recent_rejected_count で詳細省略、プロンプト肥大化防止)
  - I4: U4 への遡及修正範囲を「軽微」から「コンストラクタ + メソッド + main.py = 3 ファイル + テスト 1 行」と具体化
  - I5: SQS WaitTimeSeconds 20→5 に短縮、ECS Task shutdown 検知最大 5 秒
- **Improvements 4**:
  - Imp1: delete_message 失敗時は log + visibility timeout 再配送、冪等性は MVP 許容
  - Imp2: persona_style_preference 50 key 上限 (古い順 prune)
  - Imp3: PATCH の DTO + handler 側 clip 強制 ([-1.0, 1.0] + 50 key)
  - Imp4: DELETE は ColdStart 再推定で再初期化 (完全空ではない、UX 悪化防止)

---

## Post-CONSTRUCTION 改修注記 (2026-05-19)

本ドキュメント本体は 2026-05-16 承認時の Snapshot を保持。以下の改修が Post-CONSTRUCTION 段階で本 unit のスコープに波及した:

### Dynamic Persona Routing への学習結果の活用 (`07c1c78`、Closes #4)

U5 が学習する `PreferenceProfile.persona_style_preference` (dict[persona_id, score]) が、U4 `DecisionEngine._resolve_personas` から **読み取り専用** で参照されるようになった:

- U5 の **書き込み path 不変**: `apply_yes / apply_no` でのスコア更新ロジック、SQS consumer、ColdStart Loader、PATCH/DELETE clip 動作はすべて維持
- 新しい **読み取り消費者**: U4 DecisionEngine (cold-start 判定 + 推奨 top-3)
- 読み取り頻度: 1 decision request あたり最大 1 回、`PreferenceProfileRepository.get_by_user(user_id)`
- 既存の `GET / PATCH / DELETE /v1/preferences/me` endpoint には影響なし

### Mock seed への影響 (`2b08a75`)
- U2 の `MOCK_SEED_DEMO_DECISIONS=true` で `builder.apply_yes/no` が 105 回呼ばれ、`persona_style_preference` が demo 用に {慎重派 0.72 / 楽観派 0.91 / 効率派 0.45} に収束
- これにより demo 用 user の Dynamic Persona Routing は「楽観派 → 慎重派 → 効率派」順で top-3 推奨が出る (E2E `persona.spec.ts` で検証)

→ U5 / learning は学習ロジックを変更せず、結果データの新規消費者が増えた形。
