# U7b / ui — Code Generation Plan (Part 1)

**Unit**: U7b
**Phase**: CONSTRUCTION — Code Generation Part 1 (Planning)
**Created**: 2026-05-16
**Status**: ✅ APPROVED 2026-05-16 (ultrathink full / 5 fixes applied: Important 3 + Improvements 2)
**Upstream**: FD 7 + NFR Req 5 + NFR Design 5 + Infra Design 5 + Code Gen Plan 5 = 累計 27 fixes

---

## 0. 位置付け

NFR Design §1 + Infra Design で確定した「~25 src + 8 test / cva + Tailwind v4 / Storybook + vitest」構成を、Phase A-G の 7 段階で実装する詳細計画に展開する。

---

## 1. 全体方針

### 1.1 ファイル集計

| カテゴリ | 数 |
|---|---|
| **新規 packages/ui 設定** | 6 (package.json + tsconfig + vitest.config + .eslintrc + .gitignore + .storybook/{main,preview}) |
| **新規 src/ tokens + preset + styles** | 6 (3 token + index + preset + globals.css) |
| **新規 src/ icons** | 4 (MicIcon + CheckIcon + XIcon + index) |
| **新規 src/ primitives** | 8 (Button + Card + Input + Spinner + Toast + ToastProvider + Modal + index) |
| **新規 src/ composites** | 5 (PersonaCard + DecisionUtteranceBubble + ChoiceButtons + VoiceMicButton + index) |
| **新規 src/ hooks** | 3 (useToast + useMediaQuery + index) |
| **新規 src/ entry** | 1 (index.ts) |
| **新規 src/ stories** | 6 (Button + Card + PersonaCard + ChoiceButtons + VoiceMicButton + Toast) |
| **新規 tests** | 9 (setup + 3 primitives + 3 composites + 2 hooks) |
| **合計** | **約 48 ファイル** |

### 1.2 順序 (線形)

Phase A.0 (pre-flight) → A (基盤 6) → B (tokens 6) → C (primitives 8) → D (composites + icons 9) → E (hooks 3 + index 1) → F (stories 6) → G (tests 9 + verify) の 8 段階。

### 1.3 Phase 内依存関係 (ultrathink I1 + I2)

```
A (config) ─▶ B (tokens) ─▶ C (primitives: Spinner→Button→Card→Input→Toast→ToastProvider→Modal→index)
                              │
                              └─▶ D.1 (icons) ─▶ D.2 (composites: 全 Button/Card/Icon に依存)
                                                    │
                                                    └─▶ E (hooks + entry index)
                                                          │
                                                          └─▶ F (stories) + G (tests + verify)
```

**主要依存**:
- C.2 Button は C.1 Spinner に依存 (loading state で Spinner を render)
- C.6 ToastProvider は C.5 Toast に依存 (children として render)
- D.5-D.8 composites は C primitives + D.1 icons 両方に依存 (VoiceMicButton = Button + MicIcon)
- F stories + G tests は全 src 完了前提

### 1.3 品質基準

- TypeScript `tsc --noEmit` 通過
- `pnpm run test` 全 pass (coverage thresholds 達成)
- `pnpm run lint` 通過
- `pnpm run size` 通過 (7 KB gzip 上限)
- `pnpm run build` 成功
- `pnpm run build-storybook` 成功

---

## 2. Phase A.0: Pre-flight check

- [ ] **A.0.1** `ls /Users/morimatsu/lab/ai-dlc-hackathon/packages/` で `ui/` 不在を確認 (api-client は U7c で作成済、ui は新規)
- [ ] **A.0.2** root の monorepo 基盤 (pnpm-workspace.yaml + root package.json) は U7c で既存、ui の追加のみで動作確認可

---

## 3. Phase A: packages/ui 設定 6 ファイル

- [ ] **A.1** `packages/ui/package.json` (NFR Design §3 通り、cva dep + react peer + tailwind peer + api-client devDep + **storybook + @storybook/react-vite devDep**、ultrathink Imp2: install 後 init 不要、config files は A.6 で手動配置)
- [ ] **A.2** `packages/ui/tsconfig.json` (NFR Design §2、jsx: react-jsx + strict + verbatimModuleSyntax)
- [ ] **A.3** `packages/ui/vitest.config.ts` (NFR Design §9、jsdom + setupFiles + coverage thresholds)
- [ ] **A.4** `packages/ui/.eslintrc.cjs` (U7c と同パターン + react/jsx-runtime プラグイン)
- [ ] **A.5** `packages/ui/.gitignore` (dist/ + storybook-static/ + node_modules/)
- [ ] **A.6** `packages/ui/.storybook/{main.ts,preview.ts}` (NFR Design §8)

> **ultrathink I3 注**: `vite.config.ts` は **追加不要**。`@storybook/react-vite` が Vite 内部処理を defaults で実行、library build は `tsc` で完結 (Vite 不要)。consumer (apps/web、U7a) で Vite 採用時のみ apps/web 配下に vite.config.ts を作成。

---

## 4. Phase B: src/ tokens + preset + styles 6 ファイル

- [ ] **B.1** `src/tokens/colors.ts` (FD §2.1)
- [ ] **B.2** `src/tokens/spacing.ts` (FD §2.2)
- [ ] **B.3** `src/tokens/typography.ts` (FD §2.3)
- [ ] **B.4** `src/tokens/index.ts` (3 token re-export)
- [ ] **B.5** `src/tailwind-preset.ts` (FD §2.4 + Infra Design §4.1 v4 互換)
- [ ] **B.6** `src/styles/globals.css` (Tailwind v4 base + dark mode strategy)

---

## 5. Phase C: src/ primitives 8 ファイル

- [ ] **C.1** `src/primitives/Spinner.tsx` (Button.tsx で先行依存、依存解消のため最初)
- [ ] **C.2** `src/primitives/Button.tsx` (NFR Design §5、cva + brand-600 default + defensive ordering + transition-colors)
- [ ] **C.3** `src/primitives/Card.tsx` (FD §3.2、onClick + as polymorphic)
- [ ] **C.4** `src/primitives/Input.tsx` (FD §3.4 系、基本 input)
- [ ] **C.5** `src/primitives/Toast.tsx` (NFR Design §6、role="status")
- [ ] **C.6** `src/primitives/ToastProvider.tsx` (NFR Design §6、counter ID + "use client")
- [ ] **C.7** `src/primitives/Modal.tsx` (FD §3.4、`<dialog>` + focus trap、MVP-optional)
- [ ] **C.8** `src/primitives/index.ts` (7 component re-export)

---

## 6. Phase D: src/ icons 4 + composites 5 = 9 ファイル

### Phase D.1: icons (composites で使用、先行)
- [ ] **D.1** `src/icons/MicIcon.tsx` (inline SVG、Lucide 系を inline で依存削減)
- [ ] **D.2** `src/icons/CheckIcon.tsx`
- [ ] **D.3** `src/icons/XIcon.tsx`
- [ ] **D.4** `src/icons/index.ts`

### Phase D.2: composites
- [ ] **D.5** `src/composites/PersonaCard.tsx` (FD §4.1)
- [ ] **D.6** `src/composites/DecisionUtteranceBubble.tsx` (FD §4.2)
- [ ] **D.7** `src/composites/ChoiceButtons.tsx` (FD §4.3、rename from SwipeYesNo)
- [ ] **D.8** `src/composites/VoiceMicButton.tsx` (FD §4.4、state machine + aria-pressed)
- [ ] **D.9** `src/composites/index.ts` (4 component re-export)

---

## 7. Phase E: src/ hooks 3 + entry 1 = 4 ファイル

- [ ] **E.1** `src/hooks/useToast.ts` (NFR Design §6、useToastContext alias)
- [ ] **E.2** `src/hooks/useMediaQuery.ts` (NFR Design §7、SSR safe)
- [ ] **E.3** `src/hooks/index.ts`
- [ ] **E.4** `src/index.ts` (public exports: tokens + primitives + composites + hooks + types)

---

## 8. Phase F: stories 6 ファイル

- [ ] **F.1** `src/stories/Button.stories.tsx` (4 variants × 3 sizes × loading 状態 = 24+ stories)
- [ ] **F.2** `src/stories/Card.stories.tsx`
- [ ] **F.3** `src/stories/PersonaCard.stories.tsx` (own / shared / blocked variant)
- [ ] **F.4** `src/stories/ChoiceButtons.stories.tsx`
- [ ] **F.5** `src/stories/VoiceMicButton.stories.tsx` (4 state)
- [ ] **F.6** `src/stories/Toast.stories.tsx` (success / error / info)

---

## 9. Phase G: tests 9 + verify

- [ ] **G.1** `tests/setup.ts` (NFR Design §9、jest-dom + cleanup)
- [ ] **G.2** `tests/primitives/Button.test.tsx` (variant / size / loading / disabled / onClick)
- [ ] **G.3** `tests/primitives/Card.test.tsx` (as polymorphic + onClick keyboard)
- [ ] **G.4** `tests/primitives/Toast.test.tsx` (ToastProvider + useToast + 自動 dismiss)
- [ ] **G.5** `tests/composites/PersonaCard.test.tsx` (selected + click + variant)
- [ ] **G.6** `tests/composites/ChoiceButtons.test.tsx` (onYes / onNo)
- [ ] **G.7** `tests/composites/VoiceMicButton.test.tsx` (state 別 label + aria-pressed)
- [ ] **G.8** `tests/hooks/useToast.test.ts` (renderHook + push + dismiss)
- [ ] **G.9** `tests/hooks/useMediaQuery.test.ts` (SSR safe + matchMedia mock)

### 9.1 verify (ultrathink Imp1: LOC 内訳詳細)

| カテゴリ | LOC | bundle 対象 |
|---|---|---|
| 設定 (Phase A 6 files) | ~150 | ❌ |
| tokens + preset + styles (Phase B 6 files) | ~120 | ✅ (tokens / preset は dist) |
| icons (Phase D.1 4 files) | ~60 | ✅ |
| primitives (Phase C 8 files) | ~250 | ✅ |
| composites (Phase D.2 5 files) | ~200 | ✅ |
| hooks + entry (Phase E 4 files) | ~80 | ✅ |
| stories (Phase F 6 files) | ~250 | ❌ |
| tests (Phase G 9 files) | ~400 | ❌ |
| **合計** | **~1,510 LOC** | **src のみ ~710 LOC が bundle 対象** |

bundle 対象 LOC は NFR Req §1.1 試算 (~565 LOC ベース) と整合、~6.3 KB gzip 達成見込み。

- JSON 構文 + .storybook config 確認
- 環境制約で `pnpm build / test / lint` は skip (CI で実行)

---

## 10. リスク

| リスク | 影響 | 対応 |
|---|---|---|
| Tailwind v4 PostCSS plugin が未 install (apps/web の依存) | consumer ビルド失敗 | Infra Design §4.1 で `@tailwindcss/postcss` 明示、consumer 側 install を docs で必須化 |
| cva の version (^0.7.0) と React 18 の型互換性 | ButtonProps 推論失敗 | cva 0.7+ は TS 5.0+ 互換、tsconfig で確認 |
| Storybook 8 + Vite 5 の plugin 競合 | build-storybook 失敗 | Storybook 8.3+ で Vite 5 公式対応、lock |
| Tailwind v4 `darkMode: "class"` の挙動変更 | dark variant 動作不能 | preset.ts で v4 互換書き方 + globals.css で `[data-theme="dark"]` フォールバック |
| `crypto.randomUUID` 依存削除済 → 別箇所で使用していないか | test fail | grep で確認、NFR Design §6 通り ToastProvider のみで counter 採用 |

---

## 11. 承認チェックリスト

- [x] Phase A.0 → A → B → C → D → E → F → G の 8 段階順序 + Phase 内依存関係図 (ultrathink I1 + I2)
- [x] 約 48 ファイル、LOC 内訳表 (~1,510 total、bundle 対象 ~710 src LOC、ultrathink Imp1)
- [x] cva 採用 + brand-600 default + ChoiceButtons rename + counter ID 反映
- [x] Tailwind v4 + Storybook 8 + Vitest + RTL 構成、vite.config.ts 不要 (ultrathink I3)
- [x] Storybook devDep install のみ、init 不要 (ultrathink Imp2)
- [x] U7c (api-client) との devDep 連携、runtime 依存ゼロ
- [x] coverage thresholds lines>80% + branches>70%
- [x] CI workflow (Infra Design §2.1 で完成済)
- [x] ultrathink 全 5 件適用 (Important 3 + Improvements 2)

## 12. ultrathink 適用ログ (2026-05-16)

### Important 3
- **I1** (§1.3): ToastProvider → Toast 依存を Phase 内依存図で視覚化
- **I2** (§1.3): composites (Phase D.2) は primitives (C) + icons (D.1) 両方依存を依存図で明示
- **I3** (§3 A.6): `vite.config.ts` 追加不要、@storybook/react-vite が defaults 内蔵、library build は tsc のみ

### Improvements 2
- **Imp1** (§9.1): LOC 内訳詳細表 (~1,510 total、bundle 対象 ~710 src LOC のみ)
- **Imp2** (§3 A.1): Storybook devDep install のみで動作、`storybook init` は不要 (config files は A.6 で手動配置)

---

## Post-CONSTRUCTION 改修注記 (2026-05-17 〜 2026-05-19)

本 plan 本体は 2026-05-16 承認時の Snapshot (ultrathink full 5 fixes 適用済) を保持。

**Phase A.0〜G (設定 6 / tokens 4 + preset + globals.css / primitives 7 / icons 4 + composites 4 / hooks 2 / stories 6 / tests 9) の生成計画は全て継続有効**。

### Post-CONSTRUCTION で変更されたファイル
| ファイル | commit | 変更内容 |
|---|---|---|
| `packages/ui/src/composites/SwipeChoice.tsx` | `2b08a75` + `1924411` | state-leak fix (`key={decision.id}` + `useEffect` reset) + transition `duration-150` |
| `packages/ui/src/composites/VoiceMicButton.tsx` | `775f6a5` | push-to-talk → click toggle (state machine: idle | recording | error) |
| (各 h2) | `1924411` | PersonaCard / DecisionUtteranceBubble 等の h2 に `font-serif` (Noto Serif JP) 追加 |

tokens / primitives 構成 (`Spinner` / `Button` / `Card` / `Input` / `Toast` / `ToastProvider` / `Modal`) は不変。Storybook 6 stories + 9 test ファイルは構成不変 (assertion のみ update)。

→ U7b Code Gen Plan は 48 ファイル構成を維持、composite 2 件の改修と h2 font-serif 統一のみ。
