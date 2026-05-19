# U7a / web-shell — NFR Requirements

**Unit**: U7a — `apps/web` (Web Shell)
**Phase**: CONSTRUCTION — NFR Requirements
**Created**: 2026-05-16
**Status**: ✅ APPROVED 2026-05-16 (ultrathink full / 5 fixes applied: Important 3 + Improvements 2)
**Upstream**: FD 7 + NFR Req 5 = 累計 12 fixes

---

## 0. 位置付け

FD §1-10 で確定した「Vite + React 18 + React Router + Cognito + PWA」設計に対し、6 観点で NFR を確定する。Frontend Shell のため、SEC は CSP + XSS が中心。

---

## 1. Performance

| ID | 要件 | 計測 | 目標値 |
|---|---|---|---|
| **PERF-U7a-01** | 初期 bundle size (Layout + Auth、main chunk) | minified+gzip | **< 250 KB** (ultrathink I1: aws-amplify/auth ~100 KB + React + Router + ui + api-client = ~185 KB 試算 + マージン 65 KB) |
| **PERF-U7a-02** | feature chunk (lazy import 後) | gzip | < 50 KB / chunk |
| **PERF-U7a-03** | First Contentful Paint (FCP) | Lighthouse | < 2 秒 (CloudFront cache hit) |
| **PERF-U7a-04** | Largest Contentful Paint (LCP) | Lighthouse | < 3 秒 |
| **PERF-U7a-05** | Time to Interactive (TTI) | Lighthouse | < 4 秒 |
| **PERF-U7a-06** | route 切替 (cached chunk) | navigate | < 100 ms (chunk 読込済の場合) |
| **PERF-U7a-07** | Service Worker 初回登録 | per-deploy | < 500 ms |
| **PERF-U7a-08** | AuthProvider mount 後 session 取得 | per-mount | < 300 ms (Cognito API call) |

### 1.1 Bundle 内訳 + 将来最適化 path (ultrathink I1)

| 構成 | gzip size |
|---|---|
| React + ReactDOM | ~45 KB |
| react-router-dom | ~10 KB |
| @yesman/ui (Phase 2 で含む) | ~5 KB |
| @yesman/api-client | ~5 KB |
| aws-amplify/auth (subpath) | ~100 KB |
| App code (shell + features placeholder) | ~20 KB |
| **合計** | **~185 KB gzip** |

**将来最適化** (Phase 2):
- aws-amplify を route-level lazy import (`/auth/*` chunk のみ)、main bundle から除外で ~85 KB 削減
- React Server Components 採用検討 (Next.js 移行 path)

---

## 2. Security

| ID | 要件 | 根拠 |
|---|---|---|
| **SEC-U7a-01** | Content Security Policy (CSP) — dev/prod 別 (ultrathink I2 詳細表) | XSS 防止 |
| **SEC-U7a-02** | ID Token は **in-memory のみ**、refresh token は **aws-amplify が httpOnly cookie で管理** (ultrathink I3 補正)、page reload 時に refresh token から ID token 再取得 | session hijack 防止 + reload UX 両立 |
| **SEC-U7a-03** | OAuth callback で **`state` parameter 検証** (Cognito SDK 内部処理) | CSRF 防止 |
| **SEC-U7a-04** | Sign-out 時に **client-side state purge** (Context reset + redirect) | session lingering 防止 |
| **SEC-U7a-05** | env vars (`VITE_*`) には Cognito client ID のみ、secret は含まない | client-side で見える前提 |
| **SEC-U7a-06** | CloudFront origin verify header (U1 OriginVerifySecret) は build 時に inject されない (server-side only) | secret 漏洩防止 |
| **SEC-U7a-07** | ApiProvider の `onError` で `unauthorized` 受信時に **自動 sign-in redirect** | session 切れ UX |
| **SEC-U7a-08** | `dangerouslySetInnerHTML` の使用禁止、必要時は DOMPurify 経由 | XSS 防止 |

### 2.1 CSP 環境別設定 (ultrathink I2)

| Environment | CSP |
|---|---|
| **dev** | `script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline';` (Vite HMR 用) |
| **prod** | `script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' <api> <cognito>; img-src 'self' data: blob: <s3>; default-src 'self';` |

**prod 厳格化根拠** (ultrathink I2):
- Vite build は inline `<script>` を生成しない (全 external)、`script-src 'self'` で OK
- Tailwind の utility class は静的 CSS file になるが、稀に動的 inline-style が出る場合あり、`style-src 'unsafe-inline'` は維持
- 将来 nonce-based CSP (`'nonce-<random>'`) で `style-src 'unsafe-inline'` 削除可能、MVP では skip

---

## 3. Availability

| ID | 要件 | 根拠 |
|---|---|---|
| **AVAIL-U7a-01** | Service Worker offline で **static asset 配信可能** (Workbox precache HTML/CSS/JS) + 画像は runtime cache CacheFirst (ultrathink Imp1) | PWA 基本 |
| **AVAIL-U7a-02** | API 障害時に ErrorBoundary or Toast で **user-friendly エラー表示** | UX |
| **AVAIL-U7a-03** | Cognito 一時障害 (AuthProvider 失敗) で **sign-in page にリダイレクト**、white screen 防止 | fallback UI |
| **AVAIL-U7a-04** | route 404 は `/` に redirect (FD §5.1 で実装済) | broken link 救済 |

### 3.1 Workbox 設定 (ultrathink Imp1)

```typescript
// vite.config.ts (VitePWA plugin)
VitePWA({
  workbox: {
    skipWaiting: true,
    clientsClaim: true,
    // ultrathink Imp1: precache は default (HTML/CSS/JS)、画像は runtime cache
    runtimeCaching: [
      {
        urlPattern: /\.(?:png|jpg|jpeg|svg|webp|avif|ico)$/i,
        handler: "CacheFirst",
        options: {
          cacheName: "yesman-images",
          expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 },  // 30 day
        },
      },
    ],
  },
})
```

---

## 4. Maintainability

| ID | 要件 | 根拠 |
|---|---|---|
| **MAINT-U7a-01** | shell 層 (`src/shell/`) と features 層 (`src/features/`) を厳格分離、features → shell は OK、shell → features は禁止 | layered architecture |
| **MAINT-U7a-02** | 環境変数は `src/shell/env.ts` 1 箇所で typed accessor、`import.meta.env` 直参照禁止 | 単一情報源 |
| **MAINT-U7a-03** | routes 定義は `src/shell/routes.tsx` 1 箇所、各 feature の URL を集約 | navigation 一元化 |
| **MAINT-U7a-04** | tsconfig は U7b/U7c と同じ strict + verbatimModuleSyntax | 一貫性 |
| **MAINT-U7a-05** | ESLint rule は U7b と同じ + React Hooks rules | 一貫性 |

---

## 5. Extensibility

| ID | 要件 | 根拠 |
|---|---|---|
| **EXT-U7a-01** | 新 feature 追加は `src/features/<name>/` + `routes.tsx` 1 行追加で完結 | Open-Closed |
| **EXT-U7a-02** | 認証 backend (Cognito → 別 IdP) は `CognitoTokenProvider` 実装差替で対応 | strategy |
| **EXT-U7a-03** | i18n は `Accept-Language` + react-i18next で導入可能、本 MVP では未対応注記 | future i18n |
| **EXT-U7a-04** | dark mode toggle は Tailwind `dark:` variant + `<html class="dark">` で実装可能、MVP では auto (prefers-color-scheme) | future toggle |

---

## 6. Testability

| ID | 要件 | 根拠 |
|---|---|---|
| **TEST-U7a-01** | aws-amplify は **vi.mock で fetchAuthSession mock**、実 Cognito 呼出なし | CI unit test |
| **TEST-U7a-02** | YesmanApiClient は msw v2 で API mock | shell-level integration test |
| **TEST-U7a-03** | RequireAuth / AuthProvider は AuthState 別 render を test | core logic |
| **TEST-U7a-04** | route 統合 test は MemoryRouter で `path` を制御 | unit test |
| **TEST-U7a-05** | カバレッジ目標: lines > 75% / branches > 65% (UI shell は coverage 困難箇所多い) | 現実的目標 |

---

## 7. 環境変数

| 変数 | 必須 | default | 説明 |
|---|---|---|---|
| `VITE_API_BASE_URL` | ✅ | (なし、CI で inject) | `https://...cloudfront.net` (prod) or `http://localhost:8000` (dev) |
| `VITE_COGNITO_REGION` | ✅ | `ap-northeast-1` | Cognito User Pool region |
| `VITE_COGNITO_USER_POOL_ID` | ✅ | (なし) | `ap-northeast-1_xxxxx` |
| `VITE_COGNITO_APP_CLIENT_ID` | ✅ | (なし) | Hosted UI client id |
| `VITE_COGNITO_HOSTED_UI_URL` | ✅ | (なし) | `https://yesman-prod.auth.ap-northeast-1.amazoncognito.com` |
| `VITE_APP_VERSION` | ✅ | (CI 注入、git short SHA) — Infra Design §G で具体手順 (ultrathink Imp2) | observability + release 識別 |

### 7.1 VITE_APP_VERSION 注入手順 (ultrathink Imp2 予告)

```yaml
# .github/workflows/build-web.yml (Infra Design §G で詳細)
- name: Build web with version
  run: |
    export VITE_APP_VERSION=$(git rev-parse --short HEAD)
    pnpm --filter @yesman/web build
```

または `package.json` scripts で `VITE_APP_VERSION="$(git rev-parse --short HEAD)" vite build`。consumer が `X-Client-Version: <sha>` header で送信、CloudWatch logs / Sentry で release 別エラー追跡可能。

---

## 8. 受入基準

- [x] 6 観点で 31 NFR ID 定義 (Perf 8 + Sec 8 + Avail 4 + Maint 5 + Ext 4 + Test 5)
- [x] FD 設計と整合 (AuthProvider + Suspense + skipWaiting)
- [x] Lighthouse 目標 (FCP < 2s / LCP < 3s / TTI < 4s)
- [x] **bundle size < 250 KB** + 内訳 + lazy 最適化 path (ultrathink I1)
- [x] CSP dev/prod 別表 + prod 厳格化 (ultrathink I2)
- [x] ID Token in-memory + refresh token httpOnly cookie + reload 復元 (ultrathink I3)
- [x] Workbox runtime cache (画像 CacheFirst 30day) (ultrathink Imp1)
- [x] VITE_APP_VERSION CI 注入手順予告 (ultrathink Imp2)
- [x] coverage 現実的目標 (lines 75% / branches 65%)
- [x] 環境変数 6 個確定
- [x] ultrathink 全 5 件適用 (Important 3 + Improvements 2)

## 9. ultrathink 適用ログ (2026-05-16)

### Important 3
- **I1** (PERF-U7a-01 + §1.1): bundle size 目標を < 250 KB に緩和 + 内訳表 + lazy aws-amplify 将来最適化
- **I2** (SEC-U7a-01 + §2.1): CSP 環境別表 (dev: unsafe-inline + HMR / prod: 'self' for scripts + 'unsafe-inline' for styles)
- **I3** (SEC-U7a-02): ID Token in-memory + refresh token httpOnly cookie + page reload 復元明示

### Improvements 2
- **Imp1** (AVAIL-U7a-01 + §3.1): Workbox runtimeCaching で画像 CacheFirst 30day、precache は HTML/CSS/JS
- **Imp2** (§7.1): VITE_APP_VERSION 注入手順 (`git rev-parse --short HEAD`)、Infra Design §G で詳細

---

## Post-CONSTRUCTION 改修注記 (2026-05-17 〜 2026-05-19)

本ドキュメント本体は 2026-05-16 承認時の Snapshot (ultrathink full 5 fixes 適用済) を保持。

**Important 3 / Improvements 2 の合計 5 件の NFR 修正点は全て継続有効**。Vite bundle size budget、React Router lazy loading、PWA cache strategy、Cognito v6 token refresh policy 等の NFR は不変。

### 軽微な変更
- **AuthBypass guard 強化** (`2400f45`): `signIn` / `signOutUser` no-op 化により、e2e テスト時の network 出力をゼロにする (テストカバレッジ NFR の信頼性向上)
- **`max-w-md` mobile-first 制約** (`1924411`): UX/Accessibility NFR (タッチターゲット 44×44) の前提となる viewport 制約を強化
- **header palette `#F5E5C4`** (`1924411`): FE-DESIGN-03 (Intentional Color Palette) 厳格化

→ U7a NFR Req は CONSTRUCTION 完了状態を維持、FE-DESIGN 整合性が強化。
