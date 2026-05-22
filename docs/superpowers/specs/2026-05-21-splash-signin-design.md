# Splash + SignInPage 画面デザイン仕様

- **Date**: 2026-05-21
- **Author**: y-morimatsu (with Claude Opus 4.7)
- **Status**: Approved (brainstorming)
- **Scope**: `apps/web/src/features/auth/` + `apps/web/src/shell/` 配下のみ。API は変更しない。
- **Branch**: `feature/splash-signin-design` (新規)
- **画面モックアップ**:
  - drawio (4 ページ): [diagrams/2026-05-21-splash-signin-screens.drawio](diagrams/2026-05-21-splash-signin-screens.drawio)
    1. `01_Splash` — SplashPage の phone mockup + 各要素の callout 注釈
    2. `02_SignInPage_Redesign` — SignInPage リデザインの phone mockup + visual polish 注釈
    3. `03_Animation_Timeline` — staged fade-in の Gantt 風タイムライン + CSS keyframes
    4. `04_Flow` — 未認証 → Splash → SignIn → 元 page 復帰 のルーティングフロー
  - SVG mockup (実寸):
    - [diagrams/screens/01-splash.svg](diagrams/screens/01-splash.svg)
    - [diagrams/screens/02-signin.svg](diagrams/screens/02-signin.svg)

---

## 1. 背景

現在の `SignInPage` (`/auth/signin`) は機能的だが視覚的にミニマル:

- 見出し 1 行 + Email 入力 + 表示名 入力 + サインインボタン + 既存ユーザ list
- ブランドロゴ / タグライン / 装飾なし
- 未認証ユーザがまず目にする画面なので「YesMan の世界観」を提示できていない

INCEPTION 02_Onboarding 設計では Splash (logo + tagline + disclaimer) → Login のフロー想定だったが、未実装。本 spec で:

1. **`/auth/splash` route を新設** (ブランド hero ページ)
2. **`SignInPage` を visual polish** (small logo + better hierarchy + softer styling)
3. **`RequireAuth` の redirect 先を Splash に変更**

---

## 2. ユーザストーリー

> 未認証ユーザが `/` (or 任意の保護 route) にアクセスすると Splash が表示される。
> 🪞 YESMAN ロゴ、"人間最後の仕事は、YESで承認すること。" タグライン、逆説的設計の 1〜2 行 disclaimer、coral 色の [はじめる →] CTA を 2 秒のシーケンシャル fade-in で見せる。
> CTA クリックで /auth/signin にお引っ越し、当初訪問先の `state.from` を引き継ぐ。
> /auth/signin は小さなロゴと太字「サインイン」見出しを持つリデザイン済みの form 画面で、既存ユーザ list は控えめに下部に配置される。

### 受入基準 (Gherkin)

```
Given 未認証で /score にアクセスする
When RequireAuth が status=unauthenticated を検知する
Then /auth/splash に redirect される
  And location.state.from は { pathname: "/score" } として保持される

Given /auth/splash を初回表示する
Then 🪞 emoji、YESMAN wordmark、装飾線、tagline 2 行、disclaimer、CTA、secondary link が
     順に fade-in (合計 ~2.1 秒) して現れる
  And prefers-reduced-motion: reduce 時は animation なしで全要素即時表示

Given /auth/splash で [はじめる →] をクリックする
Then /auth/signin に navigate される
  And location.state.from は元の値 ({pathname:"/score"}) を保持する

Given /auth/splash で「すでにアカウントがある方は サインイン」link をクリックする
Then /auth/signin に navigate される (CTA と同じ挙動)

Given /auth/signin を表示する
Then 上部に 🪞 YesMan ロゴ (text-2xl)、サインイン (text-3xl bold)、説明文が表示される
  And form Card は warm beige border + soft shadow
  And [サインイン] button は coral bg + shadow
  And 下部の既存ユーザ list は dividers で控えめに区切られる

Given Sign out 後
Then /auth/splash に redirect される (Sign in 時と同じ Splash 経路)
```

---

## 3. アーキテクチャ

### 3.1 ルーティング変更

```
Before:
  unauth → RequireAuth → Navigate("/auth/signin", state={from})

After:
  unauth → RequireAuth → Navigate("/auth/splash", state={from})
  splash CTA click  → navigate("/auth/signin", state={from})
  splash skip link  → navigate("/auth/signin", state={from})
```

`/auth/signin` の SignInPage 側は変更不要 (既に `location.state.from` を読んで navigate する実装)。

### 3.2 Module 構成

```
apps/web/src/
├── shell/
│   ├── RequireAuth.tsx       [Modify] redirect 先を /auth/splash に
│   └── routes.tsx            [Modify] /auth/splash route (lazy)
├── features/auth/
│   ├── SplashPage.tsx        [Create] hero + staged animation + CTA
│   └── SignInPage.tsx        [Modify] visual polish (header + Card + list)
└── index.css                 [Modify] @keyframes 追加 + prefers-reduced-motion
```

### 3.3 デザイン Token (Tailwind arbitrary values)

新規追加 token (arbitrary classes として使用、theme 拡張はしない):

| 用途 | 値 | 使用箇所 |
|---|---|---|
| coral primary | `#E8775A` | CTA bg |
| coral hover | `#D66547` | CTA hover bg |
| coral shadow rgba | `rgba(232,119,90,0.35)` | CTA shadow |
| warm beige border | `#E0D5BC` | divider / Card border |
| warm beige gradient | `#F5E5C4/40` | SignInPage 上部 overlay |

既存 token (`bg-neutral-50` = warm cream `#FFF7E8`、`text-brand-700` = `#c2410c`) はそのまま再利用。

---

## 4. SplashPage 詳細

### 4.1 構造

```tsx
<main className="min-h-screen flex flex-col items-center justify-center bg-neutral-50 px-6 py-12">
  <div className="w-full max-w-md text-center">
    <Logo />              {/* 🪞 emoji */}
    <Wordmark />          {/* YESMAN */}
    <Divider />           {/* warm beige h-px */}
    <Tagline />           {/* 2 段 */}
    <Disclaimer />        {/* 1 段 */}
    <CTA />               {/* はじめる → */}
    <SecondaryLink />     {/* すでにアカウントがある方はサインイン */}
  </div>
</main>
```

### 4.2 各要素の className 仕様

| 要素 | className |
|---|---|
| 🪞 emoji | `text-6xl leading-none select-none splash-fade-in` + style delay 0ms |
| YESMAN wordmark | `mt-4 font-serif text-5xl font-bold text-neutral-800 tracking-[0.15em] splash-fade-in` + 200ms |
| 装飾線 | `mx-auto mt-8 h-px w-24 bg-[#E0D5BC] splash-fade-in` + 500ms |
| Tagline 1 | `mt-6 font-serif italic text-xl text-neutral-700 leading-relaxed splash-fade-in` + 700ms |
| Tagline 2 | `mt-1 font-serif italic text-xl text-neutral-700 leading-relaxed splash-fade-in` + 800ms |
| Disclaimer | `mt-10 text-sm leading-relaxed text-neutral-600 max-w-xs mx-auto splash-fade-in` + 1100ms |
| CTA button | `mt-10 inline-flex items-center justify-center gap-2 rounded-2xl px-10 py-3.5 bg-[#E8775A] text-white text-base font-semibold shadow-[0_4px_12px_rgba(232,119,90,0.35)] transition-all duration-150 ease-out hover:bg-[#D66547] hover:scale-[1.02] hover:shadow-[0_8px_20px_rgba(232,119,90,0.45)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#E8775A]/40 splash-fade-in-cta` + 1400ms |
| Secondary link | `mt-6 text-xs text-neutral-500 underline underline-offset-4 hover:text-neutral-700 hover:no-underline transition-colors splash-fade-in` + 1700ms |

### 4.3 動作

```tsx
const location = useLocation();
const navigate = useNavigate();
const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname ?? "/";

const goToSignIn = () => navigate("/auth/signin", { state: { from: { pathname: from } }, replace: false });

// CTA + secondary link 両方が同じ handler を呼ぶ
```

`replace: false` で Back ボタンで Splash に戻れるようにする (UX 配慮)。

### 4.4 文言

```
🪞 (emoji)

YESMAN

────────

人間最後の仕事は、
YES で承認すること。

本作品は AI が人間の主体性を奪う体験を演出する作品です。
「委任度スコア」「沈黙演出」 などは意図的な 逆説的設計 です。
                                        ━━━━━━━━━━ (brand-700)

[ はじめる → ]

すでにアカウントがある方は サインイン
```

---

## 5. アニメーション仕様

### 5.1 CSS keyframes (apps/web/src/index.css に追加)

```css
@keyframes yesman-fade-in-up {
  from { opacity: 0; transform: translateY(12px); }
  to   { opacity: 1; transform: translateY(0); }
}

@keyframes yesman-fade-in-scale {
  from { opacity: 0; transform: scale(0.95); }
  to   { opacity: 1; transform: scale(1); }
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

### 5.2 タイムライン

```
0ms     200ms   500ms  700ms  800ms 1100ms  1400ms    1700ms  2100ms (end)
│       │       │      │      │     │       │         │       │
🪞      YESMAN  ───    人間   YES   本作品  [CTA]     link
emoji   word    div    最後   で承認 は…    pop!     appears
                       の…
```

合計 ~2.1 秒、CTA は 1.4 秒で表示完了。ユーザはいつでも操作可能 (button が render されたら即 click 可)。

### 5.3 Easing 使い分け

- 通常要素: `ease-out` (cubic-bezier(0, 0, 0.2, 1)) — やわらかく着地
- CTA only: `easeOutBack` (cubic-bezier(0.34, 1.56, 0.64, 1)) — overshoot で注意喚起

---

## 6. SignInPage リデザイン詳細

### 6.1 ヘッダー (新規)

```tsx
<div className="text-center mb-8">
  <p className="font-serif text-2xl text-neutral-700/70">🪞 YesMan</p>
  <h1 className="mt-2 font-serif text-3xl font-bold text-neutral-800">サインイン</h1>
  <p className="mt-2 text-sm text-neutral-600">
    メールアドレスでサインインしてください。
    <br />
    未登録のメールは自動で登録されます。
  </p>
</div>
```

### 6.2 form Card のスタイル

- Card に `className="border-[#E0D5BC] shadow-[0_4px_16px_rgba(212,165,93,0.08)]"` を追加
- Input: `h-12 rounded-xl border-[#E0D5BC] focus:ring-2 focus:ring-[#E8775A]/40 focus:border-[#E8775A]`
- [サインイン] button: `h-12 rounded-xl bg-[#E8775A] hover:bg-[#D66547] shadow-[0_4px_12px_rgba(232,119,90,0.25)] hover:shadow-[0_6px_16px_rgba(232,119,90,0.35)] transition-all duration-150`

### 6.3 既存ユーザ list (控えめ化)

```tsx
<div className="mt-8">
  <div className="flex items-center gap-3 mb-3">
    <hr className="flex-1 border-[#E0D5BC]" />
    <p className="text-xs text-neutral-500">前回サインインしたユーザ</p>
    <hr className="flex-1 border-[#E0D5BC]" />
  </div>
  <ul className="space-y-2">
    {users.map(u => (
      <li key={u.email}>
        <button className="w-full text-left rounded-xl border border-neutral-200 px-4 py-3 flex justify-between items-center hover:border-[#E8775A] hover:bg-neutral-0 transition-colors">
          <span>
            <span className="block text-sm font-medium text-neutral-700">{u.email}</span>
            <span className="block text-xs text-neutral-500 mt-0.5">
              {u.display_name ?? "(表示名なし)"}
            </span>
          </span>
          <span className="text-neutral-300">→</span>
        </button>
      </li>
    ))}
  </ul>
</div>
```

### 6.4 page 全体のアニメーション

- 単一 600ms fade-in (staged なし)
- root div に `splash-fade-in` クラスを delay 0ms で適用

### 6.5 既存挙動の維持

- 不正 email → [サインイン] disabled (既存)
- 未登録 email → auto-register + sign in (既存)
- 既存 row click → setCurrentEmail + navigate (既存)
- location.state.from → navigate(from) (既存)

UI のみの polish、ロジックは touch しない。

---

## 7. アクセシビリティ

| 項目 | 対応 |
|---|---|
| コントラスト比 | `text-neutral-800` on `#FFF7E8` = 15.5:1 (AAA) / coral `#E8775A` on white = 4.8:1 (AA) |
| キーボード操作 | CTA + Secondary link 両方が `<button type="button">` で focus-visible ring 表示 |
| Screen reader | 🪞 emoji と装飾線に `aria-hidden="true"`、矢印 → も `aria-hidden` |
| `prefers-reduced-motion: reduce` | 全 animation 無効化、即時表示 |
| Tap target | CTA `py-3.5` = 約 44px (iOS HIG 最低満たす) |
| heading 階層 | Splash は `<h1>YESMAN</h1>` のみ、SignInPage は `<h1>サインイン</h1>` のみ |

---

## 8. 制約 / Out of Scope

- ロゴ画像は導入しない (🪞 emoji + serif wordmark で代替)
- アニメーションライブラリ (framer-motion 等) は使わない、純 CSS keyframes
- Splash の「スワイプして次へ」 gesture サポートはしない (CTA / link click のみ)
- Multi-language (現状日本語固定)
- Splash の「初回のみ表示」フラグはしない (sign-out 後も毎回表示、軽いので OK)

---

## 9. 変更ファイル一覧

| 種別 | パス | 内容 |
|---|---|---|
| 新規 | `apps/web/src/features/auth/SplashPage.tsx` | hero + staged animation + CTA |
| 編集 | `apps/web/src/index.css` | `@keyframes` + `.splash-fade-in*` + `prefers-reduced-motion` |
| 編集 | `apps/web/src/shell/routes.tsx` | `/auth/splash` route (lazy) |
| 編集 | `apps/web/src/shell/RequireAuth.tsx` | redirect 先 `/auth/signin` → `/auth/splash` |
| 編集 | `apps/web/src/features/auth/SignInPage.tsx` | ヘッダー / Card / list の visual polish |
| 新規 | `apps/web/tests/features/auth/SplashPage.test.tsx` | CTA click / secondary link / state.from preserve |
| 編集 | `apps/web/tests/shell/RequireAuth.test.tsx` | 新 redirect 先の test |

---

## 10. テスト方針

### 10.1 SplashPage (必須)

1. 表示要素の存在 (heading "YESMAN"、tagline 文言、CTA "はじめる"、secondary link "サインイン")
2. CTA click → `navigate("/auth/signin", { state: { from } })` が呼ばれる
3. Secondary link click → 同様
4. `location.state.from` がある場合、navigate state に保持される
5. `aria-hidden` 要素が screen reader に exposed されない (`queryByText("🪞")` で見つからないことを確認)

### 10.2 RequireAuth (修正)

- unauth 時 → `/auth/splash` に redirect される (既存 test の `/auth/signin` を変更)

### 10.3 SignInPage (既存維持)

- 既存 7 cases は role/text assertion ベースなので visual 変更で破れない
- `<h1>サインイン</h1>` の text は変わらない
- form / button の role は同じ

---

## 11. Risk / Mitigation

| Risk | 影響 | 緩和策 |
|---|---|---|
| 既存 e2e tests が /auth/signin redirect 前提 | 失敗 | RequireAuth test を更新、e2e 影響は別途 follow-up |
| Animation で `prefers-reduced-motion` を見落とす | 一部ユーザに不快 | spec §5.1 で CSS 内に明示、test で `<style>` の存在確認 |
| Tailwind arbitrary values でビルドサイズ増 | 軽微 | shadow / coral 等は同 ファイル内なので tree-shake 効く |
| CTA + secondary link 重複 (どちらも /auth/signin) | UX 混乱なし (実装はシンプル) | 両方とも `handleStart` 同 handler 使用 |

---

## 12. Git-Flow

- Branch: `feature/splash-signin-design` (`develop` から切る)
- Squash merge → `develop`
- Conventional Commits、AI-assisted trailer 必須
- 完了基準:
  - [ ] SplashPage / SignInPage 改修 + Vitest unit 全 pass
  - [ ] `pnpm --filter @yesman/web build` 成功
  - [ ] `pnpm --filter @yesman/web lint` warning 0
  - [ ] ブラウザでマニュアル動作:
    - 未認証で /score にアクセス → /auth/splash → [はじめる] → /auth/signin → サインイン → /score
    - Splash のアニメーション (staged fade-in, ~2.1s)
    - prefers-reduced-motion: reduce で animation off
    - Sign out → /auth/splash に戻る

---
