# Mobile App Polish 設計仕様

- **Date**: 2026-05-22
- **Author**: y-morimatsu (with Claude Opus 4.7)
- **Status**: Approved (brainstorming)
- **Scope**:
  - `apps/web/src/shell/Layout.tsx` (sticky header 簡素化 + safe area + BottomNav 配置 + main padding 調整)
  - `apps/web/src/shell/BottomNav.tsx` (新規 4-tab navigation)
  - `apps/web/src/shell/usePageTransition.ts` (新規 View Transitions API hook)
  - `packages/ui/src/primitives/Button.tsx` (active state 追加)
  - `packages/ui/src/primitives/Skeleton.tsx` (新規)
  - `packages/ui/src/primitives/index.ts` (Skeleton export)
  - `apps/web/src/features/score/ScorePage.tsx` (Spinner → Skeleton)
  - `apps/web/src/features/decision/DecisionResult.tsx` (haptic vibrate + streaming skeleton)
  - `apps/web/src/features/persona/PersonaListPage.tsx` (Spinner → Skeleton)
  - `apps/web/src/features/preference/PreferencePage.tsx` (Spinner → Skeleton)
  - `tests/e2e/tests/inception-mobile.spec.ts` (header test 更新 + BottomNav test 追加)
- **Branch**: `feature/web-mobile-app-polish` (develop @ `03ee982` から派生済)
- **Related**:
  - drawio mockup: [diagrams/2026-05-22-mobile-app-polish-screens.drawio](diagrams/2026-05-22-mobile-app-polish-screens.drawio) (4 ページ)
  - 競合分析 §4-B (派手な瞬間 / 演出強度): [../research/2026-05-22-hackathon-competitive-analysis.md](../research/2026-05-22-hackathon-competitive-analysis.md)
  - 前段 Pack A (UX polish 基盤): [./2026-05-22-demo-ux-polish-pack-a-design.md](./2026-05-22-demo-ux-polish-pack-a-design.md)

---

## 1. 背景

YesMan は INCEPTION フェーズで「Mobile-First (Pixel 5 / iPhone 13 想定)」と決められた PWA だが、現状の Layout は:

- Top header に 4 要素 (🪞 YesMan / ⚙️ / 📊 / 👤 / Sign out) で混雑、`⚙️` と `👤` は両方 `/profile` へ遷移 (冗長)
- Bottom Navigation なし — 親指リーチが悪い、モバイルアプリらしさが薄い
- `env(safe-area-inset-*)` 未使用 — iPhone notch / home indicator にコンテンツが被るリスク
- Sticky header なし — scroll で brand 識別が消失
- Tap feedback (`active:` state) は一部 (Button primary) のみ — モバイル特有の触覚フィードバックが薄い
- Spinner ばかりで Skeleton loader 未統一 — loading 体感が地味
- Page transitions なし — route 切替が無味乾燥

ハッカソンデモは Mobile Chrome / 実機 iPhone Safari で見せる想定のため、これらをまとめて改善して **「モバイル Web」→「ネイティブアプリ感」** に転換する。

### 解決したい課題

1. **冗長な top nav と混雑感** — 簡素化して brand 識別性を上げる
2. **親指リーチの悪さ** — Bottom Navigation Bar で常時 4 動線にアクセス可能に
3. **iPhone notch / home indicator 配慮ゼロ** — safe area insets で配置調整
4. **触覚フィードバック不足** — active state + haptic vibrate でタッチ体験を強化
5. **Loading の地味さ** — Skeleton loader で「動いている感」を出す
6. **Route 切替の無味乾燥** — View Transitions API で軽い cross-fade

---

## 2. ユーザストーリー

> ユーザーが YesMan を **iPhone Safari (実機 or Chrome DevTools Mobile)** で開くと、上部に簡素化された `🪞 YesMan` ロゴと `Sign out` のみが sticky で常時表示され、下部に `🏠 Home / 💭 決定 / 📊 スコア / 👤 プロフィール` の 4-tab Bottom Navigation が固定表示される。iPhone notch / home indicator はコンテンツに被らず、tab tap で他 page へ即遷移、現在 page の tab は brand 色 + 太字 + 上 underline で識別可能。Yes 採択時には Android 端末で短い振動が走る。

### 受入基準 (Gherkin)

```
# Bottom Navigation 基本動作
Given 認証済みで /score を開く
When Layout が描画される
Then 画面下部に固定の Bottom Navigation Bar が表示される
  And 4 tab (🏠 Home / 💭 決定 / 📊 スコア / 👤 プロフィール) が等分配で表示される
  And 「📊 スコア」tab が active (brand-700 太字 + 上 2px underline)
  And 残り 3 tab は inactive (neutral-500)

Given 認証済みで /decision を開く
When Layout が描画される
Then 「💭 決定」tab が active、他は inactive

Given 未認証で /auth/splash を開く
When Layout が描画される
Then Bottom Navigation Bar は **表示されない**
  And Top header の Sign out も非表示

# Tab tap で navigation
Given /score で Bottom Nav を表示している
When 「💭 決定」tab を tap する
Then /decision に navigate される
  And 「💭 決定」tab が active に切替わる

# Sticky Header
Given /score で page を下方向に scroll する
When main content が 200px 以上 scroll される
Then Top header は画面上部に sticky 表示され続ける
  And brand logo「🪞 YesMan」と Sign out は常時 visible

# Safe Area Insets
Given iPhone 13 (notch あり) で開く
When Layout が描画される
Then Top header の padding-top は env(safe-area-inset-top) を含む
  And Bottom Nav の padding-bottom は env(safe-area-inset-bottom) を含む
  And main content の padding-bottom は (BottomNav 56px + safe-area-inset-bottom + 1rem) を含む

# Active state (tap feedback)
Given 任意の Button を tap する
When tap 中
Then button は active:scale-[0.98] active:opacity-80 が適用される

# Skeleton loader
Given /score を開いた直後 (data fetch 中)
When useScore が isPending を返している
Then Spinner ではなく **Skeleton card** (radial 円 + bubble + chart + 履歴 3 cards) が表示される

# Page transitions
Given /score を開いている
When Bottom Nav 「💭 決定」を tap する
And View Transitions API 対応ブラウザ (Chrome 111+/Safari TP)
Then route 切替時に cross-fade animation が走る
  And Firefox では即時遷移 (fallback)

# Haptic feedback
Given /decision で Yes 採択する
When handleChoose("yes") が成功する
Then navigator.vibrate(50) が呼ばれる
  And Android: 50ms 振動
  And iOS: 無視 (no-op)
  And prefers-reduced-motion: reduce 時は呼ばれない
```

---

## 3. 設計 1: Layout shell 改修 (sticky header + safe area + BottomNav 配置)

### 変更対象

- `apps/web/src/shell/Layout.tsx`

### 変更内容

```tsx
import { Suspense } from "react";
import { Outlet, Link } from "react-router-dom";
import { Button, Spinner } from "@yesman/ui";
import { signOutUser } from "./auth";
import { useAuth } from "./AuthProvider";
import { BottomNav } from "./BottomNav";

export function Layout() {
  const { status, refresh } = useAuth();

  const handleSignOut = async () => {
    await signOutUser();
    await refresh();
  };

  const isAuthed = status === "authenticated";

  return (
    <div className="min-h-screen flex flex-col bg-neutral-50 text-neutral-800">
      {/* Sticky Header (簡素化: logo + Sign out のみ) */}
      <header
        className="sticky top-0 z-40 text-neutral-800"
        style={{
          background: "#F5E5C4",
          paddingTop: "max(1rem, env(safe-area-inset-top))",
          paddingBottom: "1rem",
        }}
      >
        <div className="flex justify-between items-center max-w-md mx-auto w-full px-4">
          <Link
            to="/"
            className="font-serif text-xl font-bold text-neutral-800 active:opacity-70"
          >
            🪞 YesMan
          </Link>
          {isAuthed && (
            <Button variant="ghost" size="sm" onClick={handleSignOut}>
              Sign out
            </Button>
          )}
        </div>
      </header>

      {/* Main content (BottomNav に被らない padding を確保) */}
      <main
        className="flex-1 px-4 pt-4 max-w-md mx-auto w-full bg-neutral-50 text-neutral-800"
        style={{
          paddingBottom: isAuthed
            ? "calc(56px + env(safe-area-inset-bottom) + 1rem)"
            : "1rem",
        }}
      >
        <Suspense
          fallback={
            <div className="flex justify-center p-8">
              <Spinner />
            </div>
          }
        >
          <Outlet />
        </Suspense>
      </main>

      {/* Bottom Navigation (認証時のみ) */}
      {isAuthed && <BottomNav />}
    </div>
  );
}
```

### 重要ポイント

- **Sticky header**: `sticky top-0 z-40` で scroll しても画面上部に固定
- **Header padding-top**: `max(1rem, env(safe-area-inset-top))` で notch 領域を確保 (notch なし端末では 1rem)
- **Main padding-bottom**: `calc(56px + env(safe-area-inset-bottom) + 1rem)` で BottomNav に被らない
- **Top header の icons 削除**: `⚙️ 📊 👤` を全削除、`Sign out` のみ残す (nav は BottomNav に委譲)
- **未認証時**: Sign out + BottomNav 非表示、main padding は通常値 `1rem`

---

## 4. 設計 2: BottomNav component (新規)

### 変更対象

- `apps/web/src/shell/BottomNav.tsx` (新規)

### 実装

```tsx
import { Link, useLocation } from "react-router-dom";

type Tab = { to: string; icon: string; label: string };

const TABS: Tab[] = [
  { to: "/",        icon: "🏠", label: "Home" },
  { to: "/decision", icon: "💭", label: "決定" },
  { to: "/score",    icon: "📊", label: "スコア" },
  { to: "/profile",  icon: "👤", label: "プロフィール" },
];

function isActive(pathname: string, to: string): boolean {
  if (to === "/") return pathname === "/";
  return pathname === to || pathname.startsWith(`${to}/`);
}

export function BottomNav() {
  const { pathname } = useLocation();

  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-40 bg-white border-t border-neutral-200"
      style={{
        paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))",
        paddingTop: "0.5rem",
      }}
      aria-label="メインナビゲーション"
    >
      <ul className="flex max-w-md mx-auto">
        {TABS.map((tab) => {
          const active = isActive(pathname, tab.to);
          return (
            <li key={tab.to} className="flex-1 relative">
              {active && (
                <div
                  className="absolute top-0 left-1/2 -translate-x-1/2 w-10 h-0.5 bg-brand-700"
                  aria-hidden="true"
                />
              )}
              <Link
                to={tab.to}
                aria-current={active ? "page" : undefined}
                className={
                  "flex flex-col items-center justify-center gap-0.5 min-h-[56px] active:opacity-70 " +
                  (active
                    ? "text-brand-700 font-bold"
                    : "text-neutral-500")
                }
              >
                <span className="text-2xl leading-none" aria-hidden="true">
                  {tab.icon}
                </span>
                <span className="text-xs leading-tight">{tab.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
```

### Active 判定

| pathname | active tab |
|----------|-----------|
| `/` | 🏠 Home |
| `/decision` | 💭 決定 |
| `/score` | 📊 スコア |
| `/profile` | 👤 プロフィール |
| `/personas` | (なし、すべて inactive) |
| `/personas/selection` | (なし) |
| `/preferences` | (なし) |
| `/auth/*` | BottomNav 自体非表示 |

- `/personas` と `/preferences` は **active tab がない** 状態 (Home Hub からアクセス想定)
- 必要なら将来 5 tab 化 or FAB 化 (本 PR スコープ外)

### z-index

- BottomNav: `z-40`
- Sticky Header: `z-40` (top と bottom で衝突なし)
- Modal (PersonaCreateModal): `z-50` (BottomNav 上書き)

---

## 5. 設計 3: Safe Area Insets

### 適用箇所

| 要素 | CSS property | 値 |
|---|---|---|
| Header padding-top | `padding-top` | `max(1rem, env(safe-area-inset-top))` |
| Header padding-bottom | `padding-bottom` | `1rem` (固定、notch は top のみ) |
| BottomNav padding-bottom | `padding-bottom` | `max(0.5rem, env(safe-area-inset-bottom))` |
| BottomNav padding-top | `padding-top` | `0.5rem` |
| Main padding-bottom (authed) | `padding-bottom` | `calc(56px + env(safe-area-inset-bottom) + 1rem)` |

### viewport-fit=cover の前提

- `apps/web/index.html` で既に設定済: `<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />`
- これで `env(safe-area-inset-*)` が iOS Safari で有効化される

### Tailwind v4 での書き方

Tailwind v4 は `style={{...}}` で `env()` を直接渡せる。preset 拡張不要。

将来 utility class 化するなら `@yesman/ui` の Tailwind preset に追加:
```ts
spacing: { "safe-top": "env(safe-area-inset-top)", "safe-bottom": "env(safe-area-inset-bottom)" }
```
本 PR では style prop 直書きで十分。

---

## 6. 設計 4: Active states (全 button/link)

### 変更対象

- `packages/ui/src/primitives/Button.tsx`

### 変更内容

既存の Button variant に `active:scale-[0.98]` を追加 (現状 primary/success のみ `active:` あり):

```tsx
const buttonStyles = cva(
  "rounded-xl font-bold transition-all active:scale-[0.98]",  // ← active:scale-[0.98] を base に追加
  {
    variants: {
      variant: {
        primary: "bg-brand-600 text-neutral-0 hover:bg-brand-700 active:bg-brand-700",
        secondary: "bg-neutral-100 text-neutral-800 hover:bg-neutral-200 active:bg-neutral-300",
        ghost: "bg-transparent text-neutral-700 hover:bg-neutral-100 active:bg-neutral-200",
        success: "bg-success text-neutral-0 hover:opacity-90 active:opacity-90",
        muted: "bg-silence text-neutral-0 hover:opacity-90 active:opacity-90",
      },
      // size 等は変更なし
    },
  },
);
```

- `transition-all` で smooth animation
- `prefers-reduced-motion: reduce` ユーザーは Tailwind の動作で自動緩和される (`transition` は残るが scale の差分はわずか)

### Card primitive

`packages/ui/src/primitives/Card.tsx` は `<Link>` の child として使われるケースが多い (HomePage の nav card)。Card 自体に active state は付けず、**呼び出し側の `<Link>` で `active:scale-[0.98]` を必要に応じて適用**する設計。

---

## 7. 設計 5: Skeleton loader primitive (新規)

### 変更対象

- `packages/ui/src/primitives/Skeleton.tsx` (新規)
- `packages/ui/src/primitives/index.ts` (export 追加)

### 実装

```tsx
/**
 * Skeleton — loading state 用の灰色 pulse box.
 *
 * 用途: Spinner の代替として、コンテンツの形状を予兆させる skeleton card 表示。
 * prefers-reduced-motion: reduce 時は pulse animation を停止。
 */
import type { CSSProperties } from "react";

export interface SkeletonProps {
  /** 幅 (Tailwind class or inline、デフォルト: "w-full") */
  className?: string;
  /** width/height を直接指定する場合 */
  style?: CSSProperties;
}

export function Skeleton({ className = "", style }: SkeletonProps) {
  return (
    <div
      className={
        "rounded-lg bg-neutral-200 animate-pulse motion-reduce:animate-none " +
        className
      }
      style={style}
      aria-hidden="true"
    />
  );
}
```

### 使用例 (ScorePage の Spinner 置換)

```tsx
// Before
if (isPending) return <Spinner />;

// After
if (isPending) {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-48 w-full" />  {/* radial 円相当 */}
      <Skeleton className="h-12 w-full" />  {/* AI bubble 相当 */}
      <Skeleton className="h-32 w-full" />  {/* line chart 相当 */}
      <Skeleton className="h-4 w-32" />     {/* stats 相当 */}
      <Skeleton className="h-20 w-full" />  {/* 履歴 card 1 */}
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-20 w-full" />
    </div>
  );
}
```

### 適用箇所

| ファイル | 適用 |
|---|---|
| `apps/web/src/features/score/ScorePage.tsx` | 全ページ skeleton |
| `apps/web/src/features/decision/DecisionResult.tsx` | streaming 中の utterance bubble 待ちで skeleton bubble × 3 |
| `apps/web/src/features/persona/PersonaListPage.tsx` | 全ページ skeleton |
| `apps/web/src/features/preference/PreferencePage.tsx` | 全ページ skeleton |
| `apps/web/src/features/home/HomePage.tsx` | (既に skeleton 実装済、変更なし) |

---

## 8. 設計 6: Page transitions (View Transitions API)

### 変更対象

- `apps/web/src/shell/usePageTransition.ts` (新規)
- `apps/web/src/shell/main.tsx` or routes (適用)

### 実装

View Transitions API は `document.startViewTransition(callback)` で cross-fade を発火。React Router v6 と組合せる方法:

```ts
/**
 * usePageTransition — View Transitions API で route 切替時に cross-fade.
 *
 * Chrome 111+ / Safari TP で動作。Firefox は instant fallback (no-op)。
 * prefers-reduced-motion: reduce 時は無効化。
 */
import { useEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

export function usePageTransition() {
  const { pathname } = useLocation();
  const navigationType = useNavigationType();
  const prevPathRef = useRef(pathname);

  useEffect(() => {
    if (prevPathRef.current === pathname) return;
    prevPathRef.current = pathname;

    // prefers-reduced-motion 尊重
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    // POP (back/forward) は browser native の transition に任せる
    if (navigationType === "POP") return;

    // View Transitions API 未対応 (Firefox) は no-op
    const docWithVT = document as Document & {
      startViewTransition?: (cb: () => void) => unknown;
    };
    if (!docWithVT.startViewTransition) return;

    // Note: 既に DOM 更新が始まっているケースが多いため、
    // 厳密な before/after capture は React の限界で困難。
    // 簡易版として CSS の view-transition-name + fade animation を main に当てる。
  }, [pathname, navigationType]);
}
```

**実装の現実的な落とし所**:

React Router v6 の lifecycle は View Transitions API と完全に integrate しにくい。代替案として **CSS のみで pseudo-transition** を実現する:

```css
/* main.css に追加 */
@view-transition {
  navigation: auto;
}

::view-transition-old(root),
::view-transition-new(root) {
  animation-duration: 200ms;
}

@media (prefers-reduced-motion: reduce) {
  ::view-transition-old(root),
  ::view-transition-new(root) {
    animation: none;
  }
}
```

ただし `@view-transition { navigation: auto; }` は MPA (Multi-Page App) 用で SPA では効かない。SPA で確実に動かすなら hook 経由が必要。

**最終方針**:
- hook `usePageTransition()` を Layout で呼ぶ
- 内部実装は View Transitions API を呼ぶラッパー (React Router の `useNavigate` を override する形)
- Firefox / 未対応ブラウザは silent no-op
- 効果が薄ければ削除 (後段で判断)

### YAGNI 判断

実装が React Router v6 の API と相性が悪く、効果も微妙な可能性があれば **本機能はスキップ** して、Active states (B-1) + Skeleton (B-2) + Haptic (B-4) のみで microinteractions を完成させる選択肢もある。Plan 段階で実装難度を再評価し、必要なら scope から外す。

---

## 9. 設計 7: Haptic feedback (Yes 採択時)

### 変更対象

- `apps/web/src/features/decision/DecisionResult.tsx`

### 変更内容

既存の `fireConfetti()` 関数 (Pack A で追加) の直後に vibrate を追加:

```tsx
const fireConfetti = () => {
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
    return;
  }
  confetti({
    particleCount: 50,
    spread: 80,
    origin: { y: 0.2 },
    colors: ["#9F88C8", "#E8775A", "#FFD6E0"],
    ticks: 150,
    scalar: 1.1,
  });
  // ← 追加: Haptic feedback (Android のみ動作、iOS は no-op)
  if ("vibrate" in navigator) {
    navigator.vibrate(50); // 50ms 短振動
  }
};
```

- `navigator.vibrate(50)` — Android Chrome で動作、iOS Safari は無視 (no-op、エラー無し)
- `prefers-reduced-motion: reduce` 時は既存の confetti early return と同じパスでスキップされる
- 50ms は「クリック感」相当 (10ms = 弱、100ms = 強)

---

## 10. テスト戦略

### 新規テスト

#### Unit (Vitest)

- `apps/web/tests/shell/BottomNav.test.tsx` (新規):
  - 4 tab がレンダリングされる
  - `/` で 🏠 Home が active
  - `/decision` で 💭 決定 が active
  - `/personas` ではすべて inactive (active tab なし)
  - tap で href 遷移確認 (`closest("a").getAttribute("href")`)

- `apps/web/tests/shell/Layout.test.tsx` (修正 or 新規):
  - sticky header の class 検証 (`sticky top-0 z-40`)
  - 未認証時に BottomNav 非表示
  - 認証時に BottomNav 表示
  - main の padding-bottom が認証時のみ拡張される

- `packages/ui/tests/primitives/Skeleton.test.tsx` (新規):
  - 基本 render (rounded + bg-neutral-200 + animate-pulse class)
  - `aria-hidden="true"`
  - className prop が merge される

#### E2E (Playwright Mobile Chrome)

- `tests/e2e/tests/inception-mobile.spec.ts` (修正):
  - 既存 `Header (logo + nav + Sign out) が viewport 内に収まる` → 「logo + Sign out が viewport 内」に修正 (nav icons 削除)
  - 新規追加:
    - `Bottom Navigation Bar が画面下に固定表示される`
    - `4 tab の tap target が 44×44px 以上`
    - `tab tap で active 状態が切替わる`
    - `/auth/splash で BottomNav は非表示`

### 既存テストへの回帰チェック

- `tests/e2e/tests/inception-mobile.spec.ts` の他のテスト (viewport / scroll / cards) は影響なし
- `tests/e2e/tests/inception-design.spec.ts` の Header logo テスト (= 既に「🪞 YesMan」exact match に修正済) は影響なし
- ScorePage test は msw mock 通り PASS

### 検証コマンド

```bash
# Unit
pnpm -F @yesman/web test
pnpm -F @yesman/ui test  # Skeleton test

# Lint + build
pnpm -F @yesman/web lint && pnpm -F @yesman/web build

# E2E
pnpm -F @yesman/e2e test
```

---

## 11. 実装順序とコミット粒度

依存順 + 段階的 ship:

| Step | 設計 | 内容 | コミット |
|:----:|:----:|------|---------|
| 1 | #5 | Skeleton primitive 新規 + export + test | `feat(ui): Skeleton primitive を追加` |
| 2 | #6 | Button primitive に `active:scale-[0.98]` 追加 | `feat(ui): Button に active:scale-[0.98] microinteraction 追加` |
| 3 | #2 | BottomNav component 新規 + test | `feat(web): BottomNav 4-tab navigation を追加` |
| 4 | #1 + #3 | Layout 改修 (sticky header + safe area + BottomNav 配置) + test | `feat(web): Layout に sticky header + safe area + BottomNav を統合` |
| 5 | #7 | ScorePage / PersonaList / PreferencePage / DecisionResult を Spinner → Skeleton 置換 | `refactor(web): Spinner を Skeleton card に置換 (4 page)` |
| 6 | #9 | DecisionResult に `navigator.vibrate(50)` 追加 | `feat(web): Yes 採択時に haptic feedback を追加` |
| 7 | #8 | usePageTransition hook + Layout 適用 (or skip 判断) | `feat(web): View Transitions API で page transitions を追加` |
| 8 | テスト | e2e mobile spec 更新 + 新規 4 tab tap target test | `test(e2e): BottomNav + 簡素化 header を反映` |

各 commit は単独で動作 / テスト PASS の状態を保つ (機能トグル不要、漸進的に effects 追加)。

**実装順序の論理**:
- Step 1-2: UI primitive 拡張 (基盤)
- Step 3-4: 大きな構造変更 (Layout + BottomNav)
- Step 5: 既存ページの Spinner → Skeleton 置換 (見栄え)
- Step 6: 微小機能追加 (haptic)
- Step 7: 効果が読みにくいので最後に試す (skip 可)
- Step 8: テスト同期

### PR

8 commit を 1 PR にまとめて `feature/web-mobile-app-polish → develop`。PR タイトル候補:

> `feat(web,ui): Mobile App Polish — Bottom Nav + Safe Area + Sticky Header + Microinteractions`

---

## 12. リスクとオープン論点

| ID  | 論点 | 対応方針 |
|-----|------|----------|
| O1 | View Transitions API は Firefox 未対応 | fallback で即時遷移 (許容、デモは Chrome ベース)。実装難度が高い場合は本機能 skip |
| O2 | iOS Safari の `navigator.vibrate` 無視 | Android 限定で振動。iOS では no-op、エラー無し |
| O3 | sticky header + bottom nav で main 領域が縮む | iPhone 13 (844px) で header ~80px + bottom nav ~88px = 916px 残る (88%)、十分 |
| O4 | INCEPTION drawio (top nav icons) からの乖離 | aidlc-docs Post-CONSTRUCTION v3 改修注記で明示 (別 PR で対応、本 PR ではコード変更のみ) |
| O5 | bottom nav から persona/preference にアクセス不可 | Home Hub の nav card は残す。決勝以降にユーザーフィードバック次第で 5 tab 化検討 |
| O6 | Tailwind v4 で `env()` を `style={{}}` で渡す方法は標準か | はい。Tailwind v4 は CSS-in-JS 互換、`style` prop で env() を渡せる。preset 拡張は将来 |
| O7 | BottomNav の z-index と既存 Modal/Toast との衝突 | BottomNav `z-40`、Modal `z-50`、Toast `z-50`。Modal 表示中は BottomNav 上書きされる (期待動作) |
| O8 | 既存の HomePage nav cards は冗長になるか? | いいえ。Home Hub は「全機能の入口」として保持、bottom nav は「常時 4 動線」。重複ではなく階層的設計 |
| O9 | Sign out が header 右上に残ると、誤タップ事故が増えないか | size=sm + 文字色 neutral で目立たせない。深刻な誤タップは現状もなく許容 |

---

## 13. 完了の定義 (DoD)

- [ ] iPhone 13 (Mobile Chrome DevTools or 実機 Safari) で開いて、Top header に logo + Sign out のみ表示、Bottom Nav 4 tab 表示、notch / home indicator がコンテンツに被らない、を目視確認
- [ ] `/score`, `/decision`, `/`, `/profile` 各 page で対応 tab が active 表示される
- [ ] `/personas`, `/preferences` ではすべての tab が inactive (active tab なし)
- [ ] 未認証 `/auth/splash` では BottomNav 非表示
- [ ] Yes 採択時に Android 端末で 50ms 振動を体感 (iOS は無視)
- [ ] 全 Web unit test PASS (+ 新規 BottomNav / Skeleton tests)
- [ ] e2e Playwright 全 PASS (mobile spec 更新含む)
- [ ] lint 0 errors / build size-limit OK
- [ ] (任意) View Transitions API による cross-fade を Chrome で確認、Firefox で fallback 動作確認
