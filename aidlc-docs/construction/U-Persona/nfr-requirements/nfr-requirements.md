# U-Persona — NFR Requirements

**Unit**: U-Persona
**Phase**: CONSTRUCTION — NFR Requirements
**Created**: 2026-05-16
**Status**: 🟡 IN REVIEW
**Upstream**: U-Persona FD (approved + 10 ultrathink fixes)

---

## 0. 位置付け

U-Persona FD §7 引き継ぎを ID 付きで具体化。U3-U5 で確立した 5 軸構成 (PERF/SEC/EXT/AVAIL/TEST) + 環境変数。

| 上位 NFR | U-Persona 担当範囲 |
|---|---|
| NFR-PERF-* | persona CRUD / 共有プール listing / Moderator 2 段 |
| NFR-SEC-04 | persona / persona_reports は Aurora KMS 暗号化 (U2 既存) |
| NFR-SEC-07 | persona の入力 validation (DTO 経由) |
| NFR-PRIV-05 | 共有 opt-in (デフォルト OFF) |
| NFR-PRIV-06 | 共有時 owner 匿名化 (16 文字 hash) |
| NFR-PRIV-07 | 利用統計は集計のみ、個別履歴非公開 |
| NFR-PRIV-08 | 沈黙ドメイン誘発検知 (Moderator + 合議時 fail-safe) |

---

## 1. 性能要件 (PERF)

| ID | 要件 | 計測方法 |
|---|---|---|
| **PERF-UP-01** | Persona CRUD (POST/PATCH/DELETE `/v1/personas/me{,/<id>}`) レイテンシ p95 < **100ms** (Moderator regex pass 時) | uvicorn access log |
| **PERF-UP-02** | Persona CRUD で Moderator LLM 自己判定経由 p95 < **1.2 秒** (= regex で reject 確定なら LLM スキップ、FD I3 反映)。**共有公開時 (`PATCH /share`) は Moderator を再実行** → 作成時 + 公開時 = LLM 2 回呼びの累積 **p95 < 2.5 秒** (ultrathink I2)。共有公開頻度は低いため許容 | `moderator.latency_ms` metric |
| **PERF-UP-03** | 共有プール listing (`GET /v1/personas/shared?page=N&page_size=20`) p95 < **200ms** (Aurora 1 SELECT + 匿名化処理) | uvicorn access log |
| **PERF-UP-04** | UserPersonaSelection get/set API p95 < **100ms** | 同上 |
| **PERF-UP-05** | `list_my_personas` / `list_builtin_personas` p95 < **50ms** (= 自分 owner or SYSTEM_USER_ID owner の小さい結果セット) | 同上 |
| **PERF-UP-06** | U4 `_resolve_personas` の UserPersonaSelection 経由解決 p95 < **50ms** (= Aurora 1-2 回 SELECT) | `decision.persona_resolve_ms` |
| **PERF-UP-07** | `PersonaModerator` regex fast path < **50ms** (LLM 呼び出しなし、reject 確定時) | unit test 計測 |
| **PERF-UP-08** | `record_usage` atomic UPDATE p95 < **30ms** (採択時の persona 統計更新、U2 既存) | 同上 |

---

## 2. セキュリティ要件 (SEC)

| ID | 要件 |
|---|---|
| **SEC-UP-01** | **所有者検証**: PATCH/DELETE `/v1/personas/{id}` で `request.state.user.sub == persona.owner_user_id` でなければ **404** (= 他人のは存在しない扱い、leak 防止) |
| **SEC-UP-02** | **builtin 不可**: PATCH/DELETE で `persona.is_builtin == True` なら **403** (`reason: "builtin_immutable"`) |
| **SEC-UP-03** | **アクセス検証**: `set_selection` 内で各 persona に `_can_access` 検証、不合格は **400** (`reason: "persona_not_accessible"`) |
| **SEC-UP-04** | PersonaReport の `reporter_user_id` は **`request.state.user.sub` から強制取得** (path/body で受け取らない、なりすまし防止) |
| **SEC-UP-05** | PersonaReport の重複報告 (`(persona_id, reporter_user_id)` UNIQUE) は **409 Conflict + `{"reason": "duplicate_report", "message": "すでにこのペルソナを報告済です"}`** (FE 表示用メッセージ、ultrathink Imp3 反映) — U2 `DuplicateReportError` 経由 |
| **SEC-UP-06** | `PERSONA_ANONYMIZER_SALT` は **prod では Secrets Manager 経由** (環境変数直書き禁止、U4 SILENCE_HASH_SALT と同パターン、ultrathink Imp3) |
| **SEC-UP-07** | DTO バリデーション (NFR-SEC-07): `name max=50`, `description max=200`, `prompt_text min=30 max=2000`, `report.reason min=10 max=500` |
| **SEC-UP-08** | **PersonaModerator は二段検知** (NFR-PRIV-08): (a) regex 4 ドメイン × 15 語 (U3 SilenceGuard.SILENCE_KEYWORDS 流用、reject 確定なら LLM skip)、(b) LLM 自己判定。**LLM 失敗時は fail-closed** (AVAIL-UP-01)。**LLM が 4 ドメイン以外の domain (例 "racism") を返す場合は `allowed` 扱い** — 既存 U3 SilenceGuard 挙動踏襲、新ドメイン追加は U3 SILENCE_KEYWORDS の更新で同時対応 (ultrathink I3 反映) |
| **SEC-UP-09** | 合議実行時の二段防御 (FR-PERSONA-11 後半): `_resolve_personas` で `is_blocked == True` を除外、結果 0 個なら 502 + `reason: "no_personas_available"` |
| **SEC-UP-10** | **共有プール listing で owner_user_id 直接公開しない** (NFR-PRIV-06): `anonymize_owner(owner_user_id, salt)` の出力のみ含める。owner_user_id raw は DTO に **含めない** |
| **SEC-UP-11** | NFR-PRIV-07: 利用統計は **匿名集計 (usage_count + yes_count)** のみ、個別 user の使用履歴は API レスポンスに含めない |

---

## 3. 拡張性要件 (EXT)

| ID | 要件 |
|---|---|
| **EXT-UP-01** | builtin 推奨セット (3 種固定) は `domain/persona/constants.py` に定数化、将来差替え可能 |
| **EXT-UP-02** | PersonaModerator の判定アルゴリズムは U3 SilenceGuard を流用 (= 共通インフラ)、将来 ML 系 Moderator に差替え可能 (interface 維持) |
| **EXT-UP-03** | 共有プール listing の sort オプション (`popularity` / `newest` / `acceptance`) は API レベルで切替、追加 sort は U2 `PersonaRepository.list_shared` の SortOrder Literal を拡張 |
| **EXT-UP-04** | Anonymizer は `anonymizer.py` の module-level 関数 (ultrathink Imp3)、将来 ML ベース or 別 hash アルゴリズムに差替え可能 |

---

## 4. 可用性 / 障害耐性 (AVAIL)

| ID | 要件 |
|---|---|
| **AVAIL-UP-01** | PersonaModerator の LLM 失敗時は **fail-closed** (= rejected 扱い、保守的、FR-PERSONA-11 / NFR-PRIV-08 整合) — U3 SilenceGuard の挙動を踏襲 |
| **AVAIL-UP-02** | PersonaRepository DB エラー時は HTTPException 503、500 を返さない (U3-U5 と同パターン) |
| **AVAIL-UP-03** | 自動 block 閾値 (`PERSONA_REPORT_AUTO_BLOCK_THRESHOLD`) は MVP では **管理者手動 review トリガ** (= 閾値超過で alarm + 通知、自動 block はしない、誤判定リスク回避)。**RUNBOOK §10 に「閾値到達時の管理者対応手順」を明記** (CLI で `is_shared = False` 降格 + 必要に応じて `is_blocked = True` 設定、ultrathink I1 反映) |
| **AVAIL-UP-04** | 合議実行時に persona 全 block の場合: API 502 + `reason: "no_personas_available"` + FE 連携 hint (`/v1/persona-selections/me`) |
| **AVAIL-UP-05** | `_can_access` の判定は **DB 追加クエリなし** (record 内フラグのみ)、Aurora 障害時も判定は走る (= 既に取得済 persona record を memory で判定) |
| **AVAIL-UP-06** | PersonaModerator の lifespan 初期化失敗 (Salt 未設定 等) は fail-fast (U3 validate_runtime 拡張、`PERSONA_ANONYMIZER_SALT` を prod で必須化) |

---

## 5. テスト要件 (TEST)

| ID | 要件 |
|---|---|
| **TEST-UP-01** | Unit: PersonaCatalogService (`create` / `update` / `delete` / `set_shared` / `set_selection` 上限 3 / 重複 / アクセス検証 / builtin_immutable) |
| **TEST-UP-02** | Unit: PersonaModerator (regex 4 ドメイン pass + reject + LLM 自己判定 + fail-closed) |
| **TEST-UP-03** | Unit: anonymize_owner — 同一 user で同一 ID / 異なる user で異なる ID / salt 違いで結果変化 |
| **TEST-UP-04** | Unit: U4 `_resolve_personas` 拡張 — UserPersonaSelection 経由解決 / `_can_access` reject パターン / 全 block 時 DecisionError |
| **TEST-UP-05** | Integration: Persona CRUD + 共有 ON/OFF + listing flow (placeholder + TODO) |
| **TEST-UP-06** | Integration: PersonaReport 重複報告 409 + count_by_persona (placeholder + TODO) |
| **TEST-UP-07** | Integration: UserPersonaSelection PUT (上限 3 / 1 / 重複) + DELETE (リセット) + GET (builtin fallback) (placeholder) |
| **TEST-UP-08** | PBT: 任意の persona_ids 列 → set_selection 後の保存が常に: (a) 上限 3、(b) 重複なし、(c) アクセス可能のみ、(d) blocked 除外 の **4 不変条件** (U5 NFR Req TEST-U5-05 の Hypothesis パターン継承、`max_examples=100`、ultrathink Imp1) |
| **TEST-UP-09** | Contract: U2 PersonaRepository / PersonaReportRepository / UserPersonaSelectionRepository の Protocol 互換確認 (U-Persona は U2 既存 Protocol を変更なく利用) |

---

## 6. 環境変数 (U-Persona 新規)

| 環境変数 | デフォルト | 必須 | Type | 説明 |
|---|---|---|---|---|
| `PERSONA_ANONYMIZER_SALT` | `` | prod 時必須 | **secret** | NFR-PRIV-06 匿名化 hash 用 salt、prod では Secrets Manager 経由 (U4 SILENCE_HASH_SALT と同パターン) |
| `PERSONA_REPORT_AUTO_BLOCK_THRESHOLD` | `5` | - | plain | PersonaReport 閾値、超過で **管理者 alarm** (自動 block しない、誤判定回避、AVAIL-UP-03) |
| `PERSONA_MODERATOR_LLM_TIMEOUT_SECONDS` | `5.0` | - | plain | Moderator LLM 自己判定のタイムアウト (regex 通過時のみ呼ばれる) |

---

## 7. 引き継ぎ (NFR Design / Infrastructure Design)

### NFR Design で確定する事項
- **PersonaCatalogService の純粋関数化**: `set_selection` のアクセス検証ロジックを純粋関数 `_validate_selection(persona_ids, user_id, all_personas)` として分離 (テスタビリティ + PBT)
- **`_can_access` を `domain/persona/access.py` の module-level 関数として独立** (anonymizer と同パターン、ultrathink Imp3 継承)
- **PersonaModerator の LLM 呼び出し抽象化**: U3 SilenceGuard をそのまま注入 (重複実装回避)
- **共有プール listing の sort 実装**: U2 `PersonaRepository.list_shared(sort=...)` に委譲、Service 層は匿名化のみ
- **`anonymize_owner` の salt 注入**: `PersonaCatalogService.__init__(*, anonymizer_salt: str)` で受け取り、`list_shared` 内で適用

### Infrastructure Design で確定する事項
- **ディレクトリ構造**:
  - `domain/persona/` (catalog / moderator / models / errors / anonymizer / access / constants)
  - `interface/http/personas.py` (8 endpoint) + `persona_selections.py` (3 endpoint)
  - `interface/http/dto/persona.py`
- **U4 への遡及修正**: DecisionEngine `_resolve_personas` keyword-only + selection_repo 引数 + apply_choice での record_usage = **5 ファイル変更** (FD I1 で確定)
- **U1 ApiStack 環境変数追加**: `PERSONA_MODERATOR_LLM_TIMEOUT_SECONDS` (plain) + `PERSONA_REPORT_AUTO_BLOCK_THRESHOLD` (plain)、`PERSONA_ANONYMIZER_SALT` は Secrets Manager (新規 `PersonaAnonymizerSaltSecret`)
- **U2 への遡及確認** (ultrathink Imp2 反映): Phase A.0a で **`grep -n 'is_blocked' apps/api/src/yesman_api/domain/persistence/models.py`** を実行、`Persona.is_blocked` フィールドが既存か確認。未存在なら U2 SQLModel + Alembic migration 追加 (= U-Persona Phase A.0a として patch)
- **pyproject.toml**: 依存追加なし (boto3/structlog/pydantic 既存)

---

## 8. 承認チェックリスト

- [x] PERF-UP (CRUD 100ms / Moderator regex 50ms / LLM 1.2s / **共有公開累積 2.5s** / listing 200ms / selection 100ms / list 50ms / resolve 50ms / record_usage 30ms)
- [x] SEC-UP (所有者検証 404 / builtin 403 / アクセス検証 400 / reporter 強制 / **重複 409 + message 明示** / SALT Secrets Manager / DTO 入力上限 / **二段検知 + LLM 不明 domain は allowed** / 全 block 502 / 匿名化必須 / 利用統計集計のみ)
- [x] EXT-UP (builtin 定数化 / Moderator 流用 / sort 拡張余地 / anonymizer 関数化)
- [x] AVAIL-UP (fail-closed / DB 503 / **自動 block なし + RUNBOOK §10 管理者対応手順** / 全 block 502 / can_access DB 不要 / fail-fast SALT)
- [x] TEST-UP (Unit 4 + Integration 3 + **PBT 1 U5 パターン継承** + Contract 1)
- [x] 環境変数 3 個 + Type (PERSONA_ANONYMIZER_SALT は secret、他 plain)
- [x] NFR Design / Infra Design への引き継ぎ事項 (5 ファイル U4 遡及 + 純粋関数化 + Secrets Manager + **U2 is_blocked 確認 Phase A.0a**)

### ultrathink レビュー (2026-05-16) 反映済 6 件
- **Important 3**:
  - I1 (AVAIL-UP-03): MVP は自動 block なし + RUNBOOK §10 に閾値到達時の管理者対応手順 (CLI で is_shared=False / is_blocked=True) 記載
  - I2 (PERF-UP-02): 共有公開時の Moderator 再実行 (LLM 2 回呼び) 累積 p95 < 2.5 秒を明示
  - I3 (SEC-UP-08): LLM が 4 ドメイン以外を返す場合は allowed (U3 既存挙動踏襲)、新ドメイン追加は SILENCE_KEYWORDS の更新で同時対応
- **Improvements 3**:
  - Imp1 (TEST-UP-08): U5 PBT パターン継承 + max_examples=100 明示
  - Imp2 (§7 Infra Design): Phase A.0a で `is_blocked` grep 確認 + 未存在なら U2 patch
  - Imp3 (SEC-UP-05): 409 レスポンスに `message: "すでにこのペルソナを報告済です"` 明示

---

## Post-CONSTRUCTION 改修注記 (2026-05-19)

本ドキュメント本体は 2026-05-16 承認時の Snapshot (ultrathink full 6 fixes 適用済) を保持。

**Important / Improvements の合計 6 件の NFR 修正点は全て継続有効**。Persona anonymizer salt、UserPersonaSelection 上限 3、PersonaReport AUTO_BLOCK 閾値、共有プール匿名化レイテンシ等の NFR は不変。

### Dynamic Persona Routing 反映 (`07c1c78`)
- backend (`apps/api`) 側の Persona module には commit による変更なし
- frontend (`apps/web/src/features/persona/PersonaSelectionPage.tsx`) で 💡おすすめ badge を表示する際の `GET /v1/preferences/me` 1 回読みは既存 NFR の範囲内
- `GET /v1/personas/builtin` / `GET /v1/personas/shared` / 上限 3 制約等の NFR 数値は不変

→ U-Persona NFR Req は CONSTRUCTION 完了状態のまま継続有効。
