# U7a / web-shell — Infrastructure Design

**Unit**: U7a — `apps/web`
**Phase**: CONSTRUCTION — Infrastructure Design
**Created**: 2026-05-16
**Status**: ✅ APPROVED 2026-05-16 (ultrathink full / 5 fixes applied: Important 3 + Improvements 2)
**Upstream**: FD 7 + NFR Req 5 + NFR Design 6 + Infra Design 5 = 累計 23 fixes

---

## 0. 位置付け

U7c / U7b と異なり、U7a は **AWS インフラ消費する成果物** (CloudFront + S3 配信) を持つ。U1 で frontend-stack.ts が既存だが、本 unit の deliverables (PWA assets + manifest + Service Worker) を deploy する手順を確定する。

---

## 1. Monorepo 連携

`pnpm-workspace.yaml` で `apps/*` 配下、`@yesman/web` として認識。internal package (api-client / ui) を workspace:* で参照。

---

## 2. CI/CD パイプライン

### 2.1 build + test workflow

```yaml
# .github/workflows/pr-frontend.yml に追加
jobs:
  web:
    needs: [api-client, ui]    # U7c + U7b 完了後
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - uses: actions/cache@v4
        with:
          path: ~/.cache/pnpm
          key: deps-${{ runner.os }}-${{ hashFiles('pnpm-lock.yaml') }}

      - run: pnpm install --frozen-lockfile

      # api-client + ui build (workspace deps、events scoped)
      - run: pnpm --filter @yesman/api-client build
      - run: pnpm --filter @yesman/ui build

      # ★ web build + test
      - name: Inject VITE_APP_VERSION (NFR Req §7.1)
        run: echo "VITE_APP_VERSION=$(git rev-parse --short HEAD)" >> $GITHUB_ENV
      - run: pnpm --filter @yesman/web build
        env:
          VITE_API_BASE_URL: ${{ vars.VITE_API_BASE_URL }}
          VITE_COGNITO_REGION: ${{ vars.VITE_COGNITO_REGION }}
          VITE_COGNITO_USER_POOL_ID: ${{ vars.VITE_COGNITO_USER_POOL_ID }}
          VITE_COGNITO_APP_CLIENT_ID: ${{ vars.VITE_COGNITO_APP_CLIENT_ID }}
          VITE_COGNITO_HOSTED_UI_URL: ${{ vars.VITE_COGNITO_HOSTED_UI_URL }}

      - run: pnpm --filter @yesman/web lint
      - run: pnpm --filter @yesman/web test
```

### 2.2 deploy workflow (main branch、prod)

```yaml
# .github/workflows/deploy-web.yml
name: Deploy web (prod)
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      id-token: write       # AWS OIDC で IAM role assume
      contents: read
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile

      # Build prod assets
      - name: Build with prod env
        env:
          VITE_APP_VERSION: ${{ github.sha }}
          VITE_API_BASE_URL: ${{ vars.PROD_API_BASE_URL }}
          VITE_COGNITO_REGION: ap-northeast-1
          VITE_COGNITO_USER_POOL_ID: ${{ vars.PROD_COGNITO_USER_POOL_ID }}
          VITE_COGNITO_APP_CLIENT_ID: ${{ vars.PROD_COGNITO_APP_CLIENT_ID }}
          VITE_COGNITO_HOSTED_UI_URL: ${{ vars.PROD_COGNITO_HOSTED_UI_URL }}
        run: |
          pnpm --filter @yesman/api-client build
          pnpm --filter @yesman/ui build
          pnpm --filter @yesman/web build

      # OIDC で IAM Role assume
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ vars.AWS_DEPLOY_ROLE_ARN }}
          aws-region: ap-northeast-1

      # ultrathink I1: --delete を削除、古い hashed assets を保持して client 404 防止.
      # 古い assets は S3 Lifecycle (§3.3) で 30day 自動 expire.
      - name: Sync to S3 (add only、never delete on deploy)
        run: |
          aws s3 sync apps/web/dist/ s3://${{ vars.WEB_BUCKET_NAME }}/ \
            --cache-control "public, max-age=31536000, immutable" \
            --exclude "index.html" \
            --exclude "manifest.webmanifest" \
            --exclude "sw.js"
          # index.html / SW は短 cache (deploy 即時反映)
          aws s3 cp apps/web/dist/index.html s3://${{ vars.WEB_BUCKET_NAME }}/index.html \
            --cache-control "public, max-age=0, must-revalidate"
          aws s3 cp apps/web/dist/sw.js s3://${{ vars.WEB_BUCKET_NAME }}/sw.js \
            --cache-control "public, max-age=0, must-revalidate"

      # CloudFront invalidation (index.html + sw.js のみ、他は immutable hash)
      - name: Invalidate CloudFront
        run: |
          aws cloudfront create-invalidation \
            --distribution-id ${{ vars.CLOUDFRONT_DISTRIBUTION_ID }} \
            --paths "/index.html" "/sw.js" "/manifest.webmanifest"
```

### 2.3 OIDC IAM Role (U1 frontend-stack.ts で定義済 or 追加)

GitHub Actions から AWS リソースへ access するために OIDC + IAM Role。U1 で未定義なら infra unit で追加:

```typescript
// infra/lib/stacks/frontend-stack.ts (将来追加)
const oidcProvider = new iam.OpenIdConnectProvider(this, "GitHubOIDC", {
  url: "https://token.actions.githubusercontent.com",
  clientIds: ["sts.amazonaws.com"],
});

const deployRole = new iam.Role(this, "WebDeployRole", {
  assumedBy: new iam.WebIdentityPrincipal(oidcProvider.openIdConnectProviderArn, {
    StringEquals: { "token.actions.githubusercontent.com:aud": "sts.amazonaws.com" },
    // ultrathink I3: `<GITHUB_ORG>/<GITHUB_REPO>` placeholder、実 repo に置換要.
    // 例: "repo:y-morimatsu/yesman:ref:refs/heads/main"
    // PR ブランチからの assume を許可する場合: "repo:<ORG>/<REPO>:pull_request" (慎重に)
    StringLike: { "token.actions.githubusercontent.com:sub": "repo:<GITHUB_ORG>/<GITHUB_REPO>:ref:refs/heads/main" },
  }),
  inlinePolicies: {
    Deploy: new iam.PolicyDocument({
      statements: [
        new iam.PolicyStatement({
          actions: ["s3:PutObject", "s3:DeleteObject", "s3:ListBucket"],
          resources: [webBucket.bucketArn, `${webBucket.bucketArn}/*`],
        }),
        new iam.PolicyStatement({
          actions: ["cloudfront:CreateInvalidation"],
          resources: [`arn:aws:cloudfront::${cdk.Aws.ACCOUNT_ID}:distribution/${distribution.distributionId}`],
        }),
      ],
    }),
  },
});
```

---

## 3. AWS インフラ影響

| 項目 | 影響 |
|---|---|
| **S3 (webBucket)** | U1 frontend-stack で既存、本 unit が deploy する成果物の置き場 |
| **CloudFront** | U1 既存、配信 + cache 制御 |
| **Cognito User Pool** | U3 で構築済、本 unit が hosted UI URL を consumer |
| **IAM (deploy role)** | U1 で追加要 (OIDC + S3/CloudFront 権限)、または手動 deploy |
| Lambda / ECS / API Gateway | ❌ 無し (frontend なので) |

### 3.1 S3 cache-control 戦略

| asset | cache-control | 理由 |
|---|---|---|
| `index.html` | `public, max-age=0, must-revalidate` | deploy 即時反映、SW 更新検知のため |
| `manifest.webmanifest` | `public, max-age=0, must-revalidate` | PWA manifest 即時反映 |
| `sw.js` | `public, max-age=0, must-revalidate` | Service Worker 更新即時反映 |
| `assets/*.[hash].js` | `public, max-age=31536000, immutable` | 1 year cache、hash で版数管理 |
| `assets/*.[hash].css` | `public, max-age=31536000, immutable` | 同上 |
| `icons/*.png` | `public, max-age=31536000, immutable` | アイコンは長期 cache |

### 3.3 S3 Lifecycle rule (ultrathink I1 補強: 古い hashed assets 自動 cleanup)

```typescript
// U1 frontend-stack.ts または本 unit で追加
webBucket.addLifecycleRule({
  id: "expire-old-hashed-assets",
  prefix: "assets/",
  expiration: cdk.Duration.days(30),  // ← 30 day 後に削除、deploy 後 1 month は revert 可能
});
```

**根拠** (ultrathink I1): `--delete` を deploy で実行すると古い client (cached index.html) が古い asset を fetch → 404。Lifecycle 30day なら deploy 後 1 month 内は client が古い asset を取得可能、その後自然 cleanup。

### 3.2 CloudFront 設定 (U1 既存に追加要)

| 項目 | 設定 |
|---|---|
| Default root object | `index.html` |
| Error response: 404 → 200 / index.html | SPA fallback (React Router 対応) |
| Error response: 403 → 200 / index.html | S3 OAC で missing object も 403 を返す (ultrathink I2: OAC は object 存在を expose しない設計、403/404 両方を SPA fallback で扱う) |
| Compress objects automatically | true (Gzip + Brotli) |
| Security headers | **CloudFront Response Headers Policy** (ultrathink Imp1) で HSTS / X-Content-Type-Options / CSP / Referrer-Policy 等を設定 |

### 3.2.1 Response Headers Policy (ultrathink Imp1)

Lambda@Edge より cost 無料 + 設定 simple な **Response Headers Policy** を採用:

```typescript
// frontend-stack.ts に追加
const securityHeaders = new cloudfront.ResponseHeadersPolicy(this, "WebSecurityHeaders", {
  responseHeadersPolicyName: `yesman-${ctx.envName}-web-headers`,
  securityHeadersBehavior: {
    strictTransportSecurity: {
      accessControlMaxAge: cdk.Duration.days(365),
      includeSubdomains: true,
      preload: true,
      override: true,
    },
    contentTypeOptions: { override: true },
    frameOptions: { frameOption: cloudfront.HeadersFrameOption.DENY, override: true },
    referrerPolicy: {
      referrerPolicy: cloudfront.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
      override: true,
    },
    contentSecurityPolicy: {
      contentSecurityPolicy:
        "default-src 'self'; " +
        "script-src 'self'; " +
        "style-src 'self' 'unsafe-inline'; " +
        `connect-src 'self' ${ctx.apiBaseUrl} ${ctx.cognitoEndpoints}; ` +
        "img-src 'self' data: blob: " + ctx.s3MediaUrl + "; " +
        "frame-ancestors 'none';",
      override: true,
    },
  },
});

// distribution に attach
distribution.addBehavior("*", origin, {
  responseHeadersPolicy: securityHeaders,
});
```

**根拠** (ultrathink Imp1): Lambda@Edge は $0.60/1M req + 実行時間料金、Response Headers Policy は **無料 + 静的 headers なら十分**。dynamic logic 必要時のみ Lambda@Edge 検討。

---

## 4. ローカル動作確認

```bash
# 1. install
pnpm install

# 2. workspace deps build
pnpm --filter @yesman/api-client build
pnpm --filter @yesman/ui build

# 3. apps/web local env setup
cd apps/web
cp .env.example .env.local
# .env.local に dev 環境変数を設定:
# VITE_API_BASE_URL=http://localhost:8000
# VITE_COGNITO_HOSTED_UI_URL=https://test.auth.example.com
# (cognito-local 利用時は cognito-local URL を指定)

# 4. dev server
pnpm dev
# → http://localhost:5173 で起動、HMR 動作

# 5. production build + preview
pnpm build
pnpm preview
# → http://localhost:4173 で prod build を確認 (SW 含む)

# 6. test
pnpm test
# → vitest 全 test pass、coverage 75%/65% 達成
```

---

## 5. デプロイ手順 (PR → main merge)

1. PR 作成 → CI で build + test
2. main merge → `deploy-web.yml` 発火
3. AWS OIDC で IAM Role assume
4. S3 sync (immutable assets + index.html short cache)
5. CloudFront invalidation (index.html + sw.js + manifest)
6. 数秒後にエッジで反映、user は次回 access 時に新版取得
7. SW skipWaiting + clientsClaim で **即時 activate** (FD §7)

---

## 6. リスク

| リスク | 影響 | 対応 |
|---|---|---|
| S3 sync で `--delete` flag により古い hashed asset が消えて client 404 | UI 404 | ultrathink I1: `--delete` 削除 + S3 Lifecycle 30day expire で対応 (§3.3) |
| CloudFront invalidation コスト (月 1000 path 無料、それ以上 $0.005/path) | 課金 | invalidation 対象を index.html/sw.js/manifest 3 path のみに絞る |
| OIDC trust policy の sub claim ミス | deploy role assume 失敗 | `repo:owner/yesman:ref:refs/heads/main` を厳密設定、PR からは assume 不可 |
| build env vars 漏れで dev URL が prod build に混入 | 本番事故 | GitHub Actions `vars` (Repository / Environment 別) で env 分離 |
| Service Worker の cache が古いまま、新 SW が activate しない | UI 古いまま | skipWaiting + clientsClaim 設定 (FD Imp3) + 強制 reload プロンプト (将来) |

---

## 7. コスト試算 (月間)

| 項目 | 単価 | 想定量 | 月額 |
|---|---|---|---|
| S3 storage (assets ~5 MB) | $0.025/GB/mo | 0.005 GB | 約 ¥0 |
| S3 GET request | $0.0004/1K req | 100,000 req (CloudFront origin) | 約 ¥6 |
| CloudFront request | $0.0075/10K req | 1,000,000 req | 約 ¥110 |
| CloudFront transfer | $0.114/GB | 5 GB/mo | 約 ¥85 |
| CloudFront invalidation | $0.005/path、最初 1000 path/mo 無料 | 100 path | ¥0 (無料枠内) |
| Cognito MAU | (ultrathink Imp2 補正: **U3 で計上済、本 unit は consumer**) | - | - (合算参考) |
| **合計 (U7a 単体)** | - | - | **約 ¥200/月** |

ECS / Aurora 等の backend に比べ frontend インフラは桁違いに安価。

---

## 8. 受入基準

- [x] pnpm workspace 連携 (api-client + ui workspace 依存解決)
- [x] CI/CD workflow (PR build + main deploy + OIDC IAM)、`--delete` 削除 + Lifecycle (ultrathink I1)
- [x] AWS インフラ影響: S3 + CloudFront (U1 既存) + 追加 IAM Role
- [x] S3 cache-control 戦略 (immutable assets + short cache index.html) + Lifecycle 30day (ultrathink I1)
- [x] CloudFront SPA fallback (404 + 403 → index.html、OAC 仕様根拠 ultrathink I2)
- [x] CloudFront Response Headers Policy で security headers (ultrathink Imp1)
- [x] OIDC sub claim placeholder 明示 (ultrathink I3)
- [x] コスト試算: Cognito は U3 計上済として除外 (ultrathink Imp2)
- [x] ローカル動作確認 6 step
- [x] リスク 5 件 + 対応案
- [x] ultrathink 全 5 件適用 (Important 3 + Improvements 2)

## 9. ultrathink 適用ログ (2026-05-16)

### Important 3
- **I1** (§2.2 + §3.3 + §6): S3 `--delete` 削除 + Lifecycle 30day で古い hashed assets 自動 cleanup、client 404 防止
- **I2** (§3.2): 403/404 両方を SPA fallback、S3 OAC が object 存在を expose しない仕様根拠を明示
- **I3** (§2.3): OIDC sub claim `<GITHUB_ORG>/<GITHUB_REPO>` placeholder を明示

### Improvements 2
- **Imp1** (§3.2.1): CloudFront Response Headers Policy で HSTS / CSP / X-Content-Type-Options 等、Lambda@Edge より cost 無料 + 設定 simple
- **Imp2** (§7): Cognito MAU を U3 計上済として除外、合算参考に変更
