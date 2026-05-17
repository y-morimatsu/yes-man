# U7a / web-shell — NFR Design

**Unit**: U7a — `apps/web`
**Phase**: CONSTRUCTION — NFR Design
**Created**: 2026-05-16
**Status**: ✅ APPROVED 2026-05-16 (ultrathink full / 6 fixes applied: Critical 1 + Important 3 + Improvements 2)
**Upstream**: FD 7 + NFR Req 5 + NFR Design 6 = 累計 18 fixes

---

## 0. 位置付け

NFR Req §1-9 で確定した「bundle < 250 KB / CSP dev-prod 別 / refresh cookie / Workbox runtime cache / CI VERSION 注入」要件を、TypeScript ソース構造 + Vite config にマップする。

---

## 1. ソースツリー詳細

```
apps/web/
├── package.json                      # NFR Req §7 + Imp2
├── tsconfig.json
├── vite.config.ts                    # VitePWA + react plugin + skipWaiting + runtimeCaching
├── postcss.config.mjs                # Tailwind v4 PostCSS plugin
├── index.html
├── vitest.config.ts
├── .eslintrc.cjs
├── .gitignore
├── public/
│   ├── manifest.webmanifest          # (VitePWA で生成、public 配置は icons のみ)
│   ├── favicon.svg
│   └── icons/
│       ├── icon-192.png
│       └── icon-512.png
├── src/
│   ├── main.tsx                      # entry: configureAuth() + createRoot
│   ├── App.tsx                       # Provider stack + RouterProvider
│   ├── shell/
│   │   ├── env.ts                    # typed env accessor
│   │   ├── auth.ts                   # configureAuth + CognitoTokenProvider
│   │   ├── AuthProvider.tsx          # 共有 auth state
│   │   ├── RequireAuth.tsx           # 認証ガード
│   │   ├── ApiProvider.tsx           # YesmanApiClient context
│   │   ├── Layout.tsx                # header + nav + Suspense Outlet
│   │   ├── ErrorBoundary.tsx
│   │   └── routes.tsx                # createBrowserRouter
│   ├── features/                     # placeholder (U7d で完成)
│   │   ├── home/HomePage.tsx
│   │   ├── auth/
│   │   │   ├── SignInPage.tsx
│   │   │   └── CallbackPage.tsx
│   │   └── profile/ProfilePage.tsx
│   └── styles/
│       └── main.css                  # @import "tailwindcss" + @yesman/ui base
└── tests/
    ├── setup.ts                      # jsdom + jest-dom + aws-amplify mock
    └── shell/
        ├── RequireAuth.test.tsx
        ├── ApiProvider.test.tsx
        ├── AuthProvider.test.tsx
        └── routes.test.tsx
```

---

## 2. package.json

```jsonc
{
  "name": "@yesman/web",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "lint": "eslint src tests",
    "version:inject": "echo \"VITE_APP_VERSION=$(git rev-parse --short HEAD)\" > .env.local"
  },
  "dependencies": {
    "@yesman/api-client": "workspace:*",
    "@yesman/ui": "workspace:*",
    "aws-amplify": "^6.0.0",
    "react": "^18.0.0",
    "react-dom": "^18.0.0",
    "react-router-dom": "^6.20.0"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4.0.0",
    "@testing-library/jest-dom": "^6.0.0",
    "@testing-library/react": "^16.0.0",
    "@types/react": "^18.0.0",
    "@types/react-dom": "^18.0.0",
    "@typescript-eslint/eslint-plugin": "^8.0.0",
    "@typescript-eslint/parser": "^8.0.0",
    "@vitejs/plugin-react": "^4.0.0",
    "eslint": "^9.0.0",
    "jsdom": "^25.0.0",
    "tailwindcss": "^4.0.0",
    "typescript": "^5.4.0",
    "vite": "^5.0.0",
    "vite-plugin-pwa": "^0.20.0",
    "vitest": "^2.0.0"
  }
}
```

---

## 3. vite.config.ts (VitePWA + runtimeCaching)

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
      workbox: {
        // ultrathink FD Imp3: 新 SW を即時 activate
        skipWaiting: true,
        clientsClaim: true,
        // ultrathink NFR Req Imp1: 画像は runtime cache (CacheFirst 30day)
        runtimeCaching: [
          {
            urlPattern: /\.(?:png|jpg|jpeg|svg|webp|avif|ico)$/i,
            handler: "CacheFirst",
            options: {
              cacheName: "yesman-images",
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
            },
          },
        ],
      },
    }),
  ],
  server: { port: 5173 },
  build: {
    target: "es2022",
    sourcemap: true,
  },
});
```

---

## 4. tsconfig.json

```jsonc
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["vite/client", "vite-plugin-pwa/client", "vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src/**/*", "vite.config.ts", "vitest.config.ts"]
}
```

---

## 5. env.ts typed accessor (ultrathink I1: 厳格 + test stubEnv)

```typescript
// src/shell/env.ts
function required(key: string): string {
  const value = import.meta.env[key];
  if (!value || typeof value !== "string") {
    throw new Error(`Missing required env: ${key}`);
  }
  return value;
}

// production-strict: 起動時に欠落あれば throw、main.tsx で早期失敗.
// test 環境では tests/setup.ts の vi.stubEnv で全 env を fixture 設定済.
export const env = {
  apiBaseUrl: required("VITE_API_BASE_URL"),
  cognitoRegion: required("VITE_COGNITO_REGION"),
  cognitoUserPoolId: required("VITE_COGNITO_USER_POOL_ID"),
  cognitoAppClientId: required("VITE_COGNITO_APP_CLIENT_ID"),
  cognitoHostedUiUrl: required("VITE_COGNITO_HOSTED_UI_URL"),
  appVersion: (import.meta.env.VITE_APP_VERSION as string) ?? "dev",
  isDev: import.meta.env.DEV,
};
```

`tests/setup.ts` (ultrathink I1) で env を stub:
```typescript
import { vi } from "vitest";
vi.stubEnv("VITE_API_BASE_URL", "http://localhost:8000");
vi.stubEnv("VITE_COGNITO_REGION", "ap-northeast-1");
vi.stubEnv("VITE_COGNITO_USER_POOL_ID", "ap-northeast-1_test");
vi.stubEnv("VITE_COGNITO_APP_CLIENT_ID", "test-client");
vi.stubEnv("VITE_COGNITO_HOSTED_UI_URL", "https://test.auth.example.com");
```

---

## 6. AuthProvider 完成版 (FD §5.2 反映)

(FD §5.2 で詳細記載済、変更なし。NFR Design はリンクのみ)

---

## 7. App.tsx Provider stack (ultrathink Imp1: ToastProvider 外側化)

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
    // ultrathink Imp1: ToastProvider を AuthProvider より外側に配置.
    // AuthProvider 初期化失敗時にも Toast で error 通知可能 (例: Cognito 設定ミス等).
    <ErrorBoundary>
      <ToastProvider>
        <AuthProvider>
          <ApiProvider>
            <RouterProvider router={router} />
          </ApiProvider>
        </AuthProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}
```

---

## 8. ErrorBoundary

```typescript
// src/shell/ErrorBoundary.tsx
import { Component, type ErrorInfo, type ReactNode } from "react";

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // future: send to Sentry / CloudWatch RUM
    // eslint-disable-next-line no-console
    console.error("ErrorBoundary caught:", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center p-8">
          <h1 className="text-2xl font-bold mb-3">エラーが発生しました</h1>
          <p className="text-neutral-600 mb-6">ページを再読み込みしてください。</p>
          <button
            type="button"
            className="bg-brand-600 text-neutral-0 rounded-xl px-4 py-2 hover:bg-brand-700"
            onClick={() => window.location.reload()}
          >
            再読み込み
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
```

---

## 9. ApiProvider + ErrorHook 連携 (ultrathink C1 + I2)

### 9.1 ApiProvider 実装 (useRef で refresh capture)

```typescript
// src/shell/ApiProvider.tsx
import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";
import { YesmanApiClient, type ApiError } from "@yesman/api-client";
import { CognitoTokenProvider } from "./auth";
import { env } from "./env";
import { useAuth } from "./AuthProvider";

const ApiContext = createContext<YesmanApiClient | null>(null);

export function ApiProvider({ children }: { children: ReactNode }) {
  const { refresh } = useAuth();
  // ultrathink C1: useRef で latest refresh を capture、useMemo deps=[] で client 再生成を防止.
  // AuthProvider の refresh が将来 useCallback deps を変更しても ApiProvider が影響受けない.
  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  const client = useMemo(
    () =>
      new YesmanApiClient({
        baseUrl: env.apiBaseUrl,
        tokenProvider: new CognitoTokenProvider(),
        defaultHeaders: { "X-Client-Version": env.appVersion },
        onError: async (err: ApiError) => {
          if (err.is("unauthorized")) {
            await refreshRef.current();
          }
        },
      }),
    [],  // ← 1 回のみ生成、Provider 経由参照も stable
  );

  return <ApiContext.Provider value={client}>{children}</ApiContext.Provider>;
}

export function useApi(): YesmanApiClient {
  const ctx = useContext(ApiContext);
  if (!ctx) throw new Error("useApi must be used within ApiProvider");
  return ctx;
}
```

### 9.2 401 受信 → sign-in redirect の間接フロー (ultrathink I2)

```
1. API call → 401 response
2. YesmanApiClient.request 内: TokenProvider.refresh() 呼び出し (api-client 内部) → fail
3. ApiError({status: 401, reason: "unauthorized"}) を throw
4. ApiProvider.onError 発火: await refreshRef.current() (= AuthProvider.refresh)
5. AuthProvider.refresh 内: fetchAuthSession() → idToken なし → setStatus("unauthenticated")
6. React re-render: RequireAuth が status="unauthenticated" を読む
7. RequireAuth: <Navigate to="/auth/signin" state={{from: location}} replace />
```

**フロー特性**:
- step 4-6 は async + state update + next render なので少し時間差あり
- user 視点では「画面が一瞬 spinner、その後 sign-in 画面遷移」
- 直接 `window.location.href = "/auth/signin"` で hard redirect する方が UX 速いが、SPA state 喪失するため間接フロー採用

---

## 10. テスト構成 (ultrathink I3: mock 分離)

### 10.1 tests/mocks/aws-amplify.ts (分離)

```typescript
// tests/mocks/aws-amplify.ts
import { vi } from "vitest";

export const defaultAuthMock = {
  fetchAuthSession: vi.fn().mockResolvedValue({
    tokens: {
      idToken: {
        toString: () => "fake-token",
        payload: { sub: "user-1", email: "test@example.com" },
      },
    },
  }),
  signInWithRedirect: vi.fn(),
  signOut: vi.fn(),
};

export function applyDefaultAuthMock() {
  vi.mock("aws-amplify/auth", () => defaultAuthMock);
}
```

### 10.2 tests/setup.ts (global setup)

```typescript
// tests/setup.ts
import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

// ultrathink I1: env を stub (production-strict required() を test で pass させる)
vi.stubEnv("VITE_API_BASE_URL", "http://localhost:8000");
vi.stubEnv("VITE_COGNITO_REGION", "ap-northeast-1");
vi.stubEnv("VITE_COGNITO_USER_POOL_ID", "ap-northeast-1_test");
vi.stubEnv("VITE_COGNITO_APP_CLIENT_ID", "test-client");
vi.stubEnv("VITE_COGNITO_HOSTED_UI_URL", "https://test.auth.example.com");

// ultrathink I3: aws-amplify は分離 mock を import、test ごとに override 可能
import "./mocks/aws-amplify";

afterEach(() => cleanup());
```

### 10.3 個別 test での override 例

```typescript
// tests/shell/AuthProvider.unauthenticated.test.tsx
import { vi } from "vitest";
import { fetchAuthSession } from "aws-amplify/auth";

vi.mocked(fetchAuthSession).mockResolvedValueOnce({
  tokens: undefined,  // ← unauthenticated state を test
});

// ... render AuthProvider + assert status === "unauthenticated"
```

```typescript
// vitest.config.ts (ultrathink Imp2 反映)
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    setupFiles: ["./tests/setup.ts"],
    environment: "jsdom",
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.stories.tsx", "src/main.tsx"],
      thresholds: {
        lines: 75,
        branches: 65,
        autoUpdate: false,
        perFile: false,
      },
    },
  },
});
```

```typescript
// vitest.config.ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    setupFiles: ["./tests/setup.ts"],
    environment: "jsdom",
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.stories.tsx", "src/main.tsx"],
      thresholds: {
        lines: 75,
        branches: 65,
        autoUpdate: false,
        perFile: false,
      },
    },
  },
});
```

---

## 11. 受入基準

- [x] FD §1-10 + NFR Req §1-9 をすべて TS / Vite config にマップ
- [x] AuthProvider + ApiProvider (useRef pattern、ultrathink C1) + ErrorBoundary 完全実装
- [x] VitePWA workbox 設定 (skipWaiting + clientsClaim + runtimeCaching)
- [x] env.ts typed accessor + production-strict required() + test vi.stubEnv 構成 (ultrathink I1)
- [x] vitest jsdom + aws-amplify mock 分離 (ultrathink I3)
- [x] 401 → refresh → unauthenticated → Navigate redirect の間接フロー明示 (ultrathink I2)
- [x] ToastProvider を AuthProvider より outside に配置 (ultrathink Imp1)
- [x] tsconfig types に vitest/globals + jest-dom 追加 (ultrathink Imp2)
- [x] coverage thresholds 75% / 65%
- [x] ultrathink 全 6 件適用 (Critical 1 + Important 3 + Improvements 2)

## 12. ultrathink 適用ログ (2026-05-16)

### Critical 1
- **C1** (§9.1): ApiProvider に useRef pattern 採用、AuthProvider re-render から isolation

### Important 3
- **I1** (§5 + §10.2): env.ts production-strict required() 維持 + tests/setup.ts で vi.stubEnv 全 env fixture 設定
- **I2** (§9.2): 401 → refresh → unauthenticated → Navigate の間接フロー詳細 7 step
- **I3** (§10.1-10.3): aws-amplify mock を tests/mocks/aws-amplify.ts に分離、個別 test で override 可能

### Improvements 2
- **Imp1** (§7): ToastProvider を AuthProvider より outside、auth 失敗時の toast 表示確保
- **Imp2** (§4): tsconfig types に `"vitest/globals"` + `"@testing-library/jest-dom"` 追加