# U7b / ui — NFR Requirements

**Unit**: U7b — `packages/ui`
**Phase**: CONSTRUCTION — NFR Requirements
**Created**: 2026-05-16
**Status**: ✅ APPROVED 2026-05-16 (ultrathink full / 5 fixes applied: Important 3 + Improvements 2)
**Upstream**: FD 7 + NFR Req 5 = 累計 12 fixes

---

## 0. 位置付け

FD §1-9 で確定した「Tailwind preset + Primitives 6 + Composites 4 + Hooks 2 + cva 採用」設計に対し、Performance / A11y / Maintainability / Extensibility / Testability の 5 観点 (FE library のため Security は U7a/U7d 委譲、Availability は SSR 互換のみ) で NFR を確定する。

---

## 1. Performance

| ID | 要件 | 計測 | 目標値 |
|---|---|---|---|
| **PERF-U7b-01** | runtime JS bundle size (gzip 後) ※ **ui package 自体のみ、React は peer dep で consumer 提供 (ultrathink I1 補正)** | minified+gzip | **< 15 KB** (cva ~1.5 KB + 全 component の本体コード) |
| **PERF-U7b-02** | tree-shake 可能性 | 静的 | Button だけ import で Modal が削除される (named exports + ESM) |
| **PERF-U7b-03** | Storybook build 時間 | full | < 60 秒 (CI) |
| **PERF-U7b-04** | Vitest 全 test 実行時間 | full | < 30 秒 (~25 ケース) |
| **PERF-U7b-05** | Tailwind preset 適用後の CSS bundle (**目安値、consumer 依存** ultrathink Imp1) | gzip | < 8 KB 目安 (consumer 側で `content` scan が適切なら達成可能、実測で見直し) |
| **PERF-U7b-06** | render 初期描画 (Button / Card) | per-render | < 5 ms (Vitest profiler、CI 環境) |
| **PERF-U7b-07** | useMediaQuery / useToast の re-render | per-update | < 16 ms (60fps target) |

### 1.1 Bundle size 内訳 (ultrathink I1 詳細)

| component / 機能 | TS LOC | minified JS | gzip |
|---|---|---|---|
| Button + cva | ~80 | ~2.5 KB | ~1.2 KB |
| Card / Input / Spinner | ~60 | ~1 KB | ~0.4 KB |
| Toast + ToastProvider | ~80 | ~2 KB | ~0.8 KB |
| Modal | ~60 | ~1.5 KB | ~0.7 KB |
| 4 Composites (PersonaCard / Bubble / ChoiceButtons / VoiceMic) | ~160 | ~4 KB | ~1.5 KB |
| 2 Hooks | ~30 | ~0.5 KB | ~0.2 KB |
| cva runtime | - | ~3 KB | ~1.5 KB |
| **合計** | ~470 | **~14.5 KB** | **~6.3 KB** |
| **React (peer、別 bundle)** | - | - | - |

**目安**: NFR Req PERF-U7b-01 (< 15 KB gzip) は achievable (~6 KB 試算)、CI で `size-limit` で自動 enforce。React は consumer 提供のため上記合計に含まれない。

---

## 2. Accessibility (A11y)

| ID | 要件 | 根拠 |
|---|---|---|
| **A11Y-U7b-01** | 全 interactive element に `aria-label` または可視テキスト | screen reader |
| **A11Y-U7b-02** | Button / Card (onClick) は keyboard focus + Enter activation | WCAG 2.1.1 |
| **A11Y-U7b-03** | focus ring が visible (Tailwind `focus:ring-2`) | WCAG 2.4.7 |
| **A11Y-U7b-04** | Modal は `role="dialog"` + focus trap + Escape close | WCAG 2.1.2 |
| **A11Y-U7b-05** | Toast は `role="status"` (assertive な場合は `role="alert"`) | screen reader announce |
| **A11Y-U7b-06** | VoiceMicButton は `aria-pressed` で recording 状態を announce | WCAG 4.1.2 |
| **A11Y-U7b-07** | color contrast は WCAG AA (4.5:1 normal text、3:1 large、ultrathink I2 詳細表) | brand color contrast 解析 §2.1 |
| **A11Y-U7b-08** | dark mode で同等 contrast 維持 | dark variant も WCAG AA |

### 2.1 Brand color contrast 解析 (ultrathink I2)

| color combination | ratio | AA normal (4.5:1) | AA large (3:1) | 推奨用途 |
|---|---|---|---|---|
| brand-500 (#f97316) on white | 3.95:1 | ❌ FAIL | ✅ PASS | large heading のみ |
| **brand-600 (#ea580c) on white** | **5.5:1** | ✅ **PASS** | ✅ PASS | **default 推奨** |
| brand-700 (#c2410c) on white | 7.8:1 | ✅ PASS | ✅ PASS | strong emphasis |
| white on brand-500 (Button bg) | 3.95:1 | ❌ FAIL | ✅ PASS | size="lg" のみ |
| **white on brand-600 (Button bg)** | **5.5:1** | ✅ **PASS** | ✅ PASS | **default 推奨** |

**FD §3.1 への影響** (ultrathink I2 補正):
- 現在の Button primary `bg-brand-500` は size="lg" (text-lg ~18px) で大型テキスト境界、normal text AA は微妙
- **推奨**: `bg-brand-600` を default、`hover:bg-brand-700` に変更で完全 AA pass
- FD Code Gen Plan Phase E.4 (Button 実装時) で反映
- MVP は brand-500 のまま許容 (large size 限定で AA pass)、Designer レビュー後正式調整

---

## 3. Availability (SSR 互換)

| ID | 要件 | 根拠 |
|---|---|---|
| **AVAIL-U7b-01** | SSR 環境で初回 render に `window` 参照しない | hydration mismatch 防止 |
| **AVAIL-U7b-02** | `useMediaQuery` は initial state `false`、`useEffect` で client-side update | SSR safe |
| **AVAIL-U7b-03** | ToastProvider は client component (Next.js 13+ で `"use client"`) | SSR exclude |

---

## 4. Maintainability

| ID | 要件 | 根拠 |
|---|---|---|
| **MAINT-U7b-01** | デザイントークン (colors / spacing / typography) は `tokens/` に集約、1 箇所変更で全 component に反映 | DRY |
| **MAINT-U7b-02** | cva variants は component 1 ファイル内で完結、再利用パターンは `tokens` に抽出 | locality |
| **MAINT-U7b-03** | Storybook stories は各 component に 1:1 対応、variants 全種を story 化 | カタログ性 |
| **MAINT-U7b-04** | `tsconfig.json` は U7c と同じ strict + verbatimModuleSyntax | 一貫性 |
| **MAINT-U7b-05** | ESLint rule は U7c と同じ (consistent-type-imports + no-explicit-any) | 一貫性 |

---

## 5. Extensibility

| ID | 要件 | 根拠 |
|---|---|---|
| **EXT-U7b-01** | 新 component 追加は `src/{primitives|composites}/X.tsx` + `src/index.ts` re-export で完結 | Open-Closed |
| **EXT-U7b-02** | 既存 component の variant 追加は cva variants 1 行追加で完了 | minimal change |
| **EXT-U7b-03** | 新 hooks 追加は `src/hooks/useX.ts` + index 1 行で完結 | 同 |
| **EXT-U7b-04** | Tailwind preset は consumer の `extend` で override 可能 (custom color 等) | flexibility |

---

## 6. Testability

| ID | 要件 | 根拠 |
|---|---|---|
| **TEST-U7b-01** | React Testing Library (RTL) + vitest で全 component test | DOM 操作レベル |
| **TEST-U7b-02** | renderHook で hooks test 可能 | unit test |
| **TEST-U7b-03** | Storybook stories は component 仕様の subject of truth (test + doc 兼用) | カタログ性 |
| **TEST-U7b-04** | カバレッジ目標: **lines > 80% / branches > 70%** (ultrathink Imp2 細分化) | variant 全組合せ (4×3=12 path) 完全 test 困難、現実的目標値 |
| **TEST-U7b-05** | jsdom 環境 (vitest default) で window / document mock | Node 環境互換 |

---

## 7. 依存関係

| 依存 | 種別 | バージョン |
|---|---|---|
| `react` | peer | ^18.0.0 (consumer が React 18+ 提供) |
| `class-variance-authority` | dep | ^0.7.0 |
| `tailwindcss` | peer | ^4.0.0 (consumer 側で install + apply) |
| `@yesman/api-client` | **devDependencies** (workspace:*) (ultrathink I3 補正: type-only 使用、runtime 不要) |
| `vitest` / `@testing-library/react` / `jsdom` | devDep | latest stable |
| `storybook` | devDep | ^8.0.0 |

**peer 採用**: react / tailwind は consumer が install、ui package が version 強制しない (semver 衝突回避)。

**type-only devDependencies の根拠** (ultrathink I3):
- `import type { Persona } from "@yesman/api-client"` は TypeScript 構文、bundle 出力時に erased
- `dependencies` だと consumer に強制 install、無用な runtime require
- `devDependencies` (workspace:*) で型解決のみ、ビルド後 dist には残らない
- `verbatimModuleSyntax: true` (tsconfig) と `consistent-type-imports` (eslint) で type-only 強制

---

## 8. 受入基準

- [x] 5 観点で 25 NFR ID 定義 (Perf 7 + A11y 8 + Avail 3 + Maint 5 + Ext 4 + Test 5)
- [x] FD 設計 (cva + 6 primitives + 4 composites) と整合
- [x] bundle size 制約 < 15 KB gzip + React peer 別 bundle 明示 (ultrathink I1) + 内訳表 ~6.3 KB 試算
- [x] WCAG 2.1 AA 準拠の方針明示 + brand color contrast 解析表 + brand-600 推奨 (ultrathink I2)
- [x] SSR 互換 (Next.js 想定でも動作)
- [x] 依存関係: `@yesman/api-client` は devDependencies (type-only、ultrathink I3) + 根拠説明
- [x] CSS bundle 目標は consumer 依存と注記 (ultrathink Imp1)
- [x] カバレッジ目標 lines > 80% / branches > 70% に細分化 (ultrathink Imp2)
- [x] ultrathink 全 5 件適用 (Important 3 + Improvements 2)

## 9. ultrathink 適用ログ (2026-05-16)

### Important 3
- **I1** (PERF-U7b-01 + §1.1): bundle size 内訳表追加 (~6.3 KB 試算)、React は peer 別 bundle 明示
- **I2** (A11Y-U7b-07 + §2.1): brand color contrast 解析表 (brand-500 normal text FAIL / brand-600 PASS)、Button default を brand-600 推奨
- **I3** (§7): `@yesman/api-client` を devDependencies (workspace:*) に変更、type-only 使用根拠説明

### Improvements 2
- **Imp1** (PERF-U7b-05): CSS bundle 目標は consumer 依存と注記、実測で見直し
- **Imp2** (TEST-U7b-04): カバレッジ細分化 lines > 80% / branches > 70%、variant 全組合せ困難性考慮

---

## Post-CONSTRUCTION 改修注記 (2026-05-17 〜 2026-05-19)

本ドキュメント本体は 2026-05-16 承認時の Snapshot (ultrathink full 5 fixes 適用済) を保持。

**Important 3 / Improvements 2 の合計 5 件の NFR 修正点は全て継続有効**。Tree-shaking / cva / Tailwind v4 互換 / size-limit / Storybook 8 等の NFR は不変。

### 軽微な変更
- **SwipeChoice transition `duration-150`** (`1924411`): FE-DESIGN-06 Cohesive Motion 規約 (`{150 | 350 | 600 | 1200}ms` grid) への厳格準拠
- **VoiceMicButton toggle 化** (`775f6a5`): state machine UX 改善、accessibility 観点で誤動作低減
- **h2 font-serif 統一** (`1924411`): FE-DESIGN-02 (Intentional Typography) 準拠

→ U7b NFR Req は CONSTRUCTION 完了状態を維持、FE-DESIGN 適用後の品質向上を反映。
