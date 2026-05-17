# U7a / web-shell — Code Generation Plan (Part 1)

**Unit**: U7a
**Phase**: CONSTRUCTION — Code Generation Part 1 (Planning)
**Created**: 2026-05-16
**Status**: ✅ APPROVED 2026-05-16 (ultrathink full / 5 fixes applied: Important 3 + Improvements 2)
**Upstream**: FD 7 + NFR Req 5 + NFR Design 6 + Infra Design 5 + Code Gen Plan 5 = 累計 28 fixes

---

## 0. 位置付け

NFR Design §1 + Infra Design で確定した「~25 src + 4 test / Vite + React Router + Cognito + PWA」構成を、Phase A-G の 7 段階で実装する詳細計画に展開する。

---

## 1. 全体方針

### 1.1 ファイル集計

| カテゴリ | 数 |
|---|---|
| **新規 apps/web 設定** | 9 (package.json + tsconfig + vite.config + postcss.config + index.html + .eslintrc + .gitignore + .env.example + vitest.config) |
| **新規 public assets** | 3 (favicon.svg + icons 2 個 placeholder) |
| **新規 src/ entry** | 2 (main.tsx + App.tsx) |
| **新規 src/shell** | 8 (env + auth + AuthProvider + RequireAuth + ApiProvider + Layout + ErrorBoundary + routes) |
| **新規 src/features (placeholder)** | 5 (home + auth/SignIn + auth/Callback + profile) — actual implementation は U7d |
| **新規 src/styles** | 1 (main.css) |
| **新規 tests** | 6 (setup + mocks/aws-amplify + 4 shell tests) |
| **CDK 変更 (infra/lib/stacks/frontend-stack.ts)** | 1 (Response Headers Policy + S3 Lifecycle + OIDC role 追加) |
| **CI workflow** | 1 (.github/workflows/pr-frontend.yml + deploy-web.yml — MVP では artifact upload のみ) |
| **合計** | **約 36 ファイル** |

### 1.2 順序 (線形)

Phase A.0 (pre-flight) → A (基盤 9) → B (public + entry 5) → C (shell 8) → D (features placeholder 5 + styles 1) → E (tests 6) → F (CDK + CI) → G (verify) の 8 段階。

### 1.3 品質基準

- TypeScript `tsc --noEmit` 通過
- `pnpm run test` 全 pass + coverage 75%/65%
- `pnpm run lint` 通過
- `pnpm run build` 成功
- bundle size 試算で < 250 KB gzip 達成見込み

---

## 2. Phase A.0: Pre-flight check

- [ ] **A.0.1** `ls /Users/morimatsu/lab/ai-dlc-hackathon/apps/web/` で不在を確認 (greenfield)
- [ ] **A.0.2** monorepo (pnpm-workspace.yaml + root package.json) は U7c で作成済、apps/web 追加のみで動作

---

## 3. Phase A: apps/web 設定 9 ファイル

- [ ] **A.1** `apps/web/package.json` (NFR Design §2、deps + devDeps + scripts、engines.node>=20、**`private: true` + `version: "0.0.0"` 固定** ultrathink I2: publish 対象外、release 識別は VITE_APP_VERSION (git SHA))
- [ ] **A.2** `apps/web/tsconfig.json` (NFR Design §4、strict + types + jsx react-jsx)
- [ ] **A.3** `apps/web/vite.config.ts` (NFR Design §3、VitePWA workbox + skipWaiting + runtimeCaching)
- [ ] **A.4** `apps/web/vitest.config.ts` (NFR Design §10.3、jsdom + setupFiles + coverage)
- [ ] **A.5** `apps/web/postcss.config.mjs` (Tailwind v4 PostCSS plugin)
- [ ] **A.6** `apps/web/index.html` (entry + viewport + manifest link)
- [ ] **A.7** `apps/web/.eslintrc.cjs` (U7b/U7c と同パターン + React Hooks rules)
- [ ] **A.8** `apps/web/.gitignore` (dist/ + node_modules/ + .env.local + .vite/)
- [ ] **A.9** `apps/web/.env.example` (6 env vars 列挙、values は placeholder)

---

## 4. Phase B: public assets + entry 5 ファイル

- [ ] **B.1** `apps/web/public/favicon.svg` (YesMan brand simple SVG)
- [ ] **B.2** `apps/web/public/icons/icon-192.png` (placeholder、build 時用)
- [ ] **B.3** `apps/web/public/icons/icon-512.png` (同上)
- [ ] **B.4** `apps/web/src/main.tsx` (entry: configureAuth + createRoot、ultrathink FD I1)
- [ ] **B.5** `apps/web/src/App.tsx` (Provider stack ErrorBoundary > ToastProvider > AuthProvider > ApiProvider > RouterProvider、ultrathink NFR Design Imp1)

---

## 5. Phase C: src/shell 8 ファイル

- [ ] **C.1** `src/shell/env.ts` (typed accessor、required validation、ultrathink NFR Design I1)
- [ ] **C.2** `src/shell/auth.ts` (configureAuth + CognitoTokenProvider + signIn/signOut、ultrathink FD I1 関数化)
- [ ] **C.3** `src/shell/AuthProvider.tsx` (共有 auth state、ultrathink FD C1)
- [ ] **C.4** `src/shell/RequireAuth.tsx` (state 読むだけ、ultrathink FD C1)
- [ ] **C.5** `src/shell/ApiProvider.tsx` (useRef pattern + onError 401 refresh、ultrathink NFR Design C1)
- [ ] **C.6** `src/shell/ErrorBoundary.tsx` (class component、fallback UI)
- [ ] **C.7** `src/shell/Layout.tsx` (header + Suspense Outlet、ultrathink FD I2)
- [ ] **C.8** `src/shell/routes.tsx` (createBrowserRouter + lazy import)

---

## 6. Phase D: features placeholder 4 + styles 1 = 5 ファイル (ultrathink I1: 最小限スコープ)

**スコープ境界** (ultrathink I1): U7a は **shell + 最小限 routing 動作**、実 feature 実装は **U7d** で完成。本 Phase D の placeholder は以下:

- [ ] **D.1** `src/features/home/HomePage.tsx` (~20 LOC、"Welcome to YesMan" + nav links 3 個 = profile/decision (U7d 後)/score (U7d 後))
- [ ] **D.2** `src/features/auth/SignInPage.tsx` (~20 LOC、Button + `signIn()` 呼び出し、location.state.from 保持で sign-in 後復帰、ultrathink FD Imp2)
- [ ] **D.3** `src/features/auth/CallbackPage.tsx` (~30 LOC、useEffect で AuthProvider.refresh + navigate(from)、ultrathink FD §5.4)
- [ ] **D.4** `src/features/profile/ProfilePage.tsx` (~10 LOC、"Profile (coming soon、U7d で実装)")
- [ ] **D.5** `src/styles/main.css` (~20 LOC、`@import "tailwindcss"; @import "@yesman/ui/styles.css";`)

---

## 7. Phase E: tests 6 ファイル

- [ ] **E.1** `tests/setup.ts` (jest-dom + cleanup + vi.stubEnv 6 個 + aws-amplify mock 適用、ultrathink NFR Design I1 + I3)
- [ ] **E.2** `tests/mocks/aws-amplify.ts` (defaultAuthMock + applyDefaultAuthMock、分離、ultrathink NFR Design I3)
- [ ] **E.3** `tests/shell/AuthProvider.test.tsx` (authenticated / unauthenticated / refresh)
- [ ] **E.4** `tests/shell/RequireAuth.test.tsx` (loading / authenticated / unauthenticated redirect)
- [ ] **E.5** `tests/shell/ApiProvider.test.tsx` (client creation + useApi hook + **useRef isolation 確認** ultrathink Imp2 具体化):

```typescript
// useRef pattern isolation: AuthProvider rerender でも client instance 不変
it("client instance stable across AuthProvider re-renders", () => {
  const { result, rerender } = renderHook(() => useApi(), {
    wrapper: ({ children }) => (
      <AuthProvider><ApiProvider>{children}</ApiProvider></AuthProvider>
    ),
  });
  const firstClient = result.current;
  rerender();
  expect(result.current).toBe(firstClient);  // ← 参照同一性、ultrathink NFR Design C1 検証
});
```
- [ ] **E.6** `tests/shell/routes.test.tsx` (MemoryRouter + path matching + 404 redirect)

---

## 8. Phase F: CDK + CI (ultrathink I3: existence 確認 phase F.0)

- [ ] **F.0** `ls infra/lib/stacks/frontend-stack.ts` で existence 確認:
  - 既存 → F.1 で **merge** (新 resource を追加)
  - 未存在 → F.1 で **新規作成** (Response Headers Policy + Lifecycle + OIDC のみの minimal stack)、後続 unit で extend
- [ ] **F.1** `infra/lib/stacks/frontend-stack.ts` 変更/新規:
  - Response Headers Policy 追加 (ultrathink Infra Design Imp1)
  - S3 Lifecycle rule (assets/ 30day expire、ultrathink I1)
  - OIDC IAM Role (placeholder GITHUB_ORG/REPO、ultrathink I3)
- [ ] **F.2** `.github/workflows/pr-frontend.yml` (MVP: artifact upload のみ、U7c/U7b/U7a の build+test 統合)
- [ ] (Optional MVP外) `.github/workflows/deploy-web.yml` (main branch deploy)

---

## 9. Phase G: verify

- [ ] **G.1** JSON 構文確認: `package.json` + `tsconfig.json` + `vitest.config.ts` 等
- [ ] **G.2** TypeScript compile (環境制約で skip、CI で実行)
- [ ] **G.3** LOC 集計 (ultrathink Imp1 詳細化):

| カテゴリ | LOC |
|---|---|
| 設定 9 ファイル (package.json + tsconfig + vite.config + 等) | ~150 |
| Public assets (binary、LOC 計上外) | - |
| entry 2 (main.tsx + App.tsx) | ~30 |
| shell 8 (env + auth + AuthProvider + RequireAuth + ApiProvider + ErrorBoundary + Layout + routes) | ~450 |
| features placeholder 4 | ~80 |
| styles main.css | ~20 |
| tests 6 (setup + mock + 4 shell tests) | ~250 |
| **合計** | **~980 LOC** |

---

## 10. リスク

| リスク | 影響 | 対応 |
|---|---|---|
| aws-amplify v6 の Hub event / token storage 仕様変更 | 認証フロー破綻 | lock version 6.x、major upgrade は別 PR で動作確認 |
| Vite v5 → v6 migration 時の plugin 互換性 | build 失敗 | lock vite ^5、v6 移行は U7d 完成後 |
| `vite-plugin-pwa` の workbox 仕様変更 | SW 動作不能 | lock 0.20.x、breaking change 別 PR |
| Cognito Hosted UI redirect URI 設定漏れ | callback で error | U1 frontend-stack + Cognito User Pool で `redirectSignIn` 確認 |
| OIDC trust policy の sub claim ミス | deploy 失敗 | placeholder を明示、運用時に実 repo path に置換 |

---

## 11. 承認チェックリスト

- [x] Phase A.0 → A → B → C → D → E → F.0 → F → G の 9 段階順序 (F.0 existence check 追加、ultrathink I3)
- [x] 約 36 ファイル、LOC 内訳 ~980 (ultrathink Imp1)
- [x] FD/NFR Req/NFR Design/Infra Design 全 fix 反映
- [x] features placeholder は U7a shell の最小限スコープ (ultrathink I1)
- [x] apps/web は publish 対象外、version 固定 (ultrathink I2)
- [x] U7b (ui) + U7c (api-client) workspace 依存解決
- [x] aws-amplify v6 subpath imports + tree-shake
- [x] AuthProvider/ApiProvider/Suspense/PWA/Response Headers 全実装
- [x] tests 6 ファイル (setup + mock + 4 shell、useRef isolation 具体化 ultrathink Imp2)
- [x] CI workflow 統合 (api-client + ui + web)
- [x] CDK frontend-stack.ts 変更 (Lifecycle + Headers Policy + OIDC)
- [x] ultrathink 全 5 件適用 (Important 3 + Improvements 2)

## 12. ultrathink 適用ログ (2026-05-16)

### Important 3
- **I1** (§6): features placeholder 4 ファイルを U7a 最小限スコープに絞る、各 ~10-30 LOC
- **I2** (§3 A.1): `apps/web` の `version: "0.0.0"` 固定、publish 対象外、release 識別は VITE_APP_VERSION
- **I3** (§8 F.0): frontend-stack.ts existence 確認 Phase 追加、existing なら merge / 未存在なら新規

### Improvements 2
- **Imp1** (§9 G.3): LOC 内訳表 (config 150 + entry 30 + shell 450 + features 80 + styles 20 + tests 250 = ~980 LOC)
- **Imp2** (§7 E.5): ApiProvider useRef isolation test の具体 code (`rerender → expect(client).toBe(firstClient)`)
