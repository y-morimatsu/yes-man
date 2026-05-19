# U7c / api-client — Code Generation Plan (Part 1)

**Unit**: U7c
**Phase**: CONSTRUCTION — Code Generation Part 1 (Planning)
**Created**: 2026-05-16
**Status**: ✅ APPROVED 2026-05-16 (ultrathink full / 6 fixes applied: Critical 1 + Important 3 + Improvements 2)
**Upstream**: FD 7 + NFR Req 5 + NFR Design 5 + Infra Design 5 + Code Gen Plan 6 = 累計 28 fixes

---

## 0. 位置付け

NFR Design §1 + Infra Design §3 で確定した「~25 ファイル / ~750 LOC / runtime ~565 LOC / dist ~4.2 KB gzip」構成を、**Phase A-G の 7 段階で実装する詳細計画** に展開する。U6 / U-Persona と同じ Phase 構成パターン継承。

---

## 1. 全体方針

### 1.1 ファイル集計

| カテゴリ | 数 |
|---|---|
| **新規 monorepo 基盤** | 2 (pnpm-workspace.yaml + root package.json) |
| **新規 apps/api スクリプト** | 1 (dump_openapi.py) |
| **生成 apps/api/openapi.json** | 1 (dump 出力) |
| **新規 packages/api-client 設定** | 5 (package.json + tsconfig + vitest config + eslintrc + gitignore) |
| **新規 packages/api-client/src** | 12 (index + client + auth + errors + sse + 7 modules + modules/index + generated/schema) |
| **新規 packages/api-client/tests** | 5+ (client + auth + errors + sse + modules/*) |
| **合計** | **約 26 ファイル + 生成物** |

### 1.2 順序 (線形、ultrathink C1 + I2 + I3 反映)

Phase **A.0** → A → B → C → D → E → F → G の 8 段階 (A.0 pre-flight 追加)。

**依存チェーン**:
- A.0 (pre-flight check) → A (monorepo 基盤)
- A → B (api scripts) → C (api-client 設定) → D (型生成)
- D ⇒ E (module files、`import type` で論理依存)、ただし **type-check は G.1 で初回検証** (E と D は同時着手可、ファイル間 compile 順依存なし、ultrathink I3)
- E → F (tests) → G (build + size + lint)

### 1.3 品質基準

- TypeScript `tsc --noEmit` 通過
- `pnpm run test` 全 pass
- `pnpm run lint` 通過
- `pnpm run size` 通過 (5 KB gzip 上限)
- `pnpm run build` 成功

---

## 2. Phase A.0: Pre-flight check (ultrathink C1 追加)

- [ ] **A.0.1** 現状の repo root を確認: `ls -la /Users/morimatsu/lab/ai-dlc-hackathon/` で **`package.json` / `pnpm-workspace.yaml` / `pnpm-lock.yaml` / `packages/` が不在** であることを確認
- [ ] **A.0.2** 既存ファイルあれば内容確認、後続 Phase A で **merge** か **新規作成** を判断:
  - root `package.json` 存在 → A.2 は新規でなく追記
  - `pnpm-workspace.yaml` 存在 → A.1 で workspaces 追加のみ
  - `pnpm-lock.yaml` 存在 → A 完了後 `pnpm install` で更新
  - `packages/` 存在 → 中身確認、他 unit が先行作成している可能性

## 3. Phase A: Monorepo 基盤 (3 ファイル)

- [ ] **A.1** `pnpm-workspace.yaml` 新規作成 (apps/* + packages/*) — A.0.2 で既存確認
- [ ] **A.2** root `package.json` 更新 or 新規作成 (build / test / lint / openapi:dump / openapi:generate scripts) — A.0.2 で既存確認
- [ ] **A.3** root `.gitignore` に `dist/` `node_modules/` 追加 (既存なら確認のみ)

### 2.1 検証

```bash
pnpm install  # 既存のプロジェクトに影響なしを確認
ls packages/api-client/  # まだ存在しない、Phase D で作る
```

---

## 3. Phase B: dump_openapi.py + 初回 openapi.json 生成

- [ ] **B.1** `apps/api/scripts/__init__.py` 空 (もし無ければ)
- [ ] **B.2** `apps/api/scripts/dump_openapi.py` 新規作成 (Infra Design §2、`os.environ.setdefault` 7 件で validate skip)
- [ ] **B.3** ローカル実行: `cd apps/api && python scripts/dump_openapi.py`
- [ ] **B.4** `apps/api/openapi.json` を git commit (~50-100 KB JSON)
- [ ] **B.5** 出力サイズ確認 (`ls -lh apps/api/openapi.json`)

### 3.1 受入

- `openapi.json` 内に全 endpoint (profile / decision / score / preference / persona / voice) が含まれる
- `components.schemas` に DTO 型が定義される
- AST parse OK (dump_openapi.py)

---

## 4. Phase C: packages/api-client 設定 (5 ファイル)

- [ ] **C.1** `packages/api-client/package.json` 新規 (NFR Design §3 通り、deps=空、size-limit 設定込、**`engines.node: ">=20"` 明示 (ultrathink Imp1)**)
- [ ] **C.2** `packages/api-client/tsconfig.json` (strict + verbatimModuleSyntax + noUncheckedIndexedAccess)
- [ ] **C.3** `packages/api-client/vitest.config.ts` (msw v2 setupServer 設定)
- [ ] **C.4** `packages/api-client/.eslintrc.cjs` (consistent-type-imports)
- [ ] **C.5** `packages/api-client/.gitignore` (`dist/` `node_modules/`)

### 4.1 検証

```bash
cd packages/api-client
pnpm install  # workspace 認識確認
ls dist/  # まだない (Phase G で build)
```

---

## 5. Phase D: 型生成 (1 ファイル、auto-generated、ultrathink I2: Phase B 完了前提)

**前提**: Phase B 完了 (`apps/api/openapi.json` 存在 + commit 済)。

- [ ] **D.0** `apps/api/openapi.json` の存在確認 (Phase B 完了の確認)
- [ ] **D.1** `pnpm --filter @yesman/api-client run generate` 実行
- [ ] **D.2** `src/generated/schema.ts` (~50-100 KB の型定義ファイル) 生成
- [ ] **D.3** git commit (drift 検知のため commit 必須)

### 5.1 期待出力 (一部抜粋)

```typescript
// src/generated/schema.ts (auto-generated)
export interface paths {
  "/v1/profiles/me": {
    get: operations["get_my_profile_v1_profiles_me_get"];
    patch: operations["update_my_profile_v1_profiles_me_patch"];
    delete: operations["delete_my_profile_v1_profiles_me_delete"];
  };
  // ... 全 endpoint
}

export interface components {
  schemas: {
    DecisionRequestDTO: {
      user_input: string;
      selected_persona_ids?: string[] | null;
    };
    // ... 全 DTO
  };
}

export interface operations { ... }
```

---

## 6. Phase E: src/ runtime ファイル (12 ファイル、ultrathink I3: Phase D と並行作業可)

**注**: Phase E のファイルは `import type { components } from "../generated/schema"` で **論理依存**するが、`tsc` の compile order 依存はなし。Phase D と E は同時着手可能。**初回 type-check は G.1 で実行**、その時点で D 完了が必須。

### Phase E.1: 基盤
- [ ] **E.1** `src/auth.ts` — TokenProvider interface (NFR Design §4.1)
- [ ] **E.2** `src/errors.ts` — ApiError + KnownApiErrorReason (NFR Design §5、network_error/request_aborted 含む)
- [ ] **E.3** `src/sse.ts` — DecisionStream + parseSseChunk (NFR Design §6、reader.cancel() finally)
- [ ] **E.4** `src/client.ts` — YesmanApiClient + request + validateBaseUrl (NFR Design §4.2 + §8)

### Phase E.2: modules
- [ ] **E.5** `src/modules/profiles.ts` — GET/PATCH/DELETE /v1/profiles/me
- [ ] **E.6** `src/modules/decisions.ts` — request + streamRequest + choose + getNudge
- [ ] **E.7** `src/modules/scores.ts` — GET /v1/scores/me
- [ ] **E.8** `src/modules/preferences.ts` — GET/PATCH/DELETE /v1/preferences/me
- [ ] **E.9** `src/modules/personas.ts` — list_my + list_builtin + list_shared + create + update + delete + share + report
- [ ] **E.10** `src/modules/persona-selections.ts` — GET/PUT/DELETE /v1/persona-selections/me
- [ ] **E.11** `src/modules/voice.ts` — getConfig + tts + stt
- [ ] **E.12** `src/modules/index.ts` — 7 module re-export

### Phase E.3: entry
- [ ] **E.13** `src/index.ts` — public exports (YesmanApiClient + ApiError + DecisionStream + types + interfaces)

---

## 7. Phase F: tests/ (7 ファイル、ultrathink Imp2 で 3 module test)

- [ ] **F.1** `tests/client.test.ts` — YesmanApiClient request 経路 (auth header / status 分岐 / network_error / 401 refresh + retry / validateBaseUrl)
- [ ] **F.2** `tests/auth.test.ts` — TokenProvider stub + undefined token + refresh 動作
- [ ] **F.3** `tests/errors.test.ts` — ApiError.from で Pydantic 422 / custom 422 / 401 / 403 / 500、`is()` メソッド
- [ ] **F.4** `tests/sse.test.ts` — parseSseChunk multi-line + DecisionStream events() (ReadableStream + msw v2 SSE response 模擬)
- [ ] **F.5** `tests/modules/personas.test.ts` (ultrathink Imp2) — 8 endpoint smoke test (list_my / list_builtin / list_shared / create / update / delete / share / report の path/method/body 整合)
- [ ] **F.6** `tests/modules/decisions.test.ts` (ultrathink Imp2) — request / choose / getNudge / streamRequest 主要 path test
- [ ] **F.7** `tests/modules/voice.test.ts` (ultrathink Imp2) — getConfig / tts / stt multipart + 409 client_only_backend
- [ ] **F.8** `tests/setup.ts` — msw v2 setupServer (ultrathink I1: setupFiles で参照)

### 7.1 msw v2 setup (ultrathink I1: setupFiles 採用)

```typescript
// tests/setup.ts (vitest.config の setupFiles で参照)
import { afterAll, afterEach, beforeAll } from "vitest";
import { setupServer } from "msw/node";
export const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

```typescript
// vitest.config.ts (Phase C.3 で作成)
import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    setupFiles: ["./tests/setup.ts"],  // ← ultrathink I1: setupFiles (each worker)
    environment: "node",
  },
});
```

**`setupFiles` vs `globalSetup`** (ultrathink I1):
- `setupFiles`: 各 test worker で実行、msw handler の test 間 reset に必要
- `globalSetup`: 全体で 1 回、DB seed 等の用途、msw には不適

profiles/scores/preferences/persona-selections の test は **同パターンで省略**、必要に応じて U7d Features 開発時に追加 (MVP では 3 主要 module で coverage 確保)。

---

## 8. Phase G: build + size-limit + lint 検証

- [ ] **G.1** `pnpm --filter @yesman/api-client build` (tsc → dist/)
- [ ] **G.2** `pnpm --filter @yesman/api-client lint` (eslint pass)
- [ ] **G.3** `pnpm --filter @yesman/api-client test` (vitest pass)
- [ ] **G.4** `pnpm --filter @yesman/api-client size` (size-limit < 5 KB gzip)
- [ ] **G.5** `apps/web` で `import { YesmanApiClient } from "@yesman/api-client"` が型推論されることを確認 (U7a 開始準備)

---

## 9. 動作確認 (Phase G 完了後)

```bash
pnpm install
pnpm run openapi:dump
pnpm run openapi:generate
pnpm --filter @yesman/api-client build
pnpm --filter @yesman/api-client test
pnpm --filter @yesman/api-client size
# → 全 pass、dist/index.js gzip ~4 KB
```

---

## 10. リスク

| リスク | 影響 | 対応 |
|---|---|---|
| openapi.json 出力の安定性 (Pydantic v2 順序、operation_id 命名) | drift CI が頻繁に fail | `sort_keys=True` で順序差分排除、operation_id を FastAPI 標準命名で固定 |
| pnpm workspace の symlink 解決失敗 (一部 IDE) | apps/web から import 不可 | `pnpm install --shamefully-hoist` fallback、IDE 別 README |
| msw v2 の TypeScript 互換 (ts 5.4 + esm) | テスト fail | msw 2.0.x lock、`@types/node` バージョン整合 |
| size-limit が NodeJS v20 で動作しない | CI fail | `@size-limit/preset-small-lib` 11+ で対応、Node 20 公式サポート |
| openapi-typescript v7 → v8 メジャー変更 | 型生成出力差異 | lock version 固定、メジャーアップは別 PR |

---

## 11. 承認チェックリスト

- [x] Phase A.0 (pre-flight) → A → B → C → D → E → F → G の 8 段階順序 (ultrathink C1)
- [x] 約 28 ファイル (Phase A.0 pre-flight + 3 module test 追加で 26 → 28、ultrathink Imp2)
- [x] U2-U6 endpoint 全て module カバー (7 module)
- [x] tests 7 ファイル + setup.ts (msw v2、setupFiles 採用、ultrathink I1 + Imp2)
- [x] Phase D 依存関係明示 (Phase B 完了前提、ultrathink I2)
- [x] Phase D ⇄ E 並行作業可、type-check は G.1 で初回検証 (ultrathink I3)
- [x] `engines.node: ">=20"` 明示 (ultrathink Imp1)
- [x] CI workflow 設計 (Infra Design §4.1 で完成済)
- [x] 既存 apps/api / aidlc-docs に影響なし (新規 monorepo 基盤のみ)
- [x] ultrathink 全 6 件適用 (Critical 1 + Important 3 + Improvements 2)

## 12. ultrathink 適用ログ (2026-05-16)

### Critical 1
- **C1** (§2): Phase A.0 pre-flight check 追加、root の `package.json` / `pnpm-workspace.yaml` / `packages/` 不在確認、既存ファイル merge / 新規 / skip 判断

### Important 3
- **I1** (§7.1): vitest `setupFiles` (each worker) を採用、`globalSetup` (1 回) は msw 用途で不適切と明示、`tests/setup.ts` ファイル + `vitest.config.ts` の `setupFiles` 参照
- **I2** (§5): Phase D は Phase B 完了 (openapi.json commit 済) 前提、D.0 で存在確認 step 追加
- **I3** (§6): Phase D ⇄ E は論理依存だが compile order 非依存、並行作業可能、初回 type-check は G.1 で実施

### Improvements 2
- **Imp1** (§4 C.1): `engines.node: ">=20"` を package.json に明示、Web Streams API Node 18 互換性問題回避
- **Imp2** (§7): test module を 1 → 3 に拡張 (personas / decisions / voice、主要 endpoint カバー)、profiles/scores/preferences/persona-selections は U7d 開発時に追加可能

---

## Post-CONSTRUCTION 改修注記 (2026-05-17 〜 2026-05-19)

本 plan 本体は 2026-05-16 承認時の Snapshot (ultrathink full 6 fixes 適用済) を保持。

**Phase A.0〜G (monorepo 基盤 / dump_openapi.py + placeholder / api-client 設定 5 / generated schema placeholder / src runtime 12 / tests 8 / JSON+YAML 構文検証) の生成計画は全て継続有効**。

### Post-CONSTRUCTION で変更されたファイル
| ファイル | commit | 変更内容 |
|---|---|---|
| `packages/api-client/src/generated/schema.ts` | `2400f45` | `ScoreResponse.history: ScoreHistoryPoint[]` 追加に伴い `dump_openapi.py` → `openapi-typescript` chain で再生成 |
| `packages/api-client/src/client.ts` | `775f6a5` | `body instanceof FormData` 判定で `Content-Type` header を strip (browser 自動付与に委譲) |
| `packages/api-client/src/modules/voice.ts` | `775f6a5` | `stt(audio: Blob)` から手動 `Content-Type: 'multipart/form-data'` 削除 |

7 module (`decisions, persona-selections, personas, preferences, profiles, scores, voice`) の構成不変。TokenProvider / ApiError discriminated union / DecisionStream SSE wrapper も不変。msw v2 test 構成も不変。

→ U7c Code Gen Plan は 29 ファイル構成を維持、schema 自動再生成 + FormData fix の 2 件のみ。
