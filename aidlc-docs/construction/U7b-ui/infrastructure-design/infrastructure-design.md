# U7b / ui — Infrastructure Design

**Unit**: U7b — `packages/ui`
**Phase**: CONSTRUCTION — Infrastructure Design
**Created**: 2026-05-16
**Status**: ✅ APPROVED 2026-05-16 (ultrathink full / 5 fixes applied: Important 3 + Improvements 2)
**Upstream**: FD 7 + NFR Req 5 + NFR Design 5 + Infra Design 5 = 累計 22 fixes

---

## 0. 位置付け

U7b は U7c と同じく **pure TypeScript / React library**。AWS インフラ消費ゼロ。本ドキュメントは **monorepo workspace 設定 + Storybook 配信 + CI/CD パイプライン** を中心にマップ。

---

## 1. Monorepo 連携

`pnpm-workspace.yaml` (U7c で作成済) で `packages/*` 配下、`@yesman/ui` として認識される。consumer (`apps/web`) で `pnpm add @yesman/ui` (workspace 解決) で参照。

---

## 2. CI/CD パイプライン

### 2.1 PR 検証 workflow (U7c と統合、ultrathink I1: 単一 job 採用)

**単一 job (採用)**: 全 step が sequential、`@yesman/api-client` → `@yesman/ui` の依存順序が自然に解決。

**parallel split** にする場合 (将来、CI 時間短縮目的) は GitHub Actions `needs:` で依存明示:
```yaml
jobs:
  api-client:
    runs-on: ubuntu-latest
    steps: [...build+test+size for api-client]
  ui:
    needs: api-client    # ← ultrathink I1: workspace 依存解決済を保証
    runs-on: ubuntu-latest
    steps: [...build+test+size for ui]
```

MVP は単一 job (sequential)、parallel は CI 時間 > 5min 超過時に検討。

```yaml
# .github/workflows/pr-frontend.yml (U7c で定義したものに拡張)
jobs:
  frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - uses: actions/cache@v4
        with:
          path: |
            ~/.cache/pnpm
            ~/.cache/pip
          key: deps-${{ runner.os }}-${{ hashFiles('apps/api/pyproject.toml', 'pnpm-lock.yaml') }}

      - run: pnpm install --frozen-lockfile

      # api-client (U7c)
      - run: pnpm --filter @yesman/api-client build
      - run: pnpm --filter @yesman/api-client test
      - run: pnpm --filter @yesman/api-client size

      # ★ ui (U7b 本 unit)
      - run: pnpm --filter @yesman/ui build
      - run: pnpm --filter @yesman/ui lint
      - run: pnpm --filter @yesman/ui test
      - run: pnpm --filter @yesman/ui size

      # Storybook build (snapshot 用途、deploy は別 workflow)
      - run: pnpm --filter @yesman/ui build-storybook
      - name: Upload Storybook artifact
        uses: actions/upload-artifact@v4
        with:
          name: storybook-static
          path: packages/ui/storybook-static
```

### 2.2 Storybook 配信 (PR preview、ultrathink Imp1: Chromatic 検討)

#### Option A: GitHub Actions artifact (MVP default)

```yaml
# 上記 §2.1 で artifact upload 済、reviewer は Actions UI で download → 開く
```

#### Option B: Chromatic 統合 (ultrathink Imp1、MVP でも導入可能)

Chromatic は Storybook 公式の hosted snapshot/preview service。**無料枠 5,000 snapshots/月** で MVP 規模なら十分。

```yaml
# .github/workflows/chromatic.yml (Option B、Chromatic 導入時)
name: Chromatic
on: [pull_request]
jobs:
  chromatic:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - run: pnpm install --frozen-lockfile
      - uses: chromaui/action@v11
        with:
          projectToken: ${{ secrets.CHROMATIC_PROJECT_TOKEN }}
          workingDir: packages/ui
          buildScriptName: build-storybook
```

**メリット**: PR ごとに hosted URL、visual diff 自動検知、reviewer がブラウザで即確認可能。
**MVP 判断**: 初期は Option A (artifact)、design iteration が増えたら Option B (Chromatic) に切替検討。

### 2.3 PR-mergeable 条件 (U7b)

- ✅ `pnpm --filter @yesman/ui build` 通過
- ✅ `pnpm --filter @yesman/ui test` 全 pass (coverage thresholds 達成)
- ✅ `pnpm --filter @yesman/ui lint` 通過
- ✅ `pnpm --filter @yesman/ui size` (gzip < 7 KB)
- ✅ Storybook build 成功

---

## 3. AWS インフラ影響

| 項目 | 影響 |
|---|---|
| Lambda / ECS | ❌ 無し |
| S3 / CloudFront | ❌ 無し (Storybook preview を導入する場合のみ将来検討) |
| IAM / Secrets Manager | ❌ 無し |

**Storybook preview deploy** (将来) は S3 + CloudFront で配信可能だが、MVP では skip (PR artifact upload で代替)。

---

## 4. consumer (apps/web) からの利用パターン

### 4.1 install + Tailwind 設定

```bash
# apps/web/package.json (U7a で作成、本 unit は参照のみ)
{
  "dependencies": {
    "@yesman/ui": "workspace:*",
    "@yesman/api-client": "workspace:*",
    "react": "^18.0.0",
    "react-dom": "^18.0.0"
  },
  "devDependencies": {
    "tailwindcss": "^4.0.0"
  }
}
```

#### Tailwind v4 (ultrathink I3: MVP 採用、2025 Q1 stable で 2026 時点で生態系成熟)

```typescript
// apps/web/postcss.config.mjs (Tailwind v4 PostCSS plugin)
export default {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};
```

```css
/* apps/web/src/main.css (CSS-first config) */
@import "tailwindcss";

/* @source で ui package の class を scan */
@source "../../packages/ui/src/**/*.{ts,tsx}";

/* @yesman/ui の TS preset を import (v4 では @plugin 経由でも可) */
@plugin "@yesman/ui/tailwind-preset";
```

#### Tailwind v3 (ultrathink I2 補正: v3 fallback、TS-config 書き方)

```typescript
// apps/web/tailwind.config.ts (v3 fallback)
import preset from "@yesman/ui/tailwind-preset";

export default {
  presets: [preset],
  content: [
    "./src/**/*.{ts,tsx}",
    "../../packages/ui/src/**/*.{ts,tsx}",  // ui の class も scan
  ],
};
```

#### v3 vs v4 比較 (ultrathink I2 + I3)

| 観点 | v3 | v4 (MVP 採用) |
|---|---|---|
| Config 方式 | TypeScript (`tailwind.config.ts`) | CSS-first (`@import "tailwindcss"; @source "..."`) |
| Content scan | `content: [...]` | `@source` directive |
| Preset 適用 | `presets: [preset]` | `@plugin "path"` or JS plugin |
| Build 速度 | 標準 | 約 5x 高速 (Lightning CSS) |
| ecosystem 成熟 | very high | high (16ヶ月 stable) |

```typescript
// apps/web/src/main.tsx
import "@yesman/ui/styles.css";  // Tailwind base + ui tokens
import { ToastProvider, Button } from "@yesman/ui";

function App() {
  return (
    <ToastProvider>
      <Button variant="primary">Click</Button>
    </ToastProvider>
  );
}
```

### 4.2 component import パターン

```typescript
// named imports for tree-shake
import { Button, Card, PersonaCard, useToast } from "@yesman/ui";

// type-only imports
import type { ButtonProps, PersonaCardProps } from "@yesman/ui";
```

---

## 5. ローカル動作確認

```bash
# 1. install
pnpm install

# 2. build + test
pnpm --filter @yesman/ui build
pnpm --filter @yesman/ui test
pnpm --filter @yesman/ui size
# → dist/index.js gzip < 7 KB

# 3. Storybook 起動 (開発時)
pnpm --filter @yesman/ui storybook
# → localhost:6006 で全 component カタログ表示

# 4. consumer test (U7a 完成後)
pnpm --filter @yesman/web dev
# → Vite dev server で UI library import + render 確認
```

---

## 6. デプロイ + Version 管理 (ultrathink Imp2: changesets 将来導入)

### 6.1 単体デプロイなし

U7b 単体ではデプロイなし (library)。consumer (apps/web、U7a で完成) のデプロイで bundle される。

### 6.2 Internal version 管理 (将来導入候補)

**changesets** (`@changesets/cli`) で monorepo internal package の semver 管理 + CHANGELOG 自動生成:

```bash
# 将来 setup 手順 (MVP では skip)
pnpm add -Dw @changesets/cli @changesets/changelog-github
pnpm changeset init
# 各 PR で `pnpm changeset` 実行 → bump 種別 (patch/minor/major) + summary 記録
# release PR で全 changeset を集約 → version bump + CHANGELOG.md 更新
```

**MVP 判断**:
- monorepo internal で apps/web 1 consumer のみ → workspace:* で十分
- changesets は将来 (a) packages 数増加、(b) npm publish 開始、(c) 複数 consumer 対応 のいずれかで導入検討

### 6.3 npm publish (将来)

```bash
cd packages/ui
pnpm publish --access public
```
(MVP では monorepo internal、publish なし)

---

## 7. リスク

| リスク | 影響 | 対応 |
|---|---|---|
| Tailwind v4 minor 変更 (2026 時点 v4.x stable、ultrathink I3) | preset 動作微変更 | v4 stable lock、v3 fallback path は §4 で明示済 (CSS-first vs TS-config 比較表) |
| React 19 release で peer ^18.0.0 が満たされない | install 失敗 | peer を `^18.0.0 \|\| ^19.0.0` に拡張 (release 後に対応) |
| Storybook build OOM (Node memory) | CI fail | `NODE_OPTIONS=--max-old-space-size=4096` 設定で 4GB 確保 |
| jsdom が `crypto.subtle` を完全実装していない | test fail (Toast counter ベースに変更で回避済) | ultrathink NFR Design I2 で counter 採用、依存解消 |
| consumer 側で `@yesman/ui/styles.css` import 漏れ | Tailwind が ui の class を生成しない | tailwind.config.ts の `content` に `../../packages/ui/src/**/*.{ts,tsx}` を含める明示 |

---

## 8. 受入基準

- [x] monorepo workspace 連携 (U7c と同じ pnpm workspace 基盤)
- [x] CI workflow 設計 (build + lint + test + size + storybook build) + parallel split 時の needs: 注記 (ultrathink I1)
- [x] AWS インフラ影響ゼロ (library のみ)
- [x] consumer (apps/web) 利用パターン明示 + Tailwind v3 / v4 両対応 (ultrathink I2 + I3)
- [x] Storybook PR preview: artifact (default) + Chromatic option (ultrathink Imp1)
- [x] Version 管理: changesets 将来導入候補 (ultrathink Imp2)
- [x] ローカル動作確認 4 step
- [x] リスク 5 件 + 対応案
- [x] ultrathink 全 5 件適用 (Important 3 + Improvements 2)

## 9. ultrathink 適用ログ (2026-05-16)

### Important 3
- **I1** (§2.1): CI 単一 job 採用 + parallel split 時の `needs: api-client` 注記
- **I2** (§4.1): Tailwind v3 (`tailwind.config.ts`) vs v4 (`@import` + `@source`) 比較表追加
- **I3** (§4.1 + §7): Tailwind v4 stable 採用 (2026 時点 16ヶ月成熟)、v3 fallback path 明示

### Improvements 2
- **Imp1** (§2.2): Chromatic 統合 option (無料枠 5K snapshots/月)、MVP は artifact 維持
- **Imp2** (§6.2): changesets 将来導入候補、internal package version + CHANGELOG 自動生成

---

## Post-CONSTRUCTION 改修注記 (2026-05-19)

本ドキュメント本体は 2026-05-16 承認時の Snapshot (ultrathink full 5 fixes 適用済) を保持。

**Important 3 / Improvements 2 の合計 5 件の Infra Design 修正点は全て継続有効**。`packages/ui` の `package.json` exports、tsconfig、vitest config、eslintrc、`.storybook` 設定、size-limit budget 等の Design は不変。

→ U7b Infrastructure Design は CONSTRUCTION 完了状態のまま継続有効。Post-CONSTRUCTION 期間中、build config / package exports の変更なし。
