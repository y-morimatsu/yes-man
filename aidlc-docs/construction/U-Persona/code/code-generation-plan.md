# U-Persona — Code Generation Plan (Part 1)

**Unit**: U-Persona
**Phase**: CONSTRUCTION — Code Generation Part 1 (Planning)
**Created**: 2026-05-16
**Status**: 🟡 IN REVIEW
**Upstream**: FD (10) + NFR Req (6) + NFR Design (6) + Infra Design (5) = 累計 27 fixes

---

## 0. 位置付け

Infra Design §9 確定の Phase A.0a / A.0b + B〜F を詳細チェックボックス + 完了基準 + 動作確認 + リスクに展開。U5 と同じ Phase 構成パターン継承。

---

## 1. 全体方針

### 1.1 ファイル集計

| カテゴリ | 数 |
|---|---|
| **新規 Python (本体)** | 11 (domain/persona 7 + interface 4) |
| **変更 Python (本体)** | 4 (config + deps + main + U4 engine) |
| **U2 patch (条件付き、Phase A.0a)** | 0-2 (`Persona.is_blocked` 未存在時の models.py + Alembic 0004) |
| **U4 patch (Phase A.0b)** | 1 (engine.py + 関連で実質 3 ファイル変更、selection_repo / can_access / record_usage) |
| **新規テスト + fixture** | 9 (Unit 4 + Integration 3 placeholder + PBT 1 + init 2 + fixture 0、U4 fixture 既存に追加) |
| **変更 テスト** | 2 (test_engine.py + fixtures/decision.py) |
| **変更 ドキュメント / 設定** | 2 (`.env.example` + RUNBOOK §10) |
| **変更 CDK** | 1 (api-stack.ts) |
| **合計** | **約 30 ファイル** |

### 1.2 順序 (線形)
Phase A.0a → A.0b → B → C → D → E → F の 8 段階

### 1.3 品質基準
- AST parse OK
- import 解決
- U2-U5 既存テスト回帰なし
- U-Persona 新規テスト pass
- ruff check 通過

---

## 2. Phase A.0a: U2 `Persona.is_blocked` 確認

- [ ] **A.0a.1** `grep -n 'is_blocked' apps/api/src/yesman_api/domain/persistence/models.py` で確認
- [ ] **A.0a.2** 結果判定:
  - 既存 → patch 不要、Phase A.0b へ
  - 未存在 → 以下を実施
- [ ] **A.0a.3** (未存在時) SQLModel `Persona` に `is_blocked: bool = Field(default=False)` 追加
- [ ] **A.0a.4** (未存在時) Alembic migration 新規作成: `apps/api/alembic/versions/20260516_0001_0004_persona_is_blocked.py`
  - `revision = "0004_persona_is_blocked"`
  - `down_revision = "0003_profile_gender_preferences"`
  - upgrade: `op.add_column("personas", sa.Column("is_blocked", sa.Boolean(), nullable=False, server_default=sa.false()))`
  - downgrade: `op.drop_column("personas", "is_blocked")`
- [ ] **A.0a.5** AST parse OK

---

## 3. Phase A.0b: U4 遡及修正 5 ファイル

- [ ] **A.0b.1** `tests/fixtures/decision.py` に `mock_selection_repo_factory()` 追加 (空 selection を返す stub)
- [ ] **A.0b.2** `domain/decision/engine.py` 変更:
  - コンストラクタに `selection_repo: object | None = None` 追加 (default None で既存テスト動作)
  - `_resolve_personas(*, selected_ids, user_id)` keyword-only に変更
  - `from yesman_api.domain.persona.access import can_access` import (この時点では access.py 未作成のため Phase B 前に仮 import コメント or 後回し → Phase B 完了後に有効化)
  - selection_repo None でない場合のみ UserPersonaSelection 経由解決を実行 (None なら従来通り builtin fallback)
  - `apply_choice` 末尾で `record_usage` (best-effort try/except)
- [ ] **A.0b.3** `interface/deps.py` 変更:
  - `get_decision_engine` で `selection_repo=bundle.user_persona_selection` を inject
- [ ] **A.0b.4** `tests/unit/decision/test_engine.py` 変更:
  - `_make_engine` に `selection_repo=mock_selection_repo_factory()` 追加 (1 行)
- [ ] **A.0b.5** AST parse + 既存 U4 test 回帰なし

### 注意 (実装順序、ultrathink I1 反映)

順序変更: **Phase A.0b の前に Phase B.5 (access.py 単独) を実施**:

新順序: **A.0a → B.5 (access.py) → A.0b → B (残り B.1〜B.4, B.6, B.7, B.8) → C → D → E → F**

これにより engine.py 変更時点で `can_access` import が解決済で runtime fail なし。Phase B.5 は単独で完結 (依存なし)、 module-level 関数 1 個だけなので短時間で実装可能。

---

## 4. Phase B: domain/persona 7 ファイル (B.5 は Phase A.0b より前、ultrathink I1 反映)

### Phase B.5 — 先行 (A.0a 後、A.0b 前)
- [ ] **B.5** `domain/persona/access.py` — `can_access(persona, user_id)` (module-level、record 内フラグのみ)

### Phase B.1〜B.4, B.6〜B.8 — A.0b 後
- [ ] **B.1** `domain/persona/__init__.py` (空)
- [ ] **B.2** `domain/persona/models.py` — `ModerationVerdict` + `PersonaSummary` dataclasses
- [ ] **B.3** `domain/persona/errors.py` — `PersonaError(reason, detail)`
- [ ] **B.4** `domain/persona/anonymizer.py` — `anonymize_owner(owner_user_id, salt)` (module-level、16 文字 hash)
- [ ] **B.6** `domain/persona/constants.py` — builtin 推奨セット persona_id (将来定数化、現状は SYSTEM_USER_ID 経由で動的取得想定、コメントのみ)
- [ ] **B.7** `domain/persona/moderator.py` — `PersonaModerator` (U3 SilenceGuard 注入、LLM 不明 domain allowed)
- [ ] **B.8** `domain/persona/catalog.py` — `PersonaCatalogService` 10 メソッド:
  - create / update / delete / set_shared
  - list_my_personas / list_builtin_personas / list_shared (匿名化込み)
  - get_selection / set_selection (上限 3 + inline 検証) / reset_selection

---

## 5. Phase C: interface 4 ファイル + deps 拡張

- [ ] **C.1** `interface/http/dto/persona.py` — DTO 8 種 (PersonaResponse / PersonaCreateRequest / PersonaUpdateRequest / PersonaShareRequest / PersonaReportRequest / PersonaSelectionResponse / PersonaSelectionUpdateRequest / SharedPersonaSummaryResponse)
- [ ] **C.2** `interface/http/personas.py` — 8 endpoint (GET /me + /builtin + POST /me + PATCH /<id> + DELETE /<id> + PATCH /<id>/share + GET /shared + POST /<id>/report)
- [ ] **C.3** `interface/http/persona_selections.py` — 3 endpoint (GET/PUT/DELETE /v1/persona-selections/me)
- [ ] **C.4** `interface/deps.py` 追加:
  - `get_persona_catalog(request)` — app.state.persona_catalog
  - `get_persona_repo(bundle)` — bundle.persona
  - `get_persona_report_repo(bundle)` — bundle.persona_report

---

## 6. Phase D: AppConfig + main.py 拡張

- [ ] **D.1** `infrastructure/config.py` 変更:
  - U-Persona 3 環境変数追加 (`persona_anonymizer_salt` / `persona_report_auto_block_threshold: int = 5` / `persona_moderator_llm_timeout_seconds: float = 5.0`)
  - `validate_runtime` に「prod では `PERSONA_ANONYMIZER_SALT` 必須」追加
- [ ] **D.2** `main.py` 変更:
  - lifespan で `PersonaModerator(silence_guard=app.state.silence_guard)` 初期化
  - 但し `PersonaCatalogService` は per-request の bundle 依存 → app-wide singleton は持たず、deps.py 内で都度組み立て
  - **ultrathink I3 注記**: `PersonaCatalogService` は deps.py 内で `Depends` 経由 instantiate (per-request scope)。FastAPI の `Depends(get_bundle)` は per-request で 1 回のみ instantiate されるため、同一リクエスト内では重複生成なし。コスト < 1ms 想定で許容。Moderator は app.state singleton で共有
  - `app.state.persona_moderator` に Moderator のみ singleton で持つ
  - `app.include_router(personas_router)` + `app.include_router(persona_selections_router)` 追加

---

## 7. Phase E: テスト 8 + fixture stub 0 + U4 既存テスト更新 0 (Phase A.0b で済)

- [ ] **E.1** `tests/unit/persona/__init__.py`
- [ ] **E.2** `tests/unit/persona/test_anonymizer.py` — 同一 user 同一 ID / 異なる user 異なる ID / salt 違いで変化 (3 ケース)
- [ ] **E.3** `tests/unit/persona/test_access.py` — 4 経路 (builtin / owner / shared / blocked) × pass/fail (4 ケース)
- [ ] **E.4** `tests/unit/persona/test_catalog.py` — CRUD + 共有 + listing + selection 上限 3 + builtin_immutable + blocked_immutable + アクセス検証 (10+ ケース)
  - **ultrathink I2 注記**: `PersonaCatalogService` を **Mock Repo + Moderator stub を直接 instantiate** して test、main.py lifespan 経路に依存しない (= unit test 独立性確保)
- [ ] **E.5** `tests/unit/persona/test_moderator.py` — regex 4 ドメイン reject + LLM 不明 domain allowed + fail-closed (5 ケース)
- [ ] **E.6** `tests/integration/persona/__init__.py`
- [ ] **E.7** `tests/integration/persona/test_personas_api.py` (placeholder + TODO)
- [ ] **E.8** `tests/integration/persona/test_persona_report.py` (placeholder + TODO)
- [ ] **E.9** `tests/integration/persona/test_persona_selection.py` (placeholder + TODO)
- [ ] **E.10** `tests/property/test_catalog_invariants.py` — Hypothesis 4 不変条件 (PBT、U5 パターン継承、ultrathink Imp2 明示):
  - **(a)** `len(saved.persona_ids) <= 3` (FR-PERSONA-10)
  - **(b)** 重複なし (`len(set(persona_ids)) == len(persona_ids)`)
  - **(c)** 全 persona で `can_access(p, user_id) == True`
  - **(d)** 全 persona で `p.is_blocked == False`
  - `max_examples=100`、Mock Repo + 任意 persona_ids 列で実行

---

## 8. Phase F: ドキュメント + CDK

- [ ] **F.1** `apps/api/.env.example` に U-Persona 3 環境変数追記
- [ ] **F.2** `apps/api/RUNBOOK.md` に **§10 U-Persona** 章追記
  - 機能概要 + Custom Persona CRUD + 共有プール
  - Mock backend ローカル動作確認 (Infra Design §8 の 8 curl パターン)
  - **PersonaReport 閾値到達時の管理者対応手順** (ultrathink NFR Req I1): CLI で `is_shared=False` 降格 / `is_blocked=True` 設定
  - SLO 計測項目
- [ ] **F.3** `infra/lib/stacks/api-stack.ts` 変更:
  - environment +2 (`PERSONA_REPORT_AUTO_BLOCK_THRESHOLD` + `PERSONA_MODERATOR_LLM_TIMEOUT_SECONDS`)
  - `PersonaAnonymizerSaltSecret` 新規 (originVerifySecret / silenceHashSaltSecret と同パターン)
  - secrets ブロックに `PERSONA_ANONYMIZER_SALT: ecs.Secret.fromSecretsManager(this.personaAnonymizerSaltSecret)`
  - クラス property に追加: `public readonly personaAnonymizerSaltSecret: secretsmanager.Secret`
- [ ] **F.4** `cd infra && pnpm test -- --updateSnapshot` で snapshot 更新

---

## 9. 動作確認 (Phase D/E/F 完了後)

```bash
cd apps/api && pip install -e ".[dev]"  # 依存追加なし
cp .env.example .env  # AUTH_BACKEND=mock + LLM_PROVIDER=mock + PERSONA_ANONYMIZER_SALT=test-salt
uvicorn yesman_api.main:app --port 8000

# Infra Design §8 の 8 curl パターン (builtin / create / 自分一覧 / share / shared / 沈黙 reject / selection / report)
# 詳細は Infra Design §8 参照

pytest apps/api/tests/unit/persona apps/api/tests/property/test_catalog_invariants.py
cd infra && pnpm test -- --updateSnapshot && cdk synth
```

---

## 10. リスク

| リスク | 影響 | 対応 |
|---|---|---|
| U2 `Persona.is_blocked` が既存と思って patch skip したが実際は欠落 | catalog の `can_access` 動作不良 | Phase A.0a.1 で必ず grep + 結果記録、判定誤りを防ぐ |
| U4 engine.py の `_format_profile` の他箇所利用で `_resolve_personas` 置換漏れ | builtin fallback で動作 (= U-Persona の効果なし) | Phase A.0b.5 で `grep -n '_resolve_personas' engine.py` 全箇所確認 |
| PersonaCatalogService がリクエストスコープ生成で重い (毎回 inject) | レイテンシ増 | MVP は per-request で許容 (Moderator は singleton で重い処理を分担)、将来 lifespan singleton 検討 |
| PersonaAnonymizerSaltSecret 未設定で prod 起動 | validate_runtime fail-fast で起動拒否 (= 望む挙動) | Phase F.3 で確実に Secrets Manager 作成 |
| Alembic 0004 と U3 0003 / U5 (もし migration あれば) の順序衝突 | migration 適用失敗 | Phase A.0a.4 で `down_revision = "0003_profile_gender_preferences"` を明示確認 |
| U-Persona は U3 SilenceGuard + U4 DecisionEngine + U5 完了前提、いずれか未完了で build 不可 | 依存解決失敗 | U3 / U4 / U5 が COMPLETE であることを確認済 (state.md 検証済)、依存チェーン明示 (ultrathink Imp1 反映) |

---

## 11. 承認チェックリスト

- [x] **Phase A.0a → B.5 → A.0b → B → C → D → E → F の修正済順序** (ultrathink I1 反映)
- [x] 各 Phase の完了基準が明示
- [x] U2 patch 計画 (Phase A.0a 条件付き)
- [x] U4 遡及修正計画 (Phase A.0b 5 ファイル)
- [x] U1 CDK 修正計画 (api-stack environment +2 + Secrets Manager `PersonaAnonymizerSaltSecret`)
- [x] 動作確認手順 (Infra Design §8 の 8 curl 継承)
- [x] リスク 6 項目 + 緩和策 (U3/U4/U5 依存チェーン追加)
- [x] 全ファイル集計 (約 30 ファイル + U2 patch 0-2)
- [x] ultrathink 累計 32 件全反映の引き継ぎ (FD 10 + NFR Req 6 + NFR Design 6 + Infra Design 5 + Code Gen Plan 5)

### ultrathink レビュー (2026-05-16) 反映済 5 件
- **Important 3**:
  - I1 (§3 A.0b): Phase B.5 (access.py) を A.0b より前に実施、import 順序問題解消
  - I2 (§7 E.4): test_catalog.py は Mock Repo + Moderator stub 直接 instantiate、main.py lifespan 非依存
  - I3 (§6 D.2): PersonaCatalogService per-request instantiate コスト < 1ms 想定の根拠明示
- **Improvements 2**:
  - Imp1 (§10): リスク 6 件目 (U3 SilenceGuard + U4 DecisionEngine + U5 依存チェーン明示)
  - Imp2 (§7 E.10): PBT 4 不変条件を (a) 上限 3 / (b) 重複なし / (c) can_access / (d) blocked 除外 と具体明示

---

## Post-CONSTRUCTION 改修注記 (2026-05-19)

本 plan 本体は 2026-05-16 承認時の Snapshot (ultrathink full 5 fixes 適用済) を保持。

**Phase A.0a〜F (U2 確認 + access.py / U4 engine 遡及 / domain persona 6 / interface 4 / config + main / tests 10 / .env + RUNBOOK + api-stack) の生成計画は全て継続有効**。

### Backend (apps/api) 側の追加変更なし
- `domain/persona/` + `application/persona/` + `interface/http/personas.py` + `persona_selections.py` 配下に Post-CONSTRUCTION の commit なし
- PersonaCatalogService + PersonaModerator + PersonaReport AUTO_BLOCK 等の構成不変

### Frontend (apps/web) 側の Dynamic Routing 連携 (本 plan の scope 外、U7d で実装)
- `apps/web/src/features/persona/PersonaSelectionPage.tsx` に 💡おすすめ pink pill badge 追加 (`07c1c78`)
- `usePreference` (U5 既存 hook) との合成

→ U-Persona Code Gen Plan は backend 構成を維持、frontend Dynamic Routing UI は U7d Code Gen Plan 参照。
