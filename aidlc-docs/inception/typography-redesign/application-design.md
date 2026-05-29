# typography-redesign — Application Design

**Feature ID**: typography-redesign
**Created**: 2026-05-27
**Workflow Phase**: 🔵 INCEPTION → Application Design
**Status**: Draft (awaiting Gate 2 approval)
**Depends on**: [requirements.md](./requirements.md) (Gate 1 approved: Q1=C / Q2=A)

---

## 1. Decisions (Gate 1 から確定)

| ID | 決定 |
|---|---|
| D-1 | Scale 戦略: **C 小サイズ重点 (最小 diff)** — text-xs 12→14, text-sm 14→15, base/lg/xl 不変 |
| D-2 | Header 据置: **A 絶対 px class で 2 element に直接 pin** |

---

## 2. Token 変更仕様

### 2.1 `packages/ui/src/tokens/typography.ts`

```diff
   fontSize: {
-    xs: "0.75rem",      // 12px
-    sm: "0.875rem",     // 14px
+    xs: "0.875rem",     // 14px  (was 12, +17%) — Apple HIG min 14px 整合, caption / hint / breadcrumb
+    sm: "0.9375rem",    // 15px  (was 14, +7%)  — form label / button / tab
     base: "1rem",       // 16px (unchanged)
     lg: "1.125rem",     // 18px (unchanged) — header brand と一致するため不変厳守
     xl: "1.25rem",      // 20px (unchanged)
     "2xl": "1.5rem",    // 24px (unchanged)
     "3xl": "1.875rem",  // 30px (unchanged)
     "4xl": "2.25rem",   // 36px (unchanged)
     decision: "2rem",   // 32px (unchanged)
     persona: "1.125rem",// 18px (unchanged)
   },
```

**変更影響**:
- `text-xs` を使う **71 箇所** が一斉に 12→14px に拡大 (主効果)
- `text-sm` を使う **44 箇所** が 14→15px に微増 (補助効果)
- それ以外の Tailwind text-* class は無変更

### 2.2 インライン `fontSize:` の連動

Token 変更では救えないインライン宣言を個別に調整 (10 箇所程度).

| ファイル | 元 | 新 | 用途 |
|---|---|---|---|
| `apps/web/src/features/decision/DecisionResult.tsx` | `fontSize: 18` (× 2) | `fontSize: 20` | 結論カード / 確認 step / 提案 italic 本文 |
| `apps/web/src/features/decision/DecisionResult.tsx` (pink nudge) | `text-[11px]` / `text-[10px]` | `text-[13px]` / `text-[12px]` | nudge 文 / 「決まったこと」 caption |
| `apps/web/src/features/score/ScoreRadialChart.tsx` | `fontSize: 22` 等 | `fontSize: 24` 等 | 中央スコア数値 + 100% 補助 |
| `apps/web/src/features/decision/SwipeChoice` (UI) | 該当あれば +1〜2px | | Yes/No fallback label |
| `apps/web/src/features/persona/PersonaCreateModal.tsx` | `text-[10px]` (字数 caption) | `text-[12px]` | 「10字以上 (現在 N 字)」表示 |

ハードコード `text-[Npx]` で 10〜11px のものは **+2px**、12〜13px のものは **+1px** を目安に統一更新.

### 2.3 ヘッダ pin (D-2 実装)

`apps/web/src/shell/Layout.tsx` の header 内 2 element:

```diff
   <Link
     to="/"
     viewTransition
-    className="text-base font-bold active:opacity-70 leading-none"
+    className="text-[16px] font-bold active:opacity-70 leading-none"
     ...
   >
     YesMan
   </Link>
   {isAuthed && (
-    <Button variant="ghost" size="sm" onClick={handleSignOut}>
+    <Button variant="ghost" size="sm" className="text-[14px]" onClick={handleSignOut}>
       Sign out
     </Button>
   )}
```

- YesMan title: `text-base` (16px、scale C で本来不変) → 念のため `text-[16px]` に絶対化 (将来の token 変更からも保護)
- Sign out: `size="sm"` 内部の `text-sm` は scale C で 14→15px に微増する → `className="text-[14px]"` で 14px に pin (Tailwind の後勝ち優先)

---

## 3. 影響範囲マップ

### 3.1 直接変更ファイル

| Layer | File | 変更内容 |
|---|---|---|
| token | `packages/ui/src/tokens/typography.ts` | xs/sm 値変更 |
| header | `apps/web/src/shell/Layout.tsx` | 2 element pin |
| inline | `apps/web/src/features/decision/DecisionResult.tsx` | fontSize: 18→20, text-[10px]→[12px], text-[11px]→[13px] |
| inline | `apps/web/src/features/score/ScoreRadialChart.tsx` | fontSize: 22→24 等 |
| inline | `apps/web/src/features/persona/PersonaCreateModal.tsx` | text-[10px] caption → text-[12px] |
| inline | `packages/ui/src/composites/SwipeChoice.tsx` (該当箇所あれば) | label の inline size +1〜2px |

### 3.2 間接波及 (token 変更で自動拡大)

- `text-xs` 使用 71 箇所 → 12→14px に自動更新 (主に caption / hint / breadcrumb / pink nudge / banner / footer text)
- `text-sm` 使用 44 箇所 → 14→15px に自動更新 (主に form label / button text / tab label)

### 3.3 ビルド経路

- `packages/ui` を `pnpm --filter @yesman/ui build` で再 build (token 変更が dist/ に反映される)
- 既存 vitest は `dist/` ではなく `src/` を直参照するため build 待ちは不要だが、e2e + 本番 web は build 必須

---

## 4. テスト戦略

### 4.1 Unit (vitest)

- 既存 `apps/web/tests/features/decision/DecisionResult.test.tsx` の 15 件 + その他テストは `getByText` / `getByRole` で content 引きしているため **破壊リスクなし** (assertion で size に触れていない)
- 万一 sizing 関連の snapshot test が壊れたら、新サイズで update

### 4.2 E2E (Playwright)

- 既存 e2e 全件 (約 80 spec): 文字内容で element を引いているため互換性あり想定
- スクリーンショット系 spec (`inception-complete-screens.spec.ts` 等) は意図的に視覚比較するため、**意図的に差分が出る** → 差分受容 (新サイズの screenshot に baseline 更新が必要なら別 commit)

### 4.3 視覚 acceptance (mobile viewport)

- web dev server を mobile viewport 390×844 で開き、`/decision` `/score` `/persona` `/profile` を目視チェック
- iPhone 13 実機 (TryCloudflare 経由) で同チェック

---

## 5. ロールバック手順

万一視覚が大幅悪化した場合:
1. `packages/ui/src/tokens/typography.ts` の xs/sm を旧値 (0.75 / 0.875rem) に戻す
2. `pnpm --filter @yesman/ui build`
3. Layout.tsx の `text-[16px]` / `text-[14px]` は害ないので残置 (将来の保護)

---

## 6. Gate 2 Decision (Application Design Approval)

確定したい内容:
- ✅ token 値 (xs 14px / sm 15px)
- ✅ インライン fontSize の +2px 規約 (10/11px → +2、それ以外 → +1〜2 微調整)
- ✅ Header pin (text-[16px] / text-[14px])

承認後、Code Generation Plan (具体ファイル × 行番号) に進む.
