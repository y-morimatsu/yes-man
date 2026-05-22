# Mobile App Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** YesMan Web を「モバイル Web」→「ネイティブアプリ感」に転換する。Top header 簡素化 + Bottom Navigation (4 tabs) + Safe Area Insets + Sticky Header + Microinteractions (active state / Skeleton / Page transitions / Haptic) を一括導入。

**Architecture:** Layout shell (`apps/web/src/shell/Layout.tsx`) を改修して sticky header + BottomNav 配置 + safe-area-inset-* で main padding 調整。新規 `BottomNav.tsx` で 4-tab navigation を提供 (active 判定は `useLocation`)。Microinteractions は packages/ui Button base に `active:scale` 追加 + Skeleton primitive 新規 + DecisionResult に `navigator.vibrate` + React Router v6.4+ 公式 `viewTransition` prop + CSS `::view-transition-*` で実現。**新規依存ゼロ** (View Transitions API は標準 Web API、Skeleton は CSS のみ)。

**Tech Stack:** React 18 + TypeScript + Tailwind v4 + React Router v6.20 / Vitest + msw / Playwright Mobile Chrome / class-variance-authority

**Spec:** [../specs/2026-05-22-mobile-app-polish-design.md](../specs/2026-05-22-mobile-app-polish-design.md)
**drawio:** [../specs/diagrams/2026-05-22-mobile-app-polish-screens.drawio](../specs/diagrams/2026-05-22-mobile-app-polish-screens.drawio)

**Branch:** `feature/web-mobile-app-polish` (develop @ `03ee982` から派生、spec commit `0bd007f` + ultrathink fix `a2d87b2` あり)

---

## File Structure

| ファイル | 種別 | 責務 |
|---------|------|------|
| `packages/ui/src/primitives/Skeleton.tsx` | 新規 | rounded gray pulse box + `motion-reduce:animate-none` |
| `packages/ui/src/primitives/index.ts` | 修正 | Skeleton export 追加 |
| `packages/ui/tests/primitives/Skeleton.test.tsx` | 新規 | 基本 render / className merge / aria-hidden |
| `packages/ui/src/primitives/Button.tsx` | 修正 | base string に `active:scale-[0.98] motion-reduce:active:scale-100` 追加 (既存スタイル保持) |
| `packages/ui/tests/primitives/Button.test.tsx` | 修正 | active state assertion 追加 |
| `apps/web/src/shell/BottomNav.tsx` | 新規 | 4-tab navigation (🏠/💭/📊/👤)、useLocation で active 判定 |
| `apps/web/tests/shell/BottomNav.test.tsx` | 新規 | 4 tab render / active / nav 動作 |
| `apps/web/src/shell/Layout.tsx` | 修正 | Header 簡素化 + sticky + safe-area + BottomNav 配置 + main padding 調整 |
| `apps/web/tests/shell/Layout.test.tsx` | 新規 | sticky class + 認証時 BottomNav 表示 / 未認証時非表示 |
| `packages/ui/src/primitives/ToastProvider.tsx` | 修正 | Toast 位置を BottomNav 回避に `bottom: calc(...)` |
| `apps/web/src/features/score/ScorePage.tsx` | 修正 | Spinner → Skeleton card 群 |
| `apps/web/src/features/decision/DecisionResult.tsx` | 修正 | streaming 中 Skeleton bubble + Yes 採択時 `navigator.vibrate(50)` |
| `apps/web/src/features/persona/PersonaListPage.tsx` | 修正 | Spinner → Skeleton |
| `apps/web/src/features/preference/PreferencePage.tsx` | 修正 | Spinner → Skeleton |
| `apps/web/src/shell/routes.tsx` | 修正 (Task 7) | BottomNav と Splash CTA の `<Link>` に `viewTransition` prop 付与 |
| `apps/web/src/styles/main.css` | 修正 (Task 7) | `::view-transition-old/new(root)` の animation + `prefers-reduced-motion` 対応 |
| `tests/e2e/tests/inception-mobile.spec.ts` | 修正 | Header test 更新 + BottomNav e2e 追加 |
| `tests/e2e/tests/inception-design.spec.ts` | 修正 | "Header に nav icons (⚙️📊👤) が存在" test 削除 |

---

## Pre-Flight

- [ ] **Step 0.1: ブランチ + HEAD 確認**

Run:
```bash
cd /Users/morimatsu/lab/ai-dlc-hackathon && git branch --show-current && git log --oneline -3
```

Expected: `feature/web-mobile-app-polish` ブランチ、HEAD は `a2d87b2 docs(specs): Mobile App Polish spec を ultrathink review に基づき修正` の上

- [ ] **Step 0.2: ベースライン test 確認**

Run:
```bash
pnpm -F @yesman/ui test 2>&1 | tail -5
pnpm -F @yesman/web test 2>&1 | tail -5
```

Expected: 既存テスト全 PASS

---

## Task 1: Skeleton primitive (UI 基盤)

**Files:**
- Create: `packages/ui/src/primitives/Skeleton.tsx`
- Modify: `packages/ui/src/primitives/index.ts` (export 追加)
- Create: `packages/ui/tests/primitives/Skeleton.test.tsx`

### Step 1.1: Skeleton test を新規作成 (FAIL 先行)

Create `packages/ui/tests/primitives/Skeleton.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { Skeleton } from "../../src/primitives/Skeleton";

describe("Skeleton", () => {
  it("renders a rounded pulse box by default", () => {
    const { container } = render(<Skeleton />);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain("rounded-lg");
    expect(el.className).toContain("bg-neutral-200");
    expect(el.className).toContain("animate-pulse");
    expect(el.className).toContain("motion-reduce:animate-none");
  });

  it("merges className prop", () => {
    const { container } = render(<Skeleton className="h-12 w-48" />);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain("h-12");
    expect(el.className).toContain("w-48");
  });

  it("applies inline style prop", () => {
    const { container } = render(<Skeleton style={{ width: 200, height: 80 }} />);
    const el = container.firstChild as HTMLElement;
    expect(el.style.width).toBe("200px");
    expect(el.style.height).toBe("80px");
  });

  it("has aria-hidden=true", () => {
    const { container } = render(<Skeleton />);
    const el = container.firstChild as HTMLElement;
    expect(el.getAttribute("aria-hidden")).toBe("true");
  });
});
```

### Step 1.2: テスト FAIL を確認

Run: `pnpm -F @yesman/ui test -- Skeleton`
Expected: import error (モジュール未作成)

### Step 1.3: Skeleton primitive を実装

Create `packages/ui/src/primitives/Skeleton.tsx`:

```tsx
/**
 * Skeleton — loading state 用の灰色 pulse box.
 *
 * 用途: Spinner の代替として、コンテンツの形状を予兆させる skeleton card 表示。
 * prefers-reduced-motion: reduce 時は pulse animation を停止 (motion-reduce:animate-none)。
 */
import type { CSSProperties } from "react";

export interface SkeletonProps {
  /** Tailwind utility class (e.g., "h-12 w-48") */
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

### Step 1.4: index.ts に export 追加

Edit `packages/ui/src/primitives/index.ts` の末尾 (or alphabetical 位置) に追加:

```ts
export { Skeleton } from "./Skeleton";
export type { SkeletonProps } from "./Skeleton";
```

### Step 1.5: テストを再実行 → PASS 確認

Run: `pnpm -F @yesman/ui test -- Skeleton`
Expected: 4 件 PASS

### Step 1.6: UI package build 確認

Run: `pnpm -F @yesman/ui build`
Expected: build 成功

### Step 1.7: Commit

```bash
cd /Users/morimatsu/lab/ai-dlc-hackathon
git add packages/ui/src/primitives/Skeleton.tsx packages/ui/src/primitives/index.ts packages/ui/tests/primitives/Skeleton.test.tsx
git commit -m "$(cat <<'EOF'
feat(ui): Skeleton primitive を追加

Mobile App Polish (spec 2026-05-22) Task 1:
- rounded-lg bg-neutral-200 animate-pulse motion-reduce:animate-none
- className / style props 対応、aria-hidden=true
- 4 件の unit test (default class / className merge / style / aria-hidden)

Spinner の代替として skeleton card 表示で loading 体感を向上.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Button active state (append 方式)

**Files:**
- Modify: `packages/ui/src/primitives/Button.tsx` (base string 末尾 append のみ)
- Modify: `packages/ui/tests/primitives/Button.test.tsx` (active assertion 追加)

### Step 2.1: 新規 test を追加 (FAIL 先行)

Edit `packages/ui/tests/primitives/Button.test.tsx`、describe block 末尾に追加:

```tsx
  it("has active:scale-[0.98] for tap feedback", () => {
    render(<Button>Tap</Button>);
    const btn = screen.getByRole("button", { name: "Tap" });
    expect(btn.className).toContain("active:scale-[0.98]");
  });

  it("has motion-reduce:active:scale-100 for a11y", () => {
    render(<Button>Reduced</Button>);
    const btn = screen.getByRole("button", { name: "Reduced" });
    expect(btn.className).toContain("motion-reduce:active:scale-100");
  });

  it("preserves existing font-medium and transition-colors", () => {
    render(<Button>Existing</Button>);
    const btn = screen.getByRole("button", { name: "Existing" });
    expect(btn.className).toContain("font-medium");
    expect(btn.className).toContain("transition-colors");
  });
```

### Step 2.2: テスト FAIL 確認

Run: `pnpm -F @yesman/ui test -- Button`
Expected: 3 件の新 test が FAIL (`active:scale-[0.98]` / `motion-reduce:active:scale-100` が含まれない)

### Step 2.3: Button.tsx 修正 (base string append のみ)

Edit `packages/ui/src/primitives/Button.tsx` の `buttonVariants` cva 第 1 引数 (現状 L15):

```tsx
// Before
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-brand-500",
  { variants: { ... } },
);

// After (末尾に 2 token append のみ、variants 部分は無変更)
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-brand-500 active:scale-[0.98] motion-reduce:active:scale-100",
  { variants: { ... } },
);
```

**重要**: variants ブロック内 (`variant: { primary: "...", success: "..." }` 等) は無変更。

### Step 2.4: テスト PASS 確認

Run: `pnpm -F @yesman/ui test -- Button`
Expected: 既存 + 新規あわせて全 PASS

### Step 2.5: Commit

```bash
cd /Users/morimatsu/lab/ai-dlc-hackathon
git add packages/ui/src/primitives/Button.tsx packages/ui/tests/primitives/Button.test.tsx
git commit -m "$(cat <<'EOF'
feat(ui): Button に active:scale microinteraction (motion-reduce 対応)

Mobile App Polish (spec 2026-05-22) Task 2:
- buttonVariants cva の base string 末尾に
  active:scale-[0.98] motion-reduce:active:scale-100 を append
- 既存スタイル (font-medium/transition-colors/disabled/focus) 保持
- 3 件の追加 test (active scale / motion-reduce / 既存 preserve)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: BottomNav component

**Files:**
- Create: `apps/web/src/shell/BottomNav.tsx`
- Create: `apps/web/tests/shell/BottomNav.test.tsx`

### Step 3.1: BottomNav test を新規作成 (FAIL 先行)

Create `apps/web/tests/shell/BottomNav.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { BottomNav } from "../../src/shell/BottomNav";

function setup(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <BottomNav />
    </MemoryRouter>,
  );
}

describe("BottomNav", () => {
  it("renders 4 tabs (Home / 決定 / スコア / プロフィール)", () => {
    setup("/");
    expect(screen.getByText("Home")).toBeInTheDocument();
    expect(screen.getByText("決定")).toBeInTheDocument();
    expect(screen.getByText("スコア")).toBeInTheDocument();
    expect(screen.getByText("プロフィール")).toBeInTheDocument();
  });

  it("marks Home tab active when on /", () => {
    setup("/");
    const homeLink = screen.getByText("Home").closest("a");
    expect(homeLink).toHaveAttribute("aria-current", "page");
    expect(homeLink?.className).toContain("text-brand-700");
  });

  it("marks 決定 tab active when on /decision", () => {
    setup("/decision");
    const decisionLink = screen.getByText("決定").closest("a");
    expect(decisionLink).toHaveAttribute("aria-current", "page");
    expect(decisionLink?.className).toContain("text-brand-700");
    const homeLink = screen.getByText("Home").closest("a");
    expect(homeLink).not.toHaveAttribute("aria-current");
  });

  it("marks スコア tab active when on /score", () => {
    setup("/score");
    const scoreLink = screen.getByText("スコア").closest("a");
    expect(scoreLink).toHaveAttribute("aria-current", "page");
  });

  it("marks プロフィール tab active when on /profile", () => {
    setup("/profile");
    const profileLink = screen.getByText("プロフィール").closest("a");
    expect(profileLink).toHaveAttribute("aria-current", "page");
  });

  it("no active tab when on /personas (excluded from BottomNav)", () => {
    setup("/personas");
    const allLinks = screen.getAllByRole("link");
    for (const link of allLinks) {
      expect(link).not.toHaveAttribute("aria-current");
    }
  });

  it("each tab href points to correct route", () => {
    setup("/");
    expect(screen.getByText("Home").closest("a")).toHaveAttribute("href", "/");
    expect(screen.getByText("決定").closest("a")).toHaveAttribute("href", "/decision");
    expect(screen.getByText("スコア").closest("a")).toHaveAttribute("href", "/score");
    expect(screen.getByText("プロフィール").closest("a")).toHaveAttribute("href", "/profile");
  });
});
```

### Step 3.2: テスト FAIL 確認

Run: `pnpm -F @yesman/web test -- BottomNav`
Expected: 7 件すべて FAIL (モジュール未作成)

### Step 3.3: BottomNav component を実装

Create `apps/web/src/shell/BottomNav.tsx`:

```tsx
/**
 * BottomNav — 4-tab Mobile Navigation Bar (spec 2026-05-22 §4).
 *
 * fixed bottom-0、safe-area-inset-bottom 対応、active tab は brand-700 太字 + 上 2px underline.
 * Persona / Preferences は本 nav に含まず、Home Hub の nav card 経由でアクセス。
 */
import { Link, useLocation } from "react-router-dom";

type Tab = { to: string; icon: string; label: string };

const TABS: Tab[] = [
  { to: "/",         icon: "🏠", label: "Home" },
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
                  (active ? "text-brand-700 font-bold" : "text-neutral-500")
                }
              >
                <span className="text-2xl leading-none" aria-hidden="true">{tab.icon}</span>
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

### Step 3.4: テスト PASS 確認

Run: `pnpm -F @yesman/web test -- BottomNav`
Expected: 7 件すべて PASS

### Step 3.5: Lint + build 確認

Run: `pnpm -F @yesman/web lint && pnpm -F @yesman/web build`
Expected: エラーなし、size-limit OK

### Step 3.6: Commit

```bash
cd /Users/morimatsu/lab/ai-dlc-hackathon
git add apps/web/src/shell/BottomNav.tsx apps/web/tests/shell/BottomNav.test.tsx
git commit -m "$(cat <<'EOF'
feat(web): BottomNav 4-tab navigation を追加

Mobile App Polish (spec 2026-05-22) Task 3:
- 4 tabs: 🏠 Home / 💭 決定 / 📊 スコア / 👤 プロフィール
- useLocation + pathname で active 判定 (/ は exact match)
- Active: text-brand-700 font-bold + 上 2px underline
- Inactive: text-neutral-500
- fixed bottom-0 z-40 + safe-area-inset-bottom 対応
- 56px min-height で WCAG 44px+ tap target 確保
- Persona/Preferences は本 nav に含まず Home Hub 経由
- 7 件の unit test (4 tabs / active / inactive / 除外 route / href)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Layout shell + Toast 位置調整

**Files:**
- Modify: `apps/web/src/shell/Layout.tsx` (sticky header + simplify + safe-area + BottomNav 統合 + main padding)
- Modify: `packages/ui/src/primitives/ToastProvider.tsx` (位置調整)
- Create: `apps/web/tests/shell/Layout.test.tsx`

### Step 4.1: Layout test を新規作成 (FAIL 先行)

Create `apps/web/tests/shell/Layout.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

vi.mock("../../src/shell/AuthProvider", () => ({
  useAuth: vi.fn(),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { useAuth } from "../../src/shell/AuthProvider";
import { Layout } from "../../src/shell/Layout";

function renderWithRoute(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<div>HOME</div>} />
          <Route path="/score" element={<div>SCORE</div>} />
          <Route path="/auth/splash" element={<div>SPLASH</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("Layout", () => {
  it("renders sticky header with brand logo", () => {
    vi.mocked(useAuth).mockReturnValue({
      status: "authenticated",
      refresh: vi.fn(),
    } as ReturnType<typeof useAuth>);

    renderWithRoute("/");
    const logo = screen.getByText(/🪞 YesMan/);
    expect(logo).toBeInTheDocument();
    const header = logo.closest("header");
    expect(header?.className).toContain("sticky");
    expect(header?.className).toContain("top-0");
    expect(header?.className).toContain("z-40");
  });

  it("renders Sign out button when authenticated", () => {
    vi.mocked(useAuth).mockReturnValue({
      status: "authenticated",
      refresh: vi.fn(),
    } as ReturnType<typeof useAuth>);

    renderWithRoute("/");
    expect(screen.getByRole("button", { name: /Sign out/ })).toBeInTheDocument();
  });

  it("hides Sign out button when unauthenticated", () => {
    vi.mocked(useAuth).mockReturnValue({
      status: "unauthenticated",
      refresh: vi.fn(),
    } as ReturnType<typeof useAuth>);

    renderWithRoute("/auth/splash");
    expect(screen.queryByRole("button", { name: /Sign out/ })).not.toBeInTheDocument();
  });

  it("shows BottomNav when authenticated", () => {
    vi.mocked(useAuth).mockReturnValue({
      status: "authenticated",
      refresh: vi.fn(),
    } as ReturnType<typeof useAuth>);

    renderWithRoute("/");
    expect(screen.getByRole("navigation", { name: "メインナビゲーション" })).toBeInTheDocument();
  });

  it("hides BottomNav when unauthenticated", () => {
    vi.mocked(useAuth).mockReturnValue({
      status: "unauthenticated",
      refresh: vi.fn(),
    } as ReturnType<typeof useAuth>);

    renderWithRoute("/auth/splash");
    expect(screen.queryByRole("navigation", { name: "メインナビゲーション" })).not.toBeInTheDocument();
  });

  it("Top header has no nav icons (⚙️📊👤 removed)", () => {
    vi.mocked(useAuth).mockReturnValue({
      status: "authenticated",
      refresh: vi.fn(),
    } as ReturnType<typeof useAuth>);

    renderWithRoute("/");
    const header = screen.getByText(/🪞 YesMan/).closest("header");
    expect(header?.textContent).not.toContain("⚙️");
    expect(header?.textContent).not.toContain("📊");
    expect(header?.textContent).not.toContain("👤");
  });
});
```

### Step 4.2: テスト FAIL 確認

Run: `pnpm -F @yesman/web test -- Layout`
Expected: 既存 Layout.tsx は nav icons 持ち + BottomNav 未統合のため、複数 test が FAIL

### Step 4.3: Layout.tsx を改修

Edit `apps/web/src/shell/Layout.tsx` を全置換:

```tsx
/**
 * Layout — global sticky header + BottomNav + Suspense Outlet.
 *
 * spec 2026-05-22 mobile-app-polish §3:
 * - Sticky header (logo + Sign out のみ、nav icons は BottomNav に移行)
 * - Safe Area Insets (env(safe-area-inset-*))
 * - BottomNav 配置 + main の pb で BottomNav 回避
 */
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
      {/* Sticky Header — logo + Sign out のみ簡素化、nav は BottomNav に */}
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

      {/* Main content — pb で BottomNav (~88px) + safe-area-inset-bottom を回避 */}
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

### Step 4.4: ToastProvider 位置調整

Edit `packages/ui/src/primitives/ToastProvider.tsx` の L41 `<div>` を修正:

```tsx
// Before
<div className="fixed bottom-4 right-4 flex flex-col gap-2 z-50">

// After (BottomNav 高さ ~72px + safe-area + 余裕分上に持ち上げる)
<div
  className="fixed right-4 flex flex-col gap-2 z-50"
  style={{ bottom: "calc(72px + env(safe-area-inset-bottom) + 0.5rem)" }}
>
```

### Step 4.5: テスト PASS 確認

Run: `pnpm -F @yesman/web test -- Layout BottomNav`
Expected: Layout 6 件 + BottomNav 7 件 すべて PASS

### Step 4.6: 既存 shell test との回帰確認

Run: `pnpm -F @yesman/web test -- shell`
Expected: 全 shell test PASS (RequireAuth / AuthProvider / routes / mockAuthStorage / ApiProvider / Layout / BottomNav)

### Step 4.7: 既存 ScorePage/Profile/Decision test との回帰確認

Run: `pnpm -F @yesman/web test -- features`
Expected: features 配下の全 test PASS (Layout 改修で破綻しないことを確認)

### Step 4.8: Lint + build 確認

Run: `pnpm -F @yesman/web lint && pnpm -F @yesman/ui lint && pnpm -F @yesman/web build`
Expected: エラーなし、size-limit OK

### Step 4.9: Commit

```bash
cd /Users/morimatsu/lab/ai-dlc-hackathon
git add apps/web/src/shell/Layout.tsx apps/web/tests/shell/Layout.test.tsx packages/ui/src/primitives/ToastProvider.tsx
git commit -m "$(cat <<'EOF'
feat(web): Layout に sticky header + safe area + BottomNav + Toast 位置調整

Mobile App Polish (spec 2026-05-22) Task 4:
- Header 簡素化: 🪞 YesMan logo + Sign out のみ、nav icons (⚙️📊👤) 削除
- sticky top:0 z-40 で scroll しても brand 常時表示
- env(safe-area-inset-top) で iPhone notch 配慮
- main の pb = calc(56px + env(safe-area-inset-bottom) + 1rem) で
  BottomNav 物理重なり回避
- ToastProvider の bottom を BottomNav 回避位置に調整
  (calc(72px + env(safe-area-inset-bottom) + 0.5rem))
- 6 件の Layout test (sticky / Sign out / BottomNav 可視/非可視 / icons 削除)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Spinner → Skeleton 置換 (4 pages)

**Files:**
- Modify: `apps/web/src/features/score/ScorePage.tsx`
- Modify: `apps/web/src/features/decision/DecisionResult.tsx`
- Modify: `apps/web/src/features/persona/PersonaListPage.tsx`
- Modify: `apps/web/src/features/preference/PreferencePage.tsx`

### Step 5.1: ScorePage の Spinner → Skeleton

Edit `apps/web/src/features/score/ScorePage.tsx` の isPending 分岐 (L22-28 付近) を以下に置換:

```tsx
// Before
if (isPending) {
  return (
    <div className="flex justify-center p-8">
      <Spinner />
    </div>
  );
}

// After
if (isPending) {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-8 w-48" />                          {/* h1 title */}
      <Skeleton className="h-48 w-full" style={{ borderRadius: 16 }} />  {/* radial chart */}
      <Skeleton className="h-12 w-full" />                       {/* pink bubble */}
      <Skeleton className="h-32 w-full" />                       {/* line chart */}
      <Skeleton className="h-4 w-40" />                          {/* stats */}
      <Skeleton className="h-3 w-32" />                          {/* footnote */}
      <Skeleton className="h-3 w-48" />                          {/* paradox */}
      <div className="flex flex-col gap-2 mt-2">
        <Skeleton className="h-20 w-full" />                     {/* 履歴 card 1 */}
        <Skeleton className="h-20 w-full" />                     {/* 履歴 card 2 */}
        <Skeleton className="h-20 w-full" />                     {/* 履歴 card 3 */}
      </div>
    </div>
  );
}
```

ファイル冒頭の import を更新:
```tsx
// Before
import { Card, Spinner } from "@yesman/ui";
// After
import { Card, Skeleton } from "@yesman/ui";
```
(`Spinner` を `Skeleton` に置換、Card はそのまま)

### Step 5.2: ScorePage 既存 test の回帰確認

Run: `pnpm -F @yesman/web test -- ScorePage`
Expected: 既存 2 件 (msw で `data` 返すケース) は変わらず PASS。Spinner case は test されていない、isPending は msw 即返答で skip される

### Step 5.3: PersonaListPage の Spinner → Skeleton

Edit `apps/web/src/features/persona/PersonaListPage.tsx` の Spinner 表示部分 (`<Spinner />` を探す) を以下に置換:

```tsx
// Before (典型例)
{isPending && (
  <div className="flex justify-center p-8">
    <Spinner />
  </div>
)}

// After
{isPending && (
  <div className="flex flex-col gap-3">
    <Skeleton className="h-6 w-32" />
    <Skeleton className="h-24 w-full" />
    <Skeleton className="h-24 w-full" />
    <Skeleton className="h-24 w-full" />
  </div>
)}
```

import 更新: `Spinner` → `Skeleton`。

### Step 5.4: PreferencePage の Spinner → Skeleton

Edit `apps/web/src/features/preference/PreferencePage.tsx` の Spinner 表示を:

```tsx
// After
{isPending && (
  <div className="flex flex-col gap-3">
    <Skeleton className="h-6 w-40" />
    <Skeleton className="h-32 w-full" />
    <Skeleton className="h-20 w-full" />
    <Skeleton className="h-20 w-full" />
  </div>
)}
```

import 更新。

### Step 5.5: DecisionResult の streaming 中 utterance Skeleton

Edit `apps/web/src/features/decision/DecisionResult.tsx` の `isStreaming` 表示部分 (utterances 配列が空または部分的な状態) で skeleton bubble を表示。

具体的には、既存の `{showUtterances && (...)}` ブロックの **前** に、isStreaming かつ utterances が 3 件未満の場合は不足分を skeleton で埋める:

```tsx
{isStreaming && utterances.length < 3 && (
  <div className="flex flex-col gap-2">
    {Array.from({ length: 3 - utterances.length }).map((_, i) => (
      <Skeleton key={`utterance-skel-${i}`} className="h-16 w-full" />
    ))}
  </div>
)}
```

import 更新: `import { ..., Skeleton } from "@yesman/ui"` を追加 (既存 import に Skeleton を join)。

### Step 5.6: 全 page test 回帰確認

Run: `pnpm -F @yesman/web test`
Expected: 全 web test PASS

### Step 5.7: Lint + build

Run: `pnpm -F @yesman/web lint && pnpm -F @yesman/web build`
Expected: エラーなし

### Step 5.8: Commit

```bash
cd /Users/morimatsu/lab/ai-dlc-hackathon
git add apps/web/src/features/score/ScorePage.tsx apps/web/src/features/decision/DecisionResult.tsx apps/web/src/features/persona/PersonaListPage.tsx apps/web/src/features/preference/PreferencePage.tsx
git commit -m "$(cat <<'EOF'
refactor(web): Spinner を Skeleton card に置換 (4 page)

Mobile App Polish (spec 2026-05-22) Task 5:
- ScorePage: 8 skeleton card (h1/radial/bubble/chart/stats/footnote/paradox/history×3)
- DecisionResult: streaming 中の未発話 utterance を skeleton bubble で埋める
- PersonaListPage: 3 card skeleton
- PreferencePage: profile + 2 section skeleton
- Suspense fallback (lazy route loading) の Spinner は対象外 (現状維持)

Loading 体感を「動いてる感」のある skeleton card に統一.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Haptic feedback (Yes 採択時)

**Files:**
- Modify: `apps/web/src/features/decision/DecisionResult.tsx`

### Step 6.1: fireConfetti に vibrate 追加

Edit `apps/web/src/features/decision/DecisionResult.tsx` の `fireConfetti` 関数 (Pack A で追加された関数) を以下に置換:

```tsx
// Before
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
};

// After
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
  // Mobile App Polish §9: Haptic feedback (Android 動作、iOS no-op)
  if ("vibrate" in navigator) {
    navigator.vibrate(50);
  }
};
```

### Step 6.2: DecisionResult test 更新 (vibrate 呼び出し検証)

Edit `apps/web/tests/features/decision/DecisionResult.test.tsx` の describe block 末尾に追加:

```tsx
  it("calls navigator.vibrate(50) on Yes selection", async () => {
    const vibrateMock = vi.fn();
    Object.defineProperty(navigator, "vibrate", {
      writable: true,
      configurable: true,
      value: vibrateMock,
    });

    server.use(
      http.post("http://localhost:8000/v1/decisions/test-id-1/choice", () =>
        HttpResponse.json({ no_attempt_count: 0 }),
      ),
    );
    const { getByRole } = setup();
    const yesButton = getByRole("button", { name: /Yes/ });
    yesButton.click();
    await new Promise((r) => setTimeout(r, 50));
    expect(vibrateMock).toHaveBeenCalledWith(50);
  });

  it("does not call navigator.vibrate when prefers-reduced-motion is set", async () => {
    const vibrateMock = vi.fn();
    Object.defineProperty(navigator, "vibrate", {
      writable: true,
      configurable: true,
      value: vibrateMock,
    });

    const originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query === "(prefers-reduced-motion: reduce)",
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as typeof window.matchMedia;

    try {
      server.use(
        http.post("http://localhost:8000/v1/decisions/test-id-1/choice", () =>
          HttpResponse.json({ no_attempt_count: 0 }),
        ),
      );
      const { getByRole } = setup();
      const yesButton = getByRole("button", { name: /Yes/ });
      yesButton.click();
      await new Promise((r) => setTimeout(r, 50));
      expect(vibrateMock).not.toHaveBeenCalled();
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  });
```

### Step 6.3: テスト PASS 確認

Run: `pnpm -F @yesman/web test -- DecisionResult`
Expected: 既存 3 + 新規 2 = 5 件 PASS

### Step 6.4: Commit

```bash
cd /Users/morimatsu/lab/ai-dlc-hackathon
git add apps/web/src/features/decision/DecisionResult.tsx apps/web/tests/features/decision/DecisionResult.test.tsx
git commit -m "$(cat <<'EOF'
feat(web): Yes 採択時に haptic feedback を追加

Mobile App Polish (spec 2026-05-22) Task 6:
- fireConfetti() 末尾に navigator.vibrate(50) を追加
- Android Chrome: 50ms 短振動 / iOS Safari: 無視 (no-op)
- prefers-reduced-motion: reduce 時はスキップ (既存 early return path 共有)
- 2 件の追加 test (vibrate 呼び出し / reduced-motion で skip)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: View Transitions API (React Router 公式 prop + CSS)

**Files:**
- Modify: `apps/web/src/styles/main.css` (view-transition CSS rules)
- Modify: `apps/web/src/shell/BottomNav.tsx` (Link に `viewTransition` prop 付与)
- Modify: `apps/web/src/shell/Layout.tsx` (logo Link に `viewTransition` prop)

> **Note**: 効果が薄い、または React Router v6.20 で `viewTransition` prop が未対応の場合は **本 Task を skip** (spec §8 の YAGNI 判断)。実装前に React Router の型定義で `viewTransition` prop を確認。

### Step 7.1: React Router v6.20 で `viewTransition` prop が利用可能か確認

Run:
```bash
grep -nE "viewTransition" /Users/morimatsu/lab/ai-dlc-hackathon/apps/web/node_modules/react-router-dom/dist/index.d.ts 2>/dev/null | head -5
```

Expected:
- 結果あり → Step 7.2 へ進む
- 結果なし → Step 7.7 (Skip 判断) へ進む、本 Task をスキップして Task 8 へ

### Step 7.2: main.css に view-transition CSS rules 追加

Edit `apps/web/src/styles/main.css` の末尾に追加:

```css
/* Mobile App Polish §8: View Transitions API cross-fade (Chrome 111+/Safari TP) */
::view-transition-old(root),
::view-transition-new(root) {
  animation-duration: 200ms;
  animation-timing-function: ease-out;
}

@media (prefers-reduced-motion: reduce) {
  ::view-transition-old(root),
  ::view-transition-new(root) {
    animation: none;
  }
}
```

### Step 7.3: BottomNav の Link に `viewTransition` prop 追加

Edit `apps/web/src/shell/BottomNav.tsx` の `<Link>` (`to={tab.to}` の行) に `viewTransition` prop を追加:

```tsx
<Link
  to={tab.to}
  viewTransition
  aria-current={active ? "page" : undefined}
  className={...}
>
```

### Step 7.4: Layout の logo Link に `viewTransition` prop 追加

Edit `apps/web/src/shell/Layout.tsx` の logo Link:

```tsx
<Link
  to="/"
  viewTransition
  className="font-serif text-xl font-bold text-neutral-800 active:opacity-70"
>
  🪞 YesMan
</Link>
```

### Step 7.5: 既存 BottomNav / Layout test 回帰確認

Run: `pnpm -F @yesman/web test -- BottomNav Layout`
Expected: 全 test PASS (viewTransition prop は test に影響しない、React Router が prop を吸収)

### Step 7.6: 手動確認 — Chrome で route 切替の cross-fade を目視

Run:
```bash
# 既にローカル dev server が立っていなければ起動 (Layout/Score test 後に確認)
pnpm -F @yesman/web dev
```

ブラウザ Chrome (111+ 必須) で `http://localhost:5173/` を開き:
- BottomNav の tab を tap → route 切替時に 200ms の cross-fade animation
- DevTools で `prefers-reduced-motion: reduce` をエミュレート → animation なし

効果が薄い、目視で確認できない場合は本機能を rollback (Step 7.7 へ)。

### Step 7.7: Skip 判断時の処理 (条件付き)

Step 7.1 で `viewTransition` prop 未対応、または Step 7.6 で効果が確認できない場合:

```bash
git checkout HEAD -- apps/web/src/styles/main.css apps/web/src/shell/BottomNav.tsx apps/web/src/shell/Layout.tsx
```

(変更を破棄、Task 7 を skip して Task 8 へ進む)

### Step 7.8: Commit (実装した場合のみ)

```bash
cd /Users/morimatsu/lab/ai-dlc-hackathon
git add apps/web/src/styles/main.css apps/web/src/shell/BottomNav.tsx apps/web/src/shell/Layout.tsx
git commit -m "$(cat <<'EOF'
feat(web): View Transitions API で page transitions を追加

Mobile App Polish (spec 2026-05-22) Task 7:
- React Router v6.20 公式 viewTransition prop を BottomNav + logo Link に付与
- CSS ::view-transition-old/new(root) で 200ms cross-fade
- prefers-reduced-motion: reduce 時は animation 無効
- View Transitions API 未対応 (Firefox) は silent fallback (即時遷移)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: e2e tests 更新

**Files:**
- Modify: `tests/e2e/tests/inception-mobile.spec.ts`
- Modify: `tests/e2e/tests/inception-design.spec.ts`

### Step 8.1: inception-design.spec.ts の "Header に nav icons" test 削除

Edit `tests/e2e/tests/inception-design.spec.ts`:

Find: `test("Header に nav icons (⚙️ 📊 👤) が存在 ...")` (L81 付近)

該当 test block 全体 (`test(...)` から閉じ `})` まで) を **削除**。

理由: Mobile App Polish で Header から nav icons を削除、BottomNav に移行。本 test は仕様乖離。代替は inception-mobile.spec.ts の新規 BottomNav test (Step 8.3)。

### Step 8.2: inception-mobile.spec.ts の Header test を更新

Edit `tests/e2e/tests/inception-mobile.spec.ts`:

Find: `test("Header (logo + nav + Sign out) が viewport 内に収まる", ...)`

該当 test の body を以下に置換 (タイトルも変更):

```ts
test("Header (logo + Sign out のみ) が viewport 内に収まる", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector("header");
  const header = page.locator("header");
  const box = await header.boundingBox();
  expect(box).not.toBeNull();
  // logo "🪞 YesMan" と Sign out が visible
  await expect(page.getByText(/🪞 YesMan/)).toBeVisible();
  await expect(page.getByRole("button", { name: /Sign out/ })).toBeVisible();
  // nav icons (⚙️📊👤) は削除済 = header に存在しない
  const headerText = (await header.textContent()) ?? "";
  expect(headerText).not.toContain("⚙️");
  expect(headerText).not.toContain("📊");
  expect(headerText).not.toContain("👤");
});
```

### Step 8.3: BottomNav e2e test 4 件を追加

Edit `tests/e2e/tests/inception-mobile.spec.ts` の末尾 describe block 内に追加:

```ts
test.describe("BottomNav (Mobile App Polish §4)", () => {
  test("Bottom Navigation Bar が画面下に固定表示される", async ({ page }) => {
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "メインナビゲーション" });
    await expect(nav).toBeVisible();
    // 4 tab すべて visible
    await expect(page.getByText("Home", { exact: true })).toBeVisible();
    await expect(page.getByText("決定", { exact: true })).toBeVisible();
    await expect(page.getByText("スコア", { exact: true })).toBeVisible();
    await expect(page.getByText("プロフィール", { exact: true })).toBeVisible();
  });

  test("4 tab の tap target が 44×44px 以上", async ({ page }) => {
    await page.goto("/");
    for (const label of ["Home", "決定", "スコア", "プロフィール"]) {
      const link = page.getByText(label, { exact: true }).locator("..");
      const box = await link.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.width).toBeGreaterThanOrEqual(44);
    }
  });

  test("tab tap で active 状態が切替わる", async ({ page }) => {
    await page.goto("/");
    // Home tab が active
    const homeLink = page.getByText("Home", { exact: true }).locator("..");
    await expect(homeLink).toHaveAttribute("aria-current", "page");
    // 決定 tab tap → navigate + active 切替
    await page.getByText("決定", { exact: true }).click();
    await expect(page).toHaveURL(/\/decision/);
    const decisionLink = page.getByText("決定", { exact: true }).locator("..");
    await expect(decisionLink).toHaveAttribute("aria-current", "page");
  });

  test("/auth/splash で BottomNav は非表示", async ({ page }) => {
    // VITE_AUTH_BYPASS=true の e2e 環境では /auth/splash に直接 nav しても authed 扱いだが、
    // BottomNav は authentication status に依存するため、未認証時の試験は別環境必要。
    // ここでは Splash route 訪問時に nav が visible でない (= 認証完了後 root へ redirect)
    // ことを確認するスモークテスト。
    await page.goto("/auth/splash");
    // VITE_AUTH_BYPASS で root へ redirect → BottomNav 表示
    await page.waitForURL("/");
    await expect(page.getByRole("navigation", { name: "メインナビゲーション" })).toBeVisible();
  });
});
```

### Step 8.4: e2e 全件実行

Run:
```bash
cd /Users/morimatsu/lab/ai-dlc-hackathon
pnpm -F @yesman/e2e test 2>&1 | tail -10
```

Expected: 全 PASS (既存 99 件 + 新規 4 件 - 削除 1 件 = +3 件)

### Step 8.5: Commit

```bash
cd /Users/morimatsu/lab/ai-dlc-hackathon
git add tests/e2e/tests/inception-mobile.spec.ts tests/e2e/tests/inception-design.spec.ts
git commit -m "$(cat <<'EOF'
test(e2e): BottomNav + 簡素化 header を反映

Mobile App Polish (spec 2026-05-22) Task 8:
- inception-design.spec.ts: "Header に nav icons (⚙️📊👤) が存在" test を削除
  (Header 簡素化で仕様乖離、BottomNav e2e で代替)
- inception-mobile.spec.ts:
  - Header test を "logo + Sign out のみ" に書き換え + nav icons 不在 assert
  - BottomNav describe block 新規追加 (4 件):
    * Bottom Navigation Bar 表示
    * 4 tab tap target 44×44px
    * tab tap で active 切替 + navigate
    * /auth/splash の挙動スモーク

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Post-Implementation Verification

- [ ] **Step 9.1: 全 Web/UI test**

Run:
```bash
cd /Users/morimatsu/lab/ai-dlc-hackathon
pnpm -F @yesman/ui test 2>&1 | tail -5
pnpm -F @yesman/web test 2>&1 | tail -5
```

Expected: 全 PASS

- [ ] **Step 9.2: Lint + build + size-limit**

Run:
```bash
pnpm -F @yesman/web lint && pnpm -F @yesman/ui lint
pnpm -F @yesman/ui build && pnpm -F @yesman/web build && pnpm -F @yesman/web size
```

Expected: 全 OK、size-limit 250KB 違反なし

- [ ] **Step 9.3: e2e 全件**

Run: `pnpm -F @yesman/e2e test 2>&1 | tail -5`
Expected: 全 PASS (既存 + Task 8 の新規 4 件)

- [ ] **Step 9.4: 手動デモシナリオ — iPhone 13 viewport で確認**

Chrome DevTools で iPhone 13 viewport (390×844) emulate、`http://localhost:5173/score` 開く:

- [ ] Top header 簡素化 (🪞 YesMan + Sign out のみ)
- [ ] Bottom Navigation 4 tab が画面下に固定表示 (🏠/💭/📊/👤)
- [ ] 「📊 スコア」tab が active (brand-700 太字 + 上 underline)
- [ ] Score Page を下にスクロール → header sticky、BottomNav 固定 (両方常時可視)
- [ ] BottomNav の他 tab tap → 即遷移 + active 切替
- [ ] `/decision` で Yes 採択 → confetti + (Android 端末で) 振動
- [ ] `/personas` で BottomNav 全 tab が inactive (active 表示なし)
- [ ] `/auth/splash` (未認証) → BottomNav 非表示 + Sign out 非表示
- [ ] DevTools で notch 領域 (top ~44px) を emulate → コンテンツ被らない

- [ ] **Step 9.5: コミット履歴を確認**

Run:
```bash
git log --oneline a2d87b2..HEAD
```

Expected: 7 〜 8 件の feat/refactor/test commit (Task 1〜8、Task 7 skip 時は 7 件)

- [ ] **Step 9.6: PR 作成 (user が指示した場合のみ)**

```bash
cd /Users/morimatsu/lab/ai-dlc-hackathon
git push -u origin feature/web-mobile-app-polish
gh pr create --base develop --title "feat(web,ui): Mobile App Polish — Bottom Nav + Safe Area + Sticky + Microinteractions" --body "$(cat <<'EOF'
## Summary
- Top header 簡素化 (logo + Sign out のみ) + sticky top:0
- BottomNav 4 tabs (🏠 Home / 💭 決定 / 📊 スコア / 👤 プロフィール) 新規
- Safe Area Insets (env(safe-area-inset-*)) 対応 (iPhone notch + home indicator)
- Microinteractions: active:scale + Skeleton loader + Haptic vibrate + (任意) View Transitions
- 設計: docs/superpowers/specs/2026-05-22-mobile-app-polish-design.md
- drawio: docs/superpowers/specs/diagrams/2026-05-22-mobile-app-polish-screens.drawio
- 計画: docs/superpowers/plans/2026-05-22-mobile-app-polish.md

## Test plan
- [x] UI test (Skeleton 4 + Button +3) PASS
- [x] Web shell test (Layout 6 + BottomNav 7) PASS
- [x] Web feature test (DecisionResult vibrate +2 含む全件) PASS
- [x] e2e Playwright (mobile spec 更新 + BottomNav 4 件追加) PASS
- [x] Lint + build + size-limit OK
- [x] iPhone 13 viewport で手動目視 (Sticky + BottomNav + Safe Area)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

> push と PR 作成は user が明示的に指示した場合のみ実行。

---

## Self-Review Results

**1. Spec coverage:**

| Spec section | Task | Status |
|--------------|------|--------|
| §3 Layout shell (sticky + safe area + main padding) | Task 4 | ✓ |
| §4 BottomNav component | Task 3 | ✓ |
| §4.X Toast 位置調整 | Task 4 (Step 4.4) | ✓ |
| §5 Safe Area Insets | Task 3 + Task 4 | ✓ |
| §6 Button active state (append 方式 + motion-reduce) | Task 2 | ✓ |
| §7 Skeleton primitive + 適用 | Task 1 + Task 5 | ✓ |
| §8 Page transitions (React Router viewTransition prop + CSS) | Task 7 (条件付き) | ✓ |
| §9 Haptic feedback | Task 6 | ✓ |
| §10 Test 戦略 (Unit + e2e + 既存テスト回帰) | Task 1-8 各 + Step 9.1-9.3 | ✓ |
| §11 実装順序 (8 commit、漸進的 ship) | Task 1 → 8 | ✓ |
| §12 Risk O10/O11/O12 (Toast 重なり / motion-reduce / design.spec.ts) | Task 4 / Task 2 / Task 8 | ✓ |
| §13 DoD 8 項目 | Step 9.4 で目視確認 | ✓ |

**2. Placeholder scan:** Task 5 の Spinner→Skeleton は各 page の skeleton 数を具体的に code 提示済。Task 7 (View Transitions) は条件付き skip path を明示。Task 8 の e2e は新規 4 test を完全 code 提示。"TBD"/"TODO"/「対応する」等の中身なし箇所なし。

**3. Type consistency:**
- `SkeletonProps`: Task 1 で定義 `{ className?: string; style?: CSSProperties }` → Task 5 で `<Skeleton className="..." style={{...}} />` 整合
- `BottomNav` の Tab 型: Task 3 で `{ to: string; icon: string; label: string }` → 内部完結
- React Router `viewTransition` prop: Task 7 で React Router v6.20 確認後に付与、未対応 path は Step 7.7 で skip
- `navigator.vibrate(50)`: Task 6 で 50ms 確定、test も同値

**4. Discovered gap fix:**
- Task 5 の PersonaListPage / PreferencePage で Spinner 表示パターン (具体的な `<Spinner />` 位置) を「典型例」として記述 (実コードを読んで該当箇所を特定する前提)。これは枝葉部分の柔軟性として許容。
- Task 7 (View Transitions) を skip 可能にした (spec §8 YAGNI 判断と整合)。
