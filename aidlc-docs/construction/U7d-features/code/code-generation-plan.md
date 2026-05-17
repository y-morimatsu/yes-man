# U7d / features — Code Generation Plan (Part 1)

**Unit**: U7d
**Phase**: CONSTRUCTION — Code Generation Part 1 (Planning)
**Created**: 2026-05-16
**Status**: ✅ APPROVED 2026-05-16 (ultrathink full / 5 fixes applied: Important 3 + Improvements 2)
**Upstream**: FD 7 + NFR Req 7 + NFR Design 5 + Infra Design 5 + Code Gen Plan 5 = 累計 29 fixes

---

## 0. 位置付け

NFR Design §1 + Infra Design で確定した「QueryProvider + manualChunks + 5 feature page + reducer.ts + scoreLevel.ts + strings.ts」構成を、Phase A-G の 7 段階で実装する詳細計画に展開する。

---

## 1. 全体方針

### 1.1 ファイル集計

| カテゴリ | 数 |
|---|---|
| **新規 shell** | 1 (QueryProvider.tsx) |
| **変更 shell** | 1 (routes.tsx に新 5 path) |
| **変更 entry** | 1 (App.tsx に QueryProvider 追加) |
| **新規 vite.config + package.json 変更** | 2 (manualChunks + size-limit + rollup-plugin-visualizer + react-query deps) |
| **新規 features/decision** | 7 (DecisionPage + DecisionResult + NudgeBanner + reducer + useDecisionStream + useDecision + strings) |
| **新規 features/persona** | 5 (PersonaListPage + PersonaCreateModal + PersonaSelectionPage + usePersona + strings) |
| **新規 features/score** | 4 (ScorePage + useScore + scoreLevel + strings) |
| **新規 features/preference** | 3 (PreferencePage + usePreference + strings) |
| **新規 features/voice** | 4 (useVoiceConfig + useVoiceInput + VoiceMicInput + strings) |
| **変更 features/home + profile** | 2 (placeholder を完成版へ) |
| **新規 tests** | 8 (reducer + scoreLevel pure function + 6 hook/page integration) |
| **合計** | **約 38 ファイル** |

### 1.2 順序 (線形)

Phase A.0 (pre-flight) → A (deps + config 4) → B (shell 1 + entry 1 + routes 1) → C (features/voice + score 4+4 — 他 features の依存源) → D (features/decision 7 + persona 5 + preference 3) → E (home/profile 完成版 2) → F (tests 8) → G (verify) の 8 段階。

### 1.3 Phase 内依存図 (ultrathink I1)

```
A (deps/config) ─▶ B (shell QueryProvider + routes)
                     │
                     ▼
                   C.1 voice (useVoiceConfig/Input/VoiceMicInput)
                     │
                     ├──▶ C.2 score (scoreLevel + useScore + ScorePage)
                     │
                     ▼
                   D.1 decision
                     ├─ reducer.ts ◀ Phase F tests/reducer.test.ts (pure fn)
                     ├─ useDecisionStream (callbacks useRef)
                     ├─ useDecision (mutation + nudge polling)
                     ├─ DecisionPage (useReducer + voice import) ◀ voice 依存
                     ├─ DecisionResult (ChoiceButtons)
                     └─ NudgeBanner
                     │
                     ├──▶ D.2 persona (usePersona + 3 page)
                     ├──▶ D.3 preference (usePreference + PreferencePage)
                     │
                     ▼
                   E (home + profile 完成版)
                     │
                     ▼
                   F (tests) + G (verify)
```

**重要依存**:
- DecisionPage (D.7) は `VoiceMicInput` (C.3) を import → Phase C 完了が D.7 必要条件
- score (C.6 useScore) は decision の onSuccess invalidateQueries で更新される (D.4 で参照)
- 各 page は QueryProvider (B.1) + ApiProvider (U7a) 配下で動作

### 1.3 品質基準

- TypeScript `tsc --noEmit` 通過
- `pnpm test` 全 pass + coverage 70%/60%
- `pnpm run lint` 通過
- `pnpm build` 成功
- `pnpm run size` 通過 (main < 250 KB / shared chunks 別閾値)

---

## 2. Phase A.0: Pre-flight check

- [ ] **A.0.1** `ls apps/web/src/features/` で U7a placeholder 4 ファイル (HomePage / SignIn / Callback / Profile) 存在確認
- [ ] **A.0.2** `apps/web/package.json` に `@tanstack/react-query` 未存在を確認

---

## 3. Phase A: deps + Vite config 4 ファイル変更

- [ ] **A.1** `apps/web/package.json` 変更:
  - `dependencies` に `@tanstack/react-query: ^5.0.0` 追加
  - `devDependencies` に `@tanstack/react-query-devtools: ^5.0.0` + `rollup-plugin-visualizer: ^5.0.0` + `size-limit: ^11.0.0` + **`@size-limit/preset-app: ^11.0.0`** (ultrathink I3: library ではなく app preset、import+execution+parser 計測) 追加
  - `size-limit` 設定追加 (NFR Design §3)
  - `scripts` に `"size": "size-limit"` 追加
- [ ] **A.2** `apps/web/vite.config.ts` 変更:
  - `rollupOptions.output.manualChunks` 追加 (react-vendor / tanstack-query / aws-amplify)
  - `visualizer()` plugin 追加 (stats.html 出力)

---

## 4. Phase B: shell QueryProvider + App.tsx + routes 3 ファイル

- [ ] **B.1** `apps/web/src/shell/QueryProvider.tsx` 新規 (NFR Design §5、per-Provider instance + DevTools dev only)
- [ ] **B.2** `apps/web/src/App.tsx` 変更 (Provider stack に QueryProvider 追加、順序コメント)
- [ ] **B.3** `apps/web/src/shell/routes.tsx` 変更 (新 5 path 追加: decision / personas / personas/selection / score / preferences)

---

## 5. Phase C: features/voice 4 + features/score 4 = 8 ファイル (他 features の依存元)

### Phase C.1: features/voice (decision page から依存)

- [ ] **C.1** `src/features/voice/useVoiceConfig.ts` (React Query 1h cache)
- [ ] **C.2** `src/features/voice/useVoiceInput.ts` (MediaRecorder + STT API)
- [ ] **C.3** `src/features/voice/VoiceMicInput.tsx` (VoiceMicButton + state + onTranscript)
- [ ] **C.4** `src/features/voice/strings.ts`

### Phase C.2: features/score (pure function 含む、test 容易)

- [ ] **C.5** `src/features/score/scoreLevel.ts` (pure function)
- [ ] **C.6** `src/features/score/useScore.ts` (React Query)
- [ ] **C.7** `src/features/score/ScorePage.tsx` (threshold UI)
- [ ] **C.8** `src/features/score/strings.ts`

---

## 6. Phase D: features/decision 7 + persona 5 + preference 3 = 15 ファイル

### Phase D.1: features/decision (state machine 含む)

- [ ] **D.1** `src/features/decision/reducer.ts` (pure function + exhaustive check)
- [ ] **D.2** `src/features/decision/strings.ts`
- [ ] **D.3** `src/features/decision/useDecisionStream.ts` (useRef callbacks pattern)
- [ ] **D.4** `src/features/decision/useDecision.ts` (mutation + nudge polling)
- [ ] **D.5** `src/features/decision/DecisionResult.tsx` (utterances + ChoiceButtons)
- [ ] **D.6** `src/features/decision/NudgeBanner.tsx` (nudge polling 表示)
- [ ] **D.7** `src/features/decision/DecisionPage.tsx` (useReducer + voice + ChoiceButtons 統合)

### Phase D.2: features/persona

- [ ] **D.8** `src/features/persona/usePersona.ts` (list_my + list_shared + create + selection)
- [ ] **D.9** `src/features/persona/strings.ts`
- [ ] **D.10** `src/features/persona/PersonaCreateModal.tsx` (form + rejected_by_moderator handling)
- [ ] **D.11** `src/features/persona/PersonaSelectionPage.tsx` (上限 3 ガード)
- [ ] **D.12** `src/features/persona/PersonaListPage.tsx` (own/shared tabs + create modal)

### Phase D.3: features/preference

- [ ] **D.13** `src/features/preference/usePreference.ts` (get + reset)
- [ ] **D.14** `src/features/preference/strings.ts`
- [ ] **D.15** `src/features/preference/PreferencePage.tsx` (view + reset confirm)

---

## 7. Phase E: home + profile 完成版 2 ファイル変更

- [ ] **E.1** `src/features/home/HomePage.tsx` 変更 (U7a placeholder → nav links + 動的 score badge etc.)
- [ ] **E.2** `src/features/profile/ProfilePage.tsx` 変更 (U7a placeholder → 完全実装 + 二段階削除)
- [ ] **E.3** `src/features/profile/useProfile.ts` 新規 (get + update + delete)
- [ ] **E.4** `src/features/profile/strings.ts` 新規

---

## 8. Phase F: tests 8 ファイル + setup 拡張 (ultrathink I2)

**ultrathink I2**: U7a `tests/setup.ts` を **merge 拡張** (新規 file 作らず)、追加事項:
- `getUserMedia` mock (voice tests 用)
- React Query test wrapper helper (各 hook test で `<QueryProvider>` 包む)

```typescript
// tests/setup.ts に追加 (U7a 既存に merge)
import { vi } from "vitest";

// ultrathink U7d I2: getUserMedia mock
Object.defineProperty(navigator, "mediaDevices", {
  writable: true,
  value: {
    getUserMedia: vi.fn().mockResolvedValue({
      getTracks: () => [{ stop: vi.fn() }],
    }),
  },
});

// React Query test wrapper (各 hook test で使用)
// → 個別 test file 内で createTestQueryClient() を local 定義し render
```

- [ ] **F.1** `tests/features/decision/reducer.test.ts` (pure function、全 transition)
- [ ] **F.2** `tests/features/score/scoreLevel.test.ts` (pure function、boundary)
- [ ] **F.3** `tests/features/decision/useDecisionStream.test.tsx` (msw v2 SSE mock)
- [ ] **F.4** `tests/features/persona/usePersona.test.tsx` (list/create/selection mutation)
- [ ] **F.5** `tests/features/score/ScorePage.test.tsx` (threshold UI render)
- [ ] **F.6** `tests/features/profile/useProfile.test.tsx` (get/update/delete)
- [ ] **F.7** `tests/features/voice/useVoiceInput.test.tsx` (getUserMedia mock)
- [ ] **F.8** `tests/features/decision/DecisionPage.test.tsx` (integration、state machine flow)

---

## 9. Phase G: verify (ultrathink Imp1: LOC 内訳詳細化)

- [ ] **G.1** JSON 構文確認 (`package.json` 変更後)
- [ ] **G.2** TypeScript LOC 集計 (Phase 別):

| Phase | 内容 | LOC |
|---|---|---|
| A | package.json + vite.config 変更 | ~50 |
| B | QueryProvider + App + routes | ~80 |
| C | voice 4 (~150) + score 4 (~100) | ~250 |
| D | decision 7 (~350) + persona 5 (~200) + preference 3 (~50) | ~600 |
| E | home 完成 + profile 完成 + useProfile + strings | ~150 |
| F | tests 8 | ~400 |
| **合計** | (src ~1,130 + tests ~400) | **~1,530 LOC** |

- [ ] **G.3** 環境制約で `pnpm install / build / test` skip、CI で実行

---

## 10. リスク

| リスク | 影響 | 対応 |
|---|---|---|
| React Query v5 API 変化 (queryKey 形式等) | hook 全部 fail | lock ^5.0.0、moving v5 breaking なし想定 |
| Vite manualChunks の chunk 切り出し失敗 | bundle 肥大化 | size-limit で CI fail、PR で発見 |
| getUserMedia (Voice) の permission 拒否 | UX 停止 (限定的) | ultrathink Imp2: voice は **optional addition**、DecisionPage の text input が default で常時 visible、voice 不可でも入力可能 (FD §3.1 + §8) |
| SSE stream の AbortController が browser 古いで動作不能 | DecisionStream 中断不可 | NFR Req §7.1: target ES2022 で AbortController 標準対応 |
| Persona selection 上限 3 のガード漏れ | API 422 返却 | FE 側で上限 check + Toast、API 側でも validate (U-Persona NFR Req) |

---

## 11. 承認チェックリスト

- [x] Phase A.0 → A → B → C → D → E → F → G の 8 段階順序
- [x] 約 38 ファイル (新規 36 + 変更 2)
- [x] FD/NFR Req/NFR Design/Infra Design 全 fix 反映
- [x] React Query + manualChunks + reducer/scoreLevel pure functions + strings.ts type-safe
- [x] size-limit で CI bundle 検証
- [x] tests 8 ファイル (pure function 2 + hook 4 + integration 2)
- [x] 既存 U7a apps/web を破壊しない (placeholder 完成版置換のみ)
