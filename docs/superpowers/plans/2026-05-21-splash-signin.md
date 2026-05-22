# Splash + SignInPage デザイン Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 未認証時に `/auth/splash` hero ページを経由してから `/auth/signin` に遷移する visual rebrand。Splash は staged fade-in animation (`~2.1s`)、SignInPage は visual polish (small logo + bold heading + warm beige Card + 既存ユーザ list 控えめ化)。ロジックは触らない。

**Architecture:** CSS @keyframes で純粋実装 (animation library なし)、`prefers-reduced-motion` 対応。`/auth/splash` route を新設、`RequireAuth` の redirect 先を `/auth/signin` → `/auth/splash` に変更。`SignInPage` は className 調整のみ。

**Tech Stack:** React 18 / TypeScript / Vite / Tailwind v4 / @yesman/ui (Button, Card, Input) / react-router-dom v6 / Vitest + jsdom + @testing-library

**Spec:** [docs/superpowers/specs/2026-05-21-splash-signin-design.md](../specs/2026-05-21-splash-signin-design.md)
**Diagrams:** [docs/superpowers/specs/diagrams/2026-05-21-splash-signin-screens.drawio](../specs/diagrams/2026-05-21-splash-signin-screens.drawio) (4 ページ)

**Branch:** `feature/splash-signin-design` (`feature/mock-auth-ui` 上に積む、spec commit `bec1d73` あり)

---

## File Structure

```
apps/web/src/
├── styles/
│   └── main.css                       [Modify] @keyframes + .splash-fade-in* class 追加
├── features/auth/
│   ├── SplashPage.tsx                 [Create] hero + staged animation + CTA + secondary link
│   └── SignInPage.tsx                 [Modify] visual polish (header + Card + list styling)
└── shell/
    ├── routes.tsx                     [Modify] /auth/splash route (lazy) 追加
    └── RequireAuth.tsx                [Modify] redirect 先を /auth/splash に

apps/web/tests/
├── features/auth/
│   └── SplashPage.test.tsx            [Create] CTA / secondary link / state.from preserve
└── shell/
    └── RequireAuth.test.tsx           [Modify] redirect 先テストを /auth/splash に
```

---

## Task 1: CSS keyframes 追加

**Files:**
- Modify: `apps/web/src/styles/main.css`

- [ ] **Step 1: main.css 末尾に keyframes + class を追記**

Edit `apps/web/src/styles/main.css` — 末尾 (App-level overrides の後) に以下を追記:

```css
/* Splash animations (spec 2026-05-21 §5) */
@keyframes yesman-fade-in-up {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes yesman-fade-in-scale {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.splash-fade-in {
  opacity: 0;
  animation: yesman-fade-in-up 600ms ease-out forwards;
}

.splash-fade-in-cta {
  opacity: 0;
  animation: yesman-fade-in-scale 500ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
  /* easeOutBack: 軽い overshoot (pop) */
}

@media (prefers-reduced-motion: reduce) {
  .splash-fade-in,
  .splash-fade-in-cta {
    animation: none;
    opacity: 1;
    transform: none;
  }
}
```

- [ ] **Step 2: ビルド確認**

```bash
cd apps/web && pnpm build 2>&1 | tail -5
```
Expected: PASS、CSS が dist/assets/*.css に含まれる

- [ ] **Step 3: Commit**

```bash
cd /Users/morimatsu/lab/ai-dlc-hackathon
git add apps/web/src/styles/main.css
git commit -m "$(cat <<'EOF'
feat(web): Splash 用 CSS @keyframes (fadeInUp / fadeInScale) を追加

main.css に 2 種類の keyframe と対応 class (.splash-fade-in / .splash-fade-in-cta)
を追加。CTA only easeOutBack で軽い overshoot (pop)、それ以外は ease-out。
prefers-reduced-motion: reduce で animation off + 即時表示。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: SplashPage component + tests (TDD)

**Files:**
- Create: `apps/web/src/features/auth/SplashPage.tsx`
- Create: `apps/web/tests/features/auth/SplashPage.test.tsx`

- [ ] **Step 1: 失敗するテストを書く**

Create `apps/web/tests/features/auth/SplashPage.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

const navigateMock = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>(
    "react-router-dom",
  );
  return { ...actual, useNavigate: () => navigateMock };
});

import SplashPage from "../../../src/features/auth/SplashPage";

function renderSplash(initialEntries: { pathname: string; state?: unknown }[] = [
  { pathname: "/auth/splash" },
]) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <SplashPage />
    </MemoryRouter>,
  );
}

describe("SplashPage", () => {
  beforeEach(() => navigateMock.mockReset());

  it("YESMAN wordmark / tagline / disclaimer / CTA / secondary link を表示する", () => {
    renderSplash();
    expect(screen.getByRole("heading", { name: "YESMAN" })).toBeInTheDocument();
    expect(screen.getByText("人間最後の仕事は、")).toBeInTheDocument();
    expect(screen.getByText(/YES で承認すること/)).toBeInTheDocument();
    expect(screen.getByText(/逆説的設計/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /はじめる/ })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /すでにアカウントがある方は サインイン/ }),
    ).toBeInTheDocument();
  });

  it("[はじめる →] click で /auth/signin に navigate される", async () => {
    const user = userEvent.setup();
    renderSplash();
    await user.click(screen.getByRole("button", { name: /はじめる/ }));
    expect(navigateMock).toHaveBeenCalledWith(
      "/auth/signin",
      expect.objectContaining({ state: { from: { pathname: "/" } } }),
    );
  });

  it("secondary link click でも /auth/signin に navigate される", async () => {
    const user = userEvent.setup();
    renderSplash();
    await user.click(
      screen.getByRole("button", { name: /すでにアカウントがある方は サインイン/ }),
    );
    expect(navigateMock).toHaveBeenCalledWith(
      "/auth/signin",
      expect.objectContaining({ state: { from: { pathname: "/" } } }),
    );
  });

  it("location.state.from がある場合、navigate state.from が引き継がれる", async () => {
    const user = userEvent.setup();
    renderSplash([
      { pathname: "/auth/splash", state: { from: { pathname: "/score" } } },
    ]);
    await user.click(screen.getByRole("button", { name: /はじめる/ }));
    expect(navigateMock).toHaveBeenCalledWith(
      "/auth/signin",
      expect.objectContaining({ state: { from: { pathname: "/score" } } }),
    );
  });

  it("🪞 emoji は aria-hidden で screen reader にスキップされる", () => {
    renderSplash();
    const emoji = screen.getByText("🪞");
    expect(emoji).toHaveAttribute("aria-hidden", "true");
  });
});
```

- [ ] **Step 2: テスト実行で失敗を確認**

```bash
cd apps/web && pnpm test -- SplashPage
```
Expected: FAIL — "Cannot find module ... SplashPage"

- [ ] **Step 3: SplashPage component を実装**

Create `apps/web/src/features/auth/SplashPage.tsx`:

```tsx
/**
 * SplashPage — 未認証時の hero / ブランド導入画面.
 *
 * spec: docs/superpowers/specs/2026-05-21-splash-signin-design.md
 * - 🪞 emoji + YESMAN wordmark + tagline + disclaimer + coral CTA + secondary link
 * - staged fade-in アニメーション (合計 ~2.1 秒、prefers-reduced-motion 対応は CSS 側)
 * - CTA / secondary link 両方で /auth/signin に navigate、location.state.from を引き継ぐ
 */
import { useLocation, useNavigate } from "react-router-dom";

export default function SplashPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const from =
    (location.state as { from?: { pathname: string } } | null)?.from?.pathname ?? "/";

  const goToSignIn = () => {
    navigate("/auth/signin", { state: { from: { pathname: from } } });
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-neutral-50 px-6 py-12">
      <div className="w-full max-w-md text-center">
        {/* 🪞 emoji (装飾、aria-hidden) */}
        <div
          className="text-6xl leading-none select-none splash-fade-in"
          style={{ animationDelay: "0ms" }}
          aria-hidden="true"
        >
          🪞
        </div>

        {/* YESMAN wordmark */}
        <h1
          className="mt-4 font-serif text-5xl font-bold text-neutral-800 tracking-[0.15em] splash-fade-in"
          style={{ animationDelay: "200ms" }}
        >
          YESMAN
        </h1>

        {/* 装飾線 */}
        <div
          className="mx-auto mt-8 h-px w-24 bg-[#E0D5BC] splash-fade-in"
          style={{ animationDelay: "500ms" }}
          aria-hidden="true"
        />

        {/* Tagline 2 行 */}
        <p
          className="mt-6 font-serif italic text-xl text-neutral-700 leading-relaxed splash-fade-in"
          style={{ animationDelay: "700ms" }}
        >
          人間最後の仕事は、
        </p>
        <p
          className="mt-1 font-serif italic text-xl text-neutral-700 leading-relaxed splash-fade-in"
          style={{ animationDelay: "800ms" }}
        >
          YES で承認すること。
        </p>

        {/* Disclaimer (「逆説的設計」 brand-700 強調) */}
        <p
          className="mt-10 text-sm leading-relaxed text-neutral-600 max-w-xs mx-auto splash-fade-in"
          style={{ animationDelay: "1100ms" }}
        >
          本作品は AI が人間の主体性を奪う体験を演出する作品です。
          <br />
          「委任度スコア」「沈黙演出」 などは意図的な
          <strong className="font-semibold text-brand-700"> 逆説的設計 </strong>
          です。
        </p>

        {/* CTA button */}
        <div
          className="mt-10 splash-fade-in-cta"
          style={{ animationDelay: "1400ms" }}
        >
          <button
            type="button"
            onClick={goToSignIn}
            className="
              inline-flex items-center justify-center gap-2
              rounded-2xl px-10 py-3.5
              bg-[#E8775A] text-white text-base font-semibold
              shadow-[0_4px_12px_rgba(232,119,90,0.35)]
              transition-all duration-150 ease-out
              hover:bg-[#D66547] hover:scale-[1.02] hover:shadow-[0_8px_20px_rgba(232,119,90,0.45)]
              active:scale-[0.98]
              focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#E8775A]/40
            "
          >
            はじめる
            <span className="text-lg" aria-hidden="true">→</span>
          </button>
        </div>

        {/* Secondary link */}
        <div
          className="mt-6 splash-fade-in"
          style={{ animationDelay: "1700ms" }}
        >
          <button
            type="button"
            onClick={goToSignIn}
            className="
              text-xs text-neutral-500 underline underline-offset-4
              hover:text-neutral-700 hover:no-underline
              transition-colors
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400
            "
          >
            すでにアカウントがある方は <span className="font-semibold">サインイン</span>
          </button>
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 4: テスト pass を確認**

```bash
cd apps/web && pnpm test -- SplashPage
```
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
cd /Users/morimatsu/lab/ai-dlc-hackathon
git add apps/web/src/features/auth/SplashPage.tsx \
        apps/web/tests/features/auth/SplashPage.test.tsx
git commit -m "$(cat <<'EOF'
feat(web): SplashPage — 未認証時の hero ページを新規追加

🪞 emoji + YESMAN wordmark + tagline + disclaimer + coral CTA + secondary link.
staged fade-in アニメーション (合計 ~2.1s、prefers-reduced-motion 対応)。
CTA / secondary link 両方で /auth/signin に navigate、location.state.from
を引き継ぐ。

5 ケースの Vitest unit pass (要素表示 / CTA click / secondary click /
state.from preserve / 🪞 aria-hidden)。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: /auth/splash route を追加

**Files:**
- Modify: `apps/web/src/shell/routes.tsx`

- [ ] **Step 1: routes.tsx に lazy import + route を追加**

Edit `apps/web/src/shell/routes.tsx` — 上部 lazy imports に追加 (`SignInPage` 行の下):

```tsx
const SplashPage = lazy(() => import("../features/auth/SplashPage"));
```

そして children 配列の `{ path: "auth/signin", ... }` の **前**に挿入:

```tsx
      { path: "auth/splash", element: <SplashPage /> },
```

完成形の該当ブロック:

```tsx
      { path: "auth/splash", element: <SplashPage /> },
      { path: "auth/signin", element: <SignInPage /> },
      { path: "auth/callback", element: <CallbackPage /> },
```

- [ ] **Step 2: TypeScript + 既存 routes.test pass を確認**

```bash
cd apps/web && pnpm tsc --noEmit 2>&1 | grep -v "tests/property" | head -10
echo "---"
pnpm test -- routes 2>&1 | tail -5
```
Expected: TS error なし、`tests/shell/routes.test.tsx` 全 pass

- [ ] **Step 3: Commit**

```bash
cd /Users/morimatsu/lab/ai-dlc-hackathon
git add apps/web/src/shell/routes.tsx
git commit -m "$(cat <<'EOF'
feat(web): /auth/splash route を routes.tsx に追加 (lazy)

SplashPage を lazy import し、auth/signin の前に挿入。既存 SignIn /
Callback route は不変。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: RequireAuth の redirect 先を /auth/splash に変更

**Files:**
- Modify: `apps/web/src/shell/RequireAuth.tsx`
- Modify: `apps/web/tests/shell/RequireAuth.test.tsx`

- [ ] **Step 1: 既存テストを失敗させる方向に更新**

Edit `apps/web/tests/shell/RequireAuth.test.tsx` — `Route` 定義に `/auth/splash` を追加、redirect 先テストを更新:

`setup()` 関数の `<Routes>` を以下に置換:

```tsx
        <Routes>
          <Route
            path="/private"
            element={
              <RequireAuth>
                <div>Private content</div>
              </RequireAuth>
            }
          />
          <Route path="/auth/signin" element={<div>Sign in page</div>} />
          <Route path="/auth/splash" element={<div>Splash page</div>} />
        </Routes>
```

そして 2 番目の test を以下に置換:

```tsx
  it("redirects to /auth/splash when unauthenticated", async () => {
    vi.mocked(fetchAuthSession).mockResolvedValueOnce({ tokens: undefined } as never);
    setup();
    await waitFor(() => {
      expect(screen.getByText("Splash page")).toBeInTheDocument();
    });
  });
```

- [ ] **Step 2: テスト実行で失敗を確認**

```bash
cd apps/web && pnpm test -- "RequireAuth\.test"
```
Expected: FAIL — "Sign in page" が表示されるが test は "Splash page" を期待

- [ ] **Step 3: RequireAuth.tsx の redirect 先を変更**

Edit `apps/web/src/shell/RequireAuth.tsx` — `Navigate` の `to` を変更:

```tsx
  if (status === "unauthenticated") {
    // spec 2026-05-21: redirect 先を /auth/splash に変更 (Splash → SignIn の 2 段構え)
    return <Navigate to="/auth/splash" state={{ from: location }} replace />;
  }
```

- [ ] **Step 4: テスト pass を確認**

```bash
cd apps/web && pnpm test -- "RequireAuth\.test"
```
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
cd /Users/morimatsu/lab/ai-dlc-hackathon
git add apps/web/src/shell/RequireAuth.tsx \
        apps/web/tests/shell/RequireAuth.test.tsx
git commit -m "$(cat <<'EOF'
feat(web): RequireAuth の redirect 先を /auth/signin → /auth/splash に変更

未認証時に Splash 経由で SignIn にたどり着くフローを確立。Splash CTA /
secondary link は location.state.from を SignIn に引き継ぐため、元 page
復帰は不変。

RequireAuth.test.tsx も /auth/splash を見るように更新 (2 cases pass)。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: SignInPage の visual polish

**Files:**
- Modify: `apps/web/src/features/auth/SignInPage.tsx`

- [ ] **Step 1: 現在の SignInPage.tsx を読む**

```bash
cat apps/web/src/features/auth/SignInPage.tsx
```

return 文の structure を把握 (form Card + 既存ユーザ list の section)。次の Step で書き換える箇所のみ更新する。

- [ ] **Step 2: SignInPage.tsx の return 内をリデザイン**

以下の差分を適用:

### 2.1 上部 heading 部分を置換

既存の `<h1>YesMan にサインイン</h1>` と説明 `<p>` を含むブロック全体を以下に置換:

```tsx
      <div className="text-center mb-8">
        <p className="font-serif text-2xl text-neutral-700/70" aria-hidden="true">
          🪞 YesMan
        </p>
        <h1 className="mt-2 font-serif text-3xl font-bold text-neutral-800">
          サインイン
        </h1>
        {env.authBypass && (
          <p className="mt-2 text-sm text-neutral-600">
            メールアドレスでサインインしてください。
            <br />
            未登録のメールは自動で登録されます。
          </p>
        )}
      </div>
```

### 2.2 form Card に warm beige border + soft shadow

既存の `<Card>` (form を包む) を以下に置換 (form 中身は維持):

```tsx
      <Card className="border-[#E0D5BC] shadow-[0_4px_16px_rgba(212,165,93,0.08)]">
        {/* 中の form / Input / Button はそのまま */}
      </Card>
```

### 2.3 既存ユーザ list セクションを controlled style に置換

既存ユーザ list の section (`<div className="text-center text-xs text-neutral-500">─────  または  ─────</div>` 以下) を以下で置換:

```tsx
      {env.authBypass && (
        <div className="mt-8">
          <div className="flex items-center gap-3 mb-3">
            <hr className="flex-1 border-[#E0D5BC]" />
            <p className="text-xs text-neutral-500">前回サインインしたユーザ</p>
            <hr className="flex-1 border-[#E0D5BC]" />
          </div>
          {users.length === 0 ? (
            <div className="rounded-xl border border-dashed border-neutral-300 p-6 text-center">
              <p className="italic text-neutral-500 text-sm">まだ登録ユーザはいません</p>
              <p className="text-xs text-neutral-400 mt-1">
                上のフォームから新規登録できます
              </p>
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {users.map((u) => (
                <li key={u.email}>
                  <button
                    type="button"
                    className="
                      w-full text-left rounded-xl border border-neutral-200
                      px-4 py-3 flex justify-between items-center
                      hover:border-[#E8775A] hover:bg-neutral-0
                      transition-colors disabled:opacity-50
                      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8775A]/40
                    "
                    onClick={() => handleRowClick(u)}
                    disabled={submitting}
                  >
                    <span>
                      <span className="block text-sm font-medium text-neutral-700">
                        {u.email}
                      </span>
                      <span className="block text-xs text-neutral-500 mt-0.5">
                        {u.display_name ?? (
                          <span className="italic text-neutral-400">(表示名なし)</span>
                        )}
                      </span>
                    </span>
                    <span className="text-neutral-300" aria-hidden="true">→</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
```

### 2.4 root div に fade-in animation

return の最上位 `<div>` の className を:

```tsx
    <div className="flex flex-col gap-4 py-4 splash-fade-in" style={{ animationDelay: "0ms" }}>
```

(既存 className `flex flex-col gap-4 py-4` に `splash-fade-in` を追加 + style で delay 0ms)

- [ ] **Step 3: 既存 SignInPage.test.tsx が引き続き pass することを確認**

```bash
cd apps/web && pnpm test -- SignInPage
```
Expected: PASS (7 tests) — role/text assertion は変わらないため visual 変更で破れない

- [ ] **Step 4: TypeScript + lint チェック**

```bash
cd apps/web && pnpm tsc --noEmit 2>&1 | grep -v "tests/property" | head -10
echo "---"
pnpm lint 2>&1 | tail -5
```
Expected: TS error なし、lint error なし

- [ ] **Step 5: Commit**

```bash
cd /Users/morimatsu/lab/ai-dlc-hackathon
git add apps/web/src/features/auth/SignInPage.tsx
git commit -m "$(cat <<'EOF'
feat(web): SignInPage を visual polish (Splash 仕様と整合)

- ヘッダー: 🪞 YesMan (小ロゴ) + サインイン (text-3xl bold) + 説明文
- form Card に warm beige border + soft warm-tone shadow
- 既存ユーザ list を controlled style に: dividers で控えめに区切る、
  矢印 → を neutral-300 に降格、hover で coral 縁取り
- root に splash-fade-in (600ms) で全体マウント時 fade-in

ロジック (signIn / refresh / navigate / display_name hack) は触らない。
既存 7 ケース pass (role/text assertion ベース)。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: 最終検証 + PR

**Files:** なし (verification)

- [ ] **Step 1: 全 web test + build + lint**

```bash
cd /Users/morimatsu/lab/ai-dlc-hackathon
pnpm --filter @yesman/web test 2>&1 | tail -20
echo "---"
pnpm --filter @yesman/web build 2>&1 | tail -8
echo "---"
pnpm --filter @yesman/web lint 2>&1 | tail -5
```

Expected:
- SplashPage tests 5 件 + RequireAuth tests 2 件 + SignInPage tests 7 件 + mockAuthStorage 15 + AuthProvider 11 件 全 pass
- 既存 pre-existing 失敗 (msw / fast-check 未関連) は変動なし
- `pnpm build` 成功
- lint warning 0

- [ ] **Step 2: dev server で手動検証**

ブラウザで以下を確認:

1. http://localhost:5173 を開く (未認証状態、localStorage clear 済み)
   → `/auth/splash` に redirect される
   → staged fade-in が ~2.1s で実行される
   → 🪞 + YESMAN + tagline + disclaimer + [はじめる →] + secondary link が表示

2. [はじめる →] をクリック
   → `/auth/signin` に遷移
   → 上部に 🪞 YesMan ロゴ + サインイン heading + 説明文
   → form Card は warm beige border + soft shadow
   → [サインイン] button は coral + shadow

3. Email + 表示名を入力 → [サインイン] → ホーム

4. [Sign out] (Header) クリック
   → `/auth/splash` に redirect される (Splash 経路一貫)

5. /auth/splash の secondary link「すでにアカウントがある方は サインイン」をクリック
   → `/auth/signin` に遷移 (CTA と同じ動作)
   → 既存ユーザ list が dividers で控えめに表示

6. `prefers-reduced-motion: reduce` を OS / browser DevTools で有効化
   → Splash の animation が完全に off (即時表示) になる

7. /score (保護 route) に直接アクセス (未認証で)
   → `/auth/splash` に redirect、state.from = /score 保持
   → [はじめる →] → `/auth/signin` (state.from 引継ぎ)
   → サインイン → `/score` 復帰

- [ ] **Step 3: PR 作成 (user の明示的指示がある場合のみ)**

```bash
cd /Users/morimatsu/lab/ai-dlc-hackathon
git push -u origin feature/splash-signin-design

gh pr create --base feature/mock-auth-ui --head feature/splash-signin-design \
  --title "feat(web): Splash + SignInPage デザイン刷新" \
  --body "$(cat <<'EOF'
## Summary

未認証ユーザがまず目にする画面の visual rebrand。

- **新規** `/auth/splash` (hero ページ): 🪞 emoji + YESMAN wordmark + tagline + disclaimer + coral [はじめる →] CTA + secondary link
- **アニメーション**: staged fade-in 合計 ~2.1s、CSS @keyframes 純粋実装、prefers-reduced-motion 対応
- **SignInPage visual polish**: 小ロゴ + 太字見出し + warm beige Card + 既存ユーザ list 控えめ化
- **RequireAuth redirect 先**: /auth/signin → /auth/splash
- ロジック (signIn / refresh / navigate) は **完全に据え置き**

## Spec / Plan / Diagrams

- Spec: [docs/superpowers/specs/2026-05-21-splash-signin-design.md](https://github.com/NES-Innovation-lavolatories/yes-man/blob/feature/splash-signin-design/docs/superpowers/specs/2026-05-21-splash-signin-design.md)
- Plan: [docs/superpowers/plans/2026-05-21-splash-signin.md](https://github.com/NES-Innovation-lavolatories/yes-man/blob/feature/splash-signin-design/docs/superpowers/plans/2026-05-21-splash-signin.md)
- Drawio: [diagrams/2026-05-21-splash-signin-screens.drawio](https://github.com/NES-Innovation-lavolatories/yes-man/blob/feature/splash-signin-design/docs/superpowers/specs/diagrams/2026-05-21-splash-signin-screens.drawio) (4 ページ)

## Base

`feature/mock-auth-ui` (PR #9) 上に積む。PR #9 merge 後に rebase / merge する想定。

## Test plan

- [ ] `pnpm --filter @yesman/web test -- "SplashPage|RequireAuth"` 全 pass (新規 5 + 修正 2 ケース)
- [ ] 既存 SignInPage tests 7 件 pass (visual のみ変更、role/text 維持)
- [ ] `pnpm --filter @yesman/web build` 成功
- [ ] `pnpm --filter @yesman/web lint` warning 0
- [ ] ブラウザ手動:
  - 未認証で / → /auth/splash → staged animation
  - [はじめる] → /auth/signin → ロゴ + Card 確認
  - Sign out → /auth/splash に戻る
  - secondary link → /auth/signin
  - prefers-reduced-motion で animation off

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

> ⚠️ Push と PR 作成は **user の明示的指示があった場合のみ** 実行。

---

## Self-Review Checklist

**1. Spec coverage**

| Spec section | Task | カバレッジ |
|---|---|---|
| §2 受入基準 (Gherkin 全 6 シナリオ) | Task 2 (Splash) + Task 4 (RequireAuth) + Task 5 (SignIn) | ✅ |
| §3.1 ルーティング変更 | Task 3 + Task 4 | ✅ |
| §3.2 Module 構成 | File Structure | ✅ |
| §3.3 デザイン token (coral / warm beige) | Task 1 (CSS) + Task 2/5 (className) | ✅ |
| §4 SplashPage 詳細 (8 要素 className) | Task 2 Step 3 | ✅ |
| §5 アニメーション (keyframes + 7 delay timeline) | Task 1 (CSS) + Task 2 (style.animationDelay) | ✅ |
| §6 SignInPage リデザイン (ヘッダー / Card / list) | Task 5 Step 2.1〜2.4 | ✅ |
| §7 アクセシビリティ (aria-hidden, focus ring, reduced-motion) | Task 1 (reduced-motion) + Task 2 (aria-hidden + focus-visible) | ✅ |
| §10 テスト方針 | Task 2 + Task 4 (修正 test) | ✅ |

**2. Placeholder scan**: TBD / TODO なし。全 step に具体的なコード or コマンドを記載。

**3. Type consistency**

- `SplashPage` default export: Task 2 で `export default function SplashPage()`、Task 3 で `lazy(() => import("../features/auth/SplashPage"))` で参照、一致
- `goToSignIn` 関数 + `from` 変数: Task 2 Step 3 内に閉じる
- CSS class `splash-fade-in` / `splash-fade-in-cta`: Task 1 で定義、Task 2/5 で参照、名前一致
- `location.state.from.pathname`: spec §3.7 と同じ shape、Task 2 で読み Task 4 (Navigate) で書く

**4. Known concerns**

- Task 5 で SignInPage の form 中身 (Email/表示名 Input + サインイン Button) はそのまま再利用するため、Task 5 Step 2 の差分が `<Card>` の className 上書きのみで完結する。Card の children を書き換える必要はない。
- Task 5 Step 1 で `cat` するのは file の構造を確認するためで、人間の implementer 向け。subagent には不要だが残しておくと再現性が高い。
- mock-auth-ui PR (#9) と base が共通だが、最終 merge 先は develop (PR #9 merge 後)。

---
