# U7a / web-shell — Functional Design

**Unit**: U7a — `apps/web` (React PWA Shell + Routing + Auth + PWA manifest)
**Phase**: CONSTRUCTION — Functional Design
**Author**: AI-DLC workflow
**Created**: 2026-05-16
**Status**: ✅ APPROVED 2026-05-16 (ultrathink full / 7 fixes applied: Critical 1 + Important 3 + Improvements 3)

---

## 0. 位置付け

`apps/web/` は YesMan PWA の **shell** (ルーティング / 認証ガード / グローバルレイアウト / PWA manifest)。U7d Features は別 unit、本 unit は **shell 層のみ**。

### 関連要件
- Story A1-A4 (認証 + プロフィール、Cognito 統合)
- FR-AUTH (Cognito Hosted UI 経由)
- PWA Shell (オフライン基本動作 + manifest + Service Worker)
- 全 user-facing 画面の routing 統合

### 上流前提
| 出典 | 内容 |
|---|---|
| U7b ui | `@yesman/ui` から ToastProvider / Button / Card 等を import |
| U7c api-client | `@yesman/api-client` から YesmanApiClient + CognitoTokenProvider 実装 |
| U3 cognito | Hosted UI URL + Client ID + JWKS (env 経由) |
| U7d features | feature views は別 unit、shell は route placeholder のみ用意 |
| Infra (U1) | CloudFront + S3 で配信、cognito-local は dev のみ |

### MVP スコープ (U7a 内)
- ✅ Vite + React 18 + TypeScript の base setup
- ✅ React Router v6 で route 定義 + 認証ガード (`RequireAuth`)
- ✅ Cognito 統合 (`aws-amplify` 経由、CognitoTokenProvider 実装)
- ✅ YesmanApiClient のグローバル instance + `useApi()` hook
- ✅ `<App>` (Layout shell + 認証 state 管理 + ToastProvider 包含)
- ✅ PWA manifest + Service Worker (Workbox 基本構成)
- ✅ Profile 初回作成 onboarding (U3 GET /me で自動 upsert)
- ✅ Sign-in / Sign-out ボタン (Hosted UI redirect)
- ⏭ Feature views (decision / persona / score) は U7d で実装、本 unit は placeholder
- ⏭ オフライン機能の詳細 (Workbox precache 範囲) は MVP では default
- ⏭ Push notification は MVP 範囲外

---

## 1. ディレクトリ構成

```
apps/web/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── postcss.config.mjs
├── index.html
├── public/
│   ├── manifest.webmanifest
│   ├── favicon.svg
│   └── icons/
│       ├── icon-192.png
│       └── icon-512.png
├── src/
│   ├── main.tsx                   # React.createRoot + <App>
│   ├── App.tsx                    # Layout + Routes + Provider stack
│   ├── shell/
│   │   ├── auth.ts                # CognitoTokenProvider + Amplify config
│   │   ├── RequireAuth.tsx        # 認証ガード HOC / wrapper
│   │   ├── ApiProvider.tsx        # YesmanApiClient context + useApi hook
│   │   ├── Layout.tsx             # header / nav / footer
│   │   ├── ErrorBoundary.tsx
│   │   ├── routes.tsx             # Route 定義 (lazy import)
│   │   └── env.ts                 # 環境変数 typed accessor (import.meta.env wrapper)
│   ├── features/                  # U7d 配下、本 unit では placeholder のみ
│   │   ├── home/
│   │   │   └── HomePage.tsx       # placeholder (U7d で完成)
│   │   ├── auth/
│   │   │   ├── CallbackPage.tsx   # OAuth callback
│   │   │   └── SignInPage.tsx
│   │   └── profile/
│   │       └── ProfilePage.tsx    # placeholder
│   └── styles/
│       └── main.css               # Tailwind + @yesman/ui/styles.css import
└── tests/
    ├── shell/
    │   ├── RequireAuth.test.tsx
    │   ├── ApiProvider.test.tsx
    │   └── routes.test.tsx
    └── setup.ts
```

---

## 2. Vite + React 18 setup

### 2.1 vite.config.ts

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "YesMan",
        short_name: "YesMan",
        theme_color: "#ea580c",  // brand-600
        background_color: "#ffffff",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
        ],
      },
    }),
  ],
  server: { port: 5173 },
});
```

### 2.2 環境変数 (typed accessor)

```typescript
// src/shell/env.ts
export const env = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL as string,
  cognitoRegion: import.meta.env.VITE_COGNITO_REGION as string,
  cognitoUserPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID as string,
  cognitoAppClientId: import.meta.env.VITE_COGNITO_APP_CLIENT_ID as string,
  cognitoHostedUiUrl: import.meta.env.VITE_COGNITO_HOSTED_UI_URL as string,
  appVersion: import.meta.env.VITE_APP_VERSION as string,
  isDev: import.meta.env.DEV,
};
```

---

## 3. Cognito 統合 (aws-amplify、ultrathink I1 + Imp1 反映)

### 3.1 CognitoTokenProvider + 明示的 configure 関数

```typescript
// src/shell/auth.ts
// ultrathink Imp1: aws-amplify v6 の subpath imports で tree-shake、bundle size 削減
import { Amplify } from "aws-amplify";
import { fetchAuthSession, signInWithRedirect, signOut } from "aws-amplify/auth";
import type { TokenProvider } from "@yesman/api-client";
import { env } from "./env";

// ultrathink I1: module load 時の副作用回避、main.tsx で明示的に呼ぶ.
// auth.ts を test で import する際、Amplify.configure が走らず副作用フリー.
export function configureAuth(): void {
  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId: env.cognitoUserPoolId,
        userPoolClientId: env.cognitoAppClientId,
        loginWith: {
          oauth: {
            domain: env.cognitoHostedUiUrl.replace("https://", ""),
            scopes: ["openid", "email", "profile"],
            redirectSignIn: [`${window.location.origin}/auth/callback`],
            redirectSignOut: [window.location.origin],
            responseType: "code",
          },
        },
      },
    },
  });
}

export class CognitoTokenProvider implements TokenProvider {
  async getToken(): Promise<string | null> {
    const session = await fetchAuthSession();
    return session.tokens?.idToken?.toString() ?? null;
  }

  async refresh(): Promise<string | null> {
    const session = await fetchAuthSession({ forceRefresh: true });
    return session.tokens?.idToken?.toString() ?? null;
  }
}

export async function signIn(): Promise<void> {
  await signInWithRedirect();
}

export async function signOutUser(): Promise<void> {
  await signOut({ global: false });
}
```

### 3.2 main.tsx で configure 呼び出し

```typescript
// src/main.tsx
import { createRoot } from "react-dom/client";
import { configureAuth } from "./shell/auth";
import App from "./App";
import "./styles/main.css";

configureAuth();  // ← ultrathink I1: 明示的 init、test 環境では呼ばない

createRoot(document.getElementById("root")!).render(<App />);
```

---

## 4. YesmanApiClient + Provider

### 4.1 ApiProvider

```typescript
// src/shell/ApiProvider.tsx
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { YesmanApiClient } from "@yesman/api-client";
import { CognitoTokenProvider } from "./auth";
import { env } from "./env";

const ApiContext = createContext<YesmanApiClient | null>(null);

export function ApiProvider({ children }: { children: ReactNode }) {
  const client = useMemo(
    () =>
      new YesmanApiClient({
        baseUrl: env.apiBaseUrl,
        tokenProvider: new CognitoTokenProvider(),
        defaultHeaders: {
          "X-Client-Version": env.appVersion,
        },
      }),
    [],
  );
  return <ApiContext.Provider value={client}>{children}</ApiContext.Provider>;
}

export function useApi(): YesmanApiClient {
  const ctx = useContext(ApiContext);
  if (!ctx) throw new Error("useApi must be used within ApiProvider");
  return ctx;
}
```

---

## 5. Routes + 認証ガード

### 5.1 routes.tsx (lazy import)

```typescript
// src/shell/routes.tsx
import { lazy } from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";
import { RequireAuth } from "./RequireAuth";
import { Layout } from "./Layout";

const HomePage = lazy(() => import("../features/home/HomePage"));
const SignInPage = lazy(() => import("../features/auth/SignInPage"));
const CallbackPage = lazy(() => import("../features/auth/CallbackPage"));
const ProfilePage = lazy(() => import("../features/profile/ProfilePage"));

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      { index: true, element: <RequireAuth><HomePage /></RequireAuth> },
      { path: "auth/signin", element: <SignInPage /> },
      { path: "auth/callback", element: <CallbackPage /> },
      { path: "profile", element: <RequireAuth><ProfilePage /></RequireAuth> },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);
```

### 5.2 AuthProvider (ultrathink C1: flicker 解消、共有 state)

```typescript
// src/shell/AuthProvider.tsx
"use client";
import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { fetchAuthSession } from "aws-amplify/auth";

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

export interface AuthState {
  status: AuthStatus;
  sub: string | null;
  email: string | null;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [sub, setSub] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const session = await fetchAuthSession();
      const idToken = session.tokens?.idToken;
      if (idToken) {
        const payload = idToken.payload;
        setSub(typeof payload.sub === "string" ? payload.sub : null);
        setEmail(typeof payload.email === "string" ? payload.email : null);
        setStatus("authenticated");
      } else {
        setStatus("unauthenticated");
      }
    } catch {
      setStatus("unauthenticated");
    }
  }, []);

  // ultrathink C1: session 取得は AuthProvider mount 時 1 回のみ、route 切替で再実行しない
  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <AuthContext.Provider value={{ status, sub, email, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
```

### 5.3 RequireAuth (state を参照するだけ、flicker なし)

```typescript
// src/shell/RequireAuth.tsx
import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Spinner } from "@yesman/ui";
import { useAuth } from "./AuthProvider";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();

  if (status === "loading") {
    return (
      <div className="flex justify-center p-8">
        <Spinner />
      </div>
    );
  }
  if (status === "unauthenticated") {
    // ultrathink Imp2: state.from で元 page を保持、sign-in 後に復帰可能
    return <Navigate to="/auth/signin" state={{ from: location }} replace />;
  }
  return <>{children}</>;
}
```

### 5.4 CallbackPage で元 page 復帰 (ultrathink Imp2)

```typescript
// src/features/auth/CallbackPage.tsx
import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../../shell/AuthProvider";

export default function CallbackPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { status, refresh } = useAuth();

  useEffect(() => {
    void refresh();  // OAuth callback で token 取得済を再確認
  }, [refresh]);

  useEffect(() => {
    if (status === "authenticated") {
      const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname ?? "/";
      navigate(from, { replace: true });
    }
  }, [status, navigate, location.state]);

  return <p>Signing in...</p>;
}
```

---

## 6. Layout + Provider stack

### 6.1 App.tsx (Provider stack、ultrathink I3 反映)

```typescript
// src/App.tsx
import { RouterProvider } from "react-router-dom";
import { ToastProvider } from "@yesman/ui";
import { AuthProvider } from "./shell/AuthProvider";
import { ApiProvider } from "./shell/ApiProvider";
import { ErrorBoundary } from "./shell/ErrorBoundary";
import { router } from "./shell/routes";

export default function App() {
  return (
    // ultrathink I3 注: ErrorBoundary は outermost、unrecoverable な exception を catch.
    // route 単位の error は React Router `errorElement` で補完可能だが、MVP は単一 ErrorBoundary で十分.
    <ErrorBoundary>
      <AuthProvider>
        <ApiProvider>
          <ToastProvider>
            <RouterProvider router={router} />
          </ToastProvider>
        </ApiProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
```

### 6.2 Layout.tsx (ultrathink I2: Suspense wrapping)

```typescript
// src/shell/Layout.tsx
import { Suspense } from "react";
import { Outlet, Link } from "react-router-dom";
import { Button, Spinner } from "@yesman/ui";
import { signOutUser } from "./auth";

export function Layout() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-brand-600 text-neutral-0 p-4">
        <div className="flex justify-between items-center max-w-4xl mx-auto w-full">
          <Link to="/" className="text-xl font-bold">YesMan</Link>
          <Button variant="ghost" size="sm" onClick={signOutUser}>Sign out</Button>
        </div>
      </header>
      <main className="flex-1 p-4 max-w-4xl mx-auto w-full">
        {/* ultrathink I2: lazy route の chunk 読み込み中 fallback を global で 1 箇所提供 */}
        <Suspense fallback={<div className="flex justify-center p-8"><Spinner /></div>}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
}
```

---

## 7. PWA manifest + Service Worker (ultrathink Imp3: skipWaiting + clientsClaim)

`VitePWA` plugin が auto 設定:
- `manifest.webmanifest` を build 時生成
- Service Worker (Workbox) で自動キャッシュ
- `registerType: "autoUpdate"` で更新時自動再読み込み
- **`workbox.skipWaiting: true` + `workbox.clientsClaim: true`** で新版 SW が即時 activate、user の手動 reload 不要

```typescript
VitePWA({
  registerType: "autoUpdate",
  workbox: {
    skipWaiting: true,    // ultrathink Imp3: 新 SW を即時 activate
    clientsClaim: true,   // 全 client (tab) を新 SW 制御下に
  },
  manifest: { ... },
})
```

**トレードオフ** (ultrathink Imp3): 旧 tab で古い data structure を持つ場合に runtime error 可能性、MVP では許容 (ホットスタンバイ desired)。安定後は user prompt + reload に切替検討。

---

## 8. テスト戦略

| ファイル | 種別 | 対象 |
|---|---|---|
| `tests/shell/RequireAuth.test.tsx` | RTL + msw | loading / authenticated / unauthenticated state |
| `tests/shell/ApiProvider.test.tsx` | RTL | client instance creation + useApi hook |
| `tests/shell/routes.test.tsx` | RTL + MemoryRouter | route matching + redirect 404 → / |

合計 ~12 ケース。aws-amplify は mock 化、認証ロジックは contract test として確認。

---

## 9. 受入基準 (Stage 1 完了)

- [x] Vite + React 18 + TypeScript base setup
- [x] Cognito Hosted UI 統合 (aws-amplify v6) + `configureAuth()` 明示呼び出し (ultrathink I1)
- [x] **AuthProvider** で session 1 回取得 + `useAuth()` で共有 state、flicker 解消 (ultrathink C1)
- [x] React Router v6 + 認証ガード + Suspense wrapping for lazy route (ultrathink I2)
- [x] YesmanApiClient + Provider + useApi hook
- [x] ToastProvider + ErrorBoundary 統合、route-level errorElement は補完 option (ultrathink I3)
- [x] PWA manifest + Service Worker + skipWaiting + clientsClaim (ultrathink Imp3)
- [x] 環境変数 typed accessor
- [x] U7b ui + U7c api-client 連携 (aws-amplify/auth subpath で tree-shake、ultrathink Imp1)
- [x] sign-in 後の元 page 復帰 (location.state.from、ultrathink Imp2)
- [x] テスト戦略 3 ファイル × ~12 ケース
- [x] ultrathink 全 7 件適用 (Critical 1 + Important 3 + Improvements 3)

## 10. ultrathink 適用ログ (2026-05-16)

### Critical 1
- **C1** (§5.2 + 5.3): `AuthProvider` で session 1 回取得、`useAuth()` で共有 state、`RequireAuth` は state 読むだけ、route 切替 flicker 解消

### Important 3
- **I1** (§3.1-3.2): `configureAuth()` 関数化、`main.tsx` で明示呼び出し、test 環境で副作用フリー
- **I2** (§6.2): Layout `<Outlet />` を `<Suspense fallback={<Spinner />}>` で wrap、lazy route chunk 読込中 fallback
- **I3** (§6.1): ErrorBoundary outermost を維持、route-level errorElement は MVP では補完 option として注記

### Improvements 3
- **Imp1** (§3.1): aws-amplify v6 subpath imports (`aws-amplify/auth`) で tree-shake、bundle size 削減
- **Imp2** (§5.3-5.4): `location.state.from` 経由で sign-in 後の元 page 復帰、CallbackPage で `navigate(from)`
- **Imp3** (§7): `workbox: { skipWaiting: true, clientsClaim: true }` で新 SW 即時 activate、トレードオフ注記

---

## Post-CONSTRUCTION 改修注記 (2026-05-17 〜 2026-05-19)

本ドキュメント本体は 2026-05-16 承認時の Snapshot を保持。以下の改修が Post-CONSTRUCTION 段階で本 unit のスコープに加わった:

### 1. AuthBypass 整合性の厳密化 (`2400f45`、2026-05-17)
- **`apps/web/src/shell/auth.ts`**: `signIn()` / `signOutUser()` が `env.authBypass === true` のとき完全に no-op になるよう修正
- 動機: AuthBypass mode で `aws-amplify` の cognito SDK 呼び出しを抑止、e2e テストで Sign in / Sign out ボタンを押した際に network へ出ないことを保証
- `RequireAuth` の挙動は不変 (`authBypass=true` なら常に通す)

### 2. Layout の FE-DESIGN 準拠 (`1924411`、2026-05-19)
- **`apps/web/src/shell/Layout.tsx`**:
  - container を `max-w-md` (mobile-first 480px) で制約
  - header palette を `#F5E5C4` (INCEPTION drawio 準拠の和紙色) に固定
- FE-DESIGN-03 (Intentional Color Palette) + FE-DESIGN-05 (Mobile-First Viewport) 準拠

### Shell 構成は不変
- `ApiProvider` / `AuthProvider` / `QueryProvider` / `RequireAuth` / `ErrorBoundary` / `routes.tsx` の構成は変更なし
- Vite + React 18 + React Router v6 + Cognito v6 + msw mock の組み合わせ不変
- `tests/setup.ts` + `tests/mocks/aws-amplify.ts` の 6 test ファイルも不変 (assertion のみ update)

→ U7a / web-shell は構造を維持したまま、AuthBypass の watertight 化と FE-DESIGN 準拠の 2 点を強化。
