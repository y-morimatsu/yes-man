# U-Persona — Infrastructure Design

**Unit**: U-Persona
**Phase**: CONSTRUCTION — Infrastructure Design
**Created**: 2026-05-16
**Status**: 🟡 IN REVIEW
**Upstream**: FD (10) + NFR Req (6) + NFR Design (6) = 累計 22 fixes

---

## 0. 位置付け

NFR Design §7 + §8 引き継ぎを実物理レイアウトに確定。U3 SilenceGuard 流用 + U4 への遡及 5 ファイル + U1 ApiStack の Secrets Manager 拡張。

---

## 1. ディレクトリ構造

```
apps/api/src/yesman_api/
├── domain/persona/                            ← (新規) 7 ファイル
│   ├── __init__.py
│   ├── models.py                              ← ModerationVerdict + PersonaSummary
│   ├── errors.py                              ← PersonaError
│   ├── anonymizer.py                          ← anonymize_owner (module-level)
│   ├── access.py                              ← can_access (module-level)
│   ├── moderator.py                           ← PersonaModerator (U3 SilenceGuard 注入)
│   ├── catalog.py                             ← PersonaCatalogService (10 メソッド)
│   └── constants.py                           ← 推奨セット 3 種の builtin id (将来定数化)
├── infrastructure/config.py                   ← (変更) 3 環境変数 + validate_runtime 拡張
├── interface/
│   ├── deps.py                                ← (変更) get_persona_catalog / get_persona_moderator + decision_engine inject
│   ├── http/
│   │   ├── personas.py                        ← (新規) 8 endpoint
│   │   ├── persona_selections.py              ← (新規) 3 endpoint (GET/PUT/DELETE)
│   │   └── dto/
│   │       └── persona.py                     ← (新規) DTO 8 種
├── main.py                                    ← (変更) PersonaModerator/Catalog 初期化 + 2 router include
└── domain/decision/engine.py                  ← (U4 遡及変更) selection_repo + _resolve_personas keyword-only + record_usage
```

### 1.1 集計

| カテゴリ | 数 |
|---|---|
| **新規 Python (本体)** | 11 (domain/persona 7 + interface 4) |
| **変更 Python (本体)** | 4 (config + deps + main + U4 engine) |
| **U2 patch (条件付き)** | 0-2 (`Persona.is_blocked` フィールド未存在なら追加、ultrathink NFR Req Imp2) |
| **新規テスト** | 8 (Unit 4 + Integration 3 + PBT 1) |
| **変更 テスト** | 2 (test_engine.py + fixtures/decision.py、U4 遡及) |
| **変更 ドキュメント / 設定** | 2 (`.env.example` + RUNBOOK §10) |
| **変更 CDK** | 1 (api-stack.ts: 環境変数 + Secrets Manager) |
| **合計** | **約 28-30 ファイル** |

---

## 2. Phase A.0a: U2 `Persona.is_blocked` 確認 (ultrathink NFR Req Imp2 反映)

```bash
grep -n "is_blocked" apps/api/src/yesman_api/domain/persistence/models.py
```

- 既存なら patch 不要 (Phase A.0a 完了)
- 未存在なら **U2 patch**:
  - SQLModel `Persona` に `is_blocked: bool = Field(default=False)` 追加
  - Alembic migration 新規: `ALTER TABLE personas ADD COLUMN is_blocked BOOLEAN NOT NULL DEFAULT FALSE`
  - migration 番号: U3 の 0003 後 → `0004_persona_is_blocked`

---

## 3. Phase A.0b: U4 遡及修正 5 ファイル

NFR Design §7 確定の 5 ファイル変更:

| ファイル | 変更内容 |
|---|---|
| `domain/decision/engine.py` | `selection_repo: UserPersonaSelectionRepository` 引数追加 + `_resolve_personas(*, selected_ids, user_id)` keyword-only + `selection.persona_ids` → UUID 変換 + `can_access` import + `apply_choice` で `record_usage` (best-effort try/except) |
| `interface/deps.py` | `get_decision_engine` で `selection_repo=bundle.user_persona_selection` を inject |
| `main.py` | 変更なし (lifespan は bundle 経由) |
| `tests/unit/decision/test_engine.py` | `_make_engine` ヘルパーに `selection_repo` 引数追加 (default で stub) |
| `tests/fixtures/decision.py` | `mock_selection_repo_factory()` stub 追加 |

---

## 4. U1 (CDK) 遡及修正計画

### 4.1 ApiStack environment 追加

```typescript
environment: {
  // 既存 ... (U2 → U3 → U4 → U5)

  // === U-Persona (NFR Req §6) ===
  PERSONA_REPORT_AUTO_BLOCK_THRESHOLD: '5',
  PERSONA_MODERATOR_LLM_TIMEOUT_SECONDS: '5.0',
  // PERSONA_ANONYMIZER_SALT は secrets ブロック経由 (下記)
},
```

### 4.2 Secrets Manager `PersonaAnonymizerSaltSecret` の生成

ApiStack 内で生成 (U4 SilenceHashSaltSecret と同パターン、ultrathink Imp3 継承):

```typescript
this.personaAnonymizerSaltSecret = new secretsmanager.Secret(this, 'PersonaAnonymizerSaltSecret', {
  secretName: `yesman/${ctx.envName}/persona-anonymizer-salt`,
  description: 'Salt for Persona owner anonymization (NFR-PRIV-06 / SEC-UP-06)',
  encryptionKey: secretsKey,
  generateSecretString: {
    passwordLength: 32,
    excludePunctuation: false,
  },
});
```

ApiStack の `secrets:` ブロックに追加:
```typescript
secrets: {
  // 既存 ...
  PERSONA_ANONYMIZER_SALT: ecs.Secret.fromSecretsManager(this.personaAnonymizerSaltSecret),
},
```

### 4.3 IAM
- 既存 grantRead 等の追加実装不要 (ecs.Secret.fromSecretsManager で自動 grant)

---

## 5. `.env.example` 追記 (U-Persona 3 環境変数)

```dotenv

# === U-Persona (3 個、Infrastructure Design §4) ===
# PERSONA_ANONYMIZER_SALT は prod では Secrets Manager 経由 (環境変数直書き禁止、SEC-UP-06)
# PERSONA_ANONYMIZER_SALT=
PERSONA_REPORT_AUTO_BLOCK_THRESHOLD=5
PERSONA_MODERATOR_LLM_TIMEOUT_SECONDS=5.0
```

---

## 6. テストファイル一覧 (新規 8 + 変更 2)

| ファイル | 種別 | 対象 |
|---|---|---|
| `tests/unit/persona/__init__.py` | - | - |
| `tests/unit/persona/test_anonymizer.py` | unit | 同一 user 同一 ID / 異なる user 異なる ID / salt 違いで変化 |
| `tests/unit/persona/test_access.py` | unit | can_access の 4 経路 (builtin / owner / shared / blocked) |
| `tests/unit/persona/test_catalog.py` | unit | CRUD + 共有 + listing + selection 上限 3 + builtin_immutable + blocked_immutable + アクセス検証 |
| `tests/unit/persona/test_moderator.py` | unit | regex 4 ドメイン pass + reject + LLM 不明 domain allowed + fail-closed |
| `tests/integration/persona/__init__.py` | - | - |
| `tests/integration/persona/test_personas_api.py` | integration | CRUD + 共有 ON/OFF + listing (placeholder + TODO) |
| `tests/integration/persona/test_persona_report.py` | integration | 重複報告 409 + message (placeholder) |
| `tests/integration/persona/test_persona_selection.py` | integration | GET/PUT/DELETE + builtin fallback (placeholder) |
| `tests/property/test_catalog_invariants.py` | PBT | 任意 persona_ids 列 → set_selection 4 不変条件 |

### 変更テスト 2
- `tests/unit/decision/test_engine.py` (U4 遡及): `_make_engine` に `selection_repo=mock_selection_repo_factory()`
- `tests/fixtures/decision.py` (U4 遡及): `mock_selection_repo_factory()` stub

---

## 7. ファイル依存グラフ

```mermaid
graph TD
    subgraph domain[domain/persona/]
        DM[models.py]
        DE[errors.py]
        DA[anonymizer.py]
        DAC[access.py]
        DMO[moderator.py]
        DC[catalog.py]
    end

    subgraph u3[U3 (流用)]
        SG[SilenceGuard]
    end

    subgraph u2[U2 (既存 Repository)]
        PR[PersonaRepository]
        PRR[PersonaReportRepository]
        UPS[UserPersonaSelectionRepository]
    end

    subgraph u4[U4 (遡及変更)]
        ENG[engine.py<br/>★ selection_repo + _resolve_personas + record_usage]
    end

    subgraph iface[interface/]
        DEPS[deps.py<br/>★ get_persona_*]
        PH[http/personas.py]
        PSH[http/persona_selections.py]
        PDTO[http/dto/persona.py]
    end

    MAIN[main.py<br/>★ PersonaModerator/Catalog 初期化]

    DA --> DC
    DAC --> DC
    DAC --> ENG
    DM --> DC
    DE --> DC
    SG --> DMO
    DMO --> DC
    PR --> DC
    UPS --> DC
    PR --> ENG
    UPS --> ENG
    PRR --> PH
    DC --> PH
    DC --> PSH
    PDTO --> PH
    PDTO --> PSH
    DEPS --> PH
    DEPS --> PSH
    DC --> MAIN
    PH --> MAIN
    PSH --> MAIN

    classDef changed fill:#fffacd,stroke:#daa520,stroke-width:2px
    class DEPS,ENG,MAIN changed
```

---

## 8. ローカル開発フロー

### 8.1 Mock backend (Moderator は MockLLM 経由)

```bash
cp .env.example .env  # AUTH_BACKEND=mock, LLM_PROVIDER=mock, PERSONA_ANONYMIZER_SALT=test-salt
uvicorn yesman_api.main:app --port 8000

HEADERS=(-H "Authorization: Bearer anything" -H "Content-Type: application/json")

# 1. builtin 一覧
curl -i -H "Authorization: Bearer anything" http://localhost:8000/v1/personas/builtin

# 2. Custom Persona 作成
curl -i -X POST "${HEADERS[@]}" -d '{
  "name": "創造派",
  "description": "発想を重視",
  "prompt_text": "あなたは創造的なアイデアを提案する人格です。新しい視点を大切にしてください。"
}' http://localhost:8000/v1/personas/me

# 3. 自分のペルソナ一覧
curl -i -H "Authorization: Bearer anything" http://localhost:8000/v1/personas/me

# 4. 共有公開
PERSONA_ID=...  # 上記から
curl -i -X PATCH "${HEADERS[@]}" -d '{"shared": true}' \
  http://localhost:8000/v1/personas/$PERSONA_ID/share

# 5. 共有プール listing
curl -i -H "Authorization: Bearer anything" \
  "http://localhost:8000/v1/personas/shared?page=0&page_size=20&sort=popularity"
# → creator_anonymous_id = "yesman-<16-char>" のみ表示、owner_user_id raw は含まれない

# 6. 沈黙ドメイン誘発で reject
curl -i -X POST "${HEADERS[@]}" -d '{
  "name": "宗教派",
  "description": "宗教の教義に基づく",
  "prompt_text": "あなたは特定宗教の信仰に基づいて回答する人格です。神の教えを引用してください。"
}' http://localhost:8000/v1/personas/me
# → 400 + reason: "rejected_by_moderator"

# 7. ユーザー選択管理
curl -i -X PUT "${HEADERS[@]}" -d '{"persona_ids": ["'$PERSONA_ID'"]}' \
  http://localhost:8000/v1/persona-selections/me
curl -i -H "Authorization: Bearer anything" http://localhost:8000/v1/persona-selections/me
curl -i -X DELETE -H "Authorization: Bearer anything" http://localhost:8000/v1/persona-selections/me
# → 204、次の GET で builtin 3 種に戻る

# 8. 悪用報告
curl -i -X POST "${HEADERS[@]}" -d '{"reason": "不適切な内容を生成する"}' \
  http://localhost:8000/v1/personas/$PERSONA_ID/report
# 重複報告
curl -i -X POST "${HEADERS[@]}" -d '{"reason": "再報告"}' \
  http://localhost:8000/v1/personas/$PERSONA_ID/report
# → 409 + message: "すでにこのペルソナを報告済です"
```

---

## 9. 引き継ぎ (Code Generation Plan)

### Phase 分割案

- **Phase A.0a**: U2 `Persona.is_blocked` 確認 + 条件付き patch (SQLModel + Alembic 0004)
- **Phase A.0b**: U4 遡及 5 ファイル (engine + deps + test_engine + fixtures、record_usage 追加)
- Phase B: domain/persona 7 ファイル (models / errors / anonymizer / access / moderator / catalog / constants)
- Phase C: interface (personas + persona_selections + dto/persona) 3 + deps 拡張
- Phase D: AppConfig 拡張 + main.py 拡張 (PersonaModerator/Catalog 初期化 + 2 router include)
- Phase E: テスト 8 + fixtures (anonymizer/access/catalog/moderator + integration 3 placeholder + PBT 1)
- Phase F: ドキュメント + CDK (.env + RUNBOOK §10 + api-stack: environment + Secrets Manager)

### PR 集約方針
- 推奨 1 PR (約 28-30 ファイル + U1 patch + 場合により U2 patch)
- オプション 2 PR (基盤 + interface)

---

## 10. 承認チェックリスト

- [x] ディレクトリ構造 (domain/persona 新規 1)
- [x] 集計 (新規 11 + 変更 4 + テスト 8 + 変更 2 + ドキュメント 2 + CDK 1 = 約 28 ファイル)
- [x] Phase A.0a U2 is_blocked 確認 + 条件付き patch
- [x] Phase A.0b U4 遡及 5 ファイル
- [x] U1 CDK 修正 (environment +2 + Secrets Manager `PersonaAnonymizerSaltSecret`)
- [x] .env.example 3 環境変数追記
- [x] テスト 8 + fixture stub 2 件追加
- [x] ファイル依存グラフ (Mermaid)
- [x] ローカル開発フロー 8 curl パターン
- [x] Code Generation Plan への引き継ぎ (Phase A.0a/A.0b + B-F の 8 段階)

---

## Post-CONSTRUCTION 改修注記 (2026-05-19)

本ドキュメント本体は 2026-05-16 承認時の Snapshot (ultrathink full 5 fixes 適用済) を保持。

**Important 3 / Improvements 2 の合計 5 件の Infra Design 修正点は全て継続有効**。PersonaAnonymizerSaltSecret、env vars (ANONYMIZER_PEPPER 等)、Built-in personas seed migration の Design は不変。

→ U-Persona Infrastructure Design は CONSTRUCTION 完了状態のまま継続有効。Post-CONSTRUCTION 期間中、CDK / Secret / IAM の変更なし。
