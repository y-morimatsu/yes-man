# U7d / features — Infrastructure Design

**Unit**: U7d — `apps/web/src/features/`
**Phase**: CONSTRUCTION — Infrastructure Design
**Created**: 2026-05-16
**Status**: ✅ APPROVED 2026-05-16 (ultrathink full / 5 fixes applied: Important 3 + Improvements 2)
**Upstream**: FD 7 + NFR Req 7 + NFR Design 5 + Infra Design 5 = 累計 24 fixes

---

## 0. 位置付け

U7d は U7a apps/web の **拡張 (features + QueryProvider + manualChunks)** であり、独自 AWS インフラを持たない。本ドキュメントは **monorepo / CI 統合 + bundle 検証戦略 + 既存 edge-stack との連携** を中心にマップ。

---

## 1. Monorepo 連携

`pnpm-workspace.yaml` 配下、`@yesman/web` package に統合 (新 package を追加せず、apps/web を拡張)。dependency 追加:
- `@tanstack/react-query` (dep)
- `@tanstack/react-query-devtools` (devDep)

---

## 2. CI/CD パイプライン

### 2.1 PR build (U7a CI workflow に追加 step、ultrathink I1: size-limit 統一)

U7a `.github/workflows/pr-frontend.yml` を拡張 (新規 file 不要)。bundle 検証は **`size-limit`** (U7c/U7b と同パターン) で宣言的:

```jsonc
// apps/web/package.json (size-limit 設定追加)
{
  "size-limit": [
    {
      "name": "main bundle",
      "path": "dist/assets/index-*.js",
      "limit": "250 KB"
    },
    {
      "name": "tanstack-query shared chunk",
      "path": "dist/assets/tanstack-query-*.js",
      "limit": "20 KB"
    },
    {
      "name": "react-vendor shared chunk",
      "path": "dist/assets/react-vendor-*.js",
      "limit": "60 KB"
    }
  ],
  "scripts": {
    "size": "size-limit"
  }
}
```

```yaml
# CI workflow: size-limit を実行 (U7c/U7b と同手順)
- run: pnpm --filter @yesman/web build
- run: pnpm --filter @yesman/web run size
  # size-limit が path-pattern 不在 → fail で manualChunks 不備検知
```

**根拠** (ultrathink I1): U7c/U7b で既に size-limit を採用、U7a/U7d も統一で **monorepo 全体で同 tool**。bash glob + magic number の脆さを回避、`size-limit` package が宣言的に管理。

### 2.2 deploy workflow (U7a 既存 deploy-web.yml に変更なし)

U7a で確立した S3 sync + CloudFront invalidation pipeline をそのまま使用。U7d の features 追加で deploy 手順変更なし。

### 2.3 bundle visualization (CI artifact、option、ultrathink I2: rollup-plugin-visualizer)

`rollup-plugin-visualizer` を devDep に追加、Vite plugin で build 時 stats.html 自動生成:

```typescript
// vite.config.ts plugins に追加
import { visualizer } from "rollup-plugin-visualizer";

plugins: [
  react(),
  VitePWA({...}),
  visualizer({
    filename: "dist/stats.html",
    open: false,
    gzipSize: true,
    brotliSize: true,
  }),
],
```

```yaml
# CI
- name: Upload bundle visualization
  uses: actions/upload-artifact@v4
  with:
    name: bundle-stats
    path: apps/web/dist/stats.html
```

```jsonc
// apps/web/package.json devDependencies
"rollup-plugin-visualizer": "^5.0.0"
```

PR reviewer が bundle 内容を視覚的に確認可能、optimization opportunity 発見に有効。

---

## 3. AWS インフラ影響

| 項目 | 影響 |
|---|---|
| S3 / CloudFront | ❌ 無し (U7a 既存 staticBucket + distribution を再利用) |
| Lambda / ECS / IAM | ❌ 無し |
| Cognito | ❌ 無し |
| backend API (U2-U6 + U-Persona) | ✅ 既存 endpoint を consumer (新規 endpoint なし) |

**結論**: U7d は **AWS インフラ変更ゼロ**、apps/web の deliverables (新 features chunks) が既存 S3 / CloudFront 経由で配信される。

---

## 4. consumer 利用パターン (もし他 app から再利用するなら)

U7d は apps/web 内部実装で external 公開しない。features は **apps/web 専用**、他 app から import 不可。

将来 mobile app (apps/mobile) で同 features を使う場合は、`packages/features/` に再配置する refactor が必要。MVP では apps/web 単体想定。

---

## 5. ローカル動作確認

```bash
# 1. install (U7c + U7b + U7a + U7d の workspace dep 解決)
pnpm install

# 2. workspace deps build
pnpm --filter @yesman/api-client build
pnpm --filter @yesman/ui build

# 3. apps/web dev server
cd apps/web
cp .env.example .env.local
# .env.local に dev env を設定
pnpm dev
# → http://localhost:5173 で起動
# - /decision で SSE 動作確認
# - /personas で list/create/selection 動作確認
# - /score で threshold UI 確認
# - React Query DevTools が画面右下に表示

# 4. production build + bundle 確認 (ultrathink Imp2: du -sh で全体サイズ)
pnpm build
du -sh dist/                  # bundle 全体サイズ
du -sh dist/assets/           # JS/CSS chunks 合計
ls -lh dist/assets/           # 個別 chunk size
pnpm run size                 # size-limit (ultrathink I1) で gzip サイズ閾値 check
# 期待出力:
# - index-*.js (main chunk) < 250 KB gzip
# - tanstack-query-*.js (shared) ~ 12 KB gzip
# - react-vendor-*.js (shared) ~ 55 KB gzip
# - 各 feature chunk (DecisionPage / PersonaListPage 等) ~ 5-15 KB gzip
open dist/stats.html          # bundle 内訳の視覚化 (rollup-plugin-visualizer)

# 5. preview prod build
pnpm preview
# → http://localhost:4173 で動作確認、DevTools 不在を確認

# 6. test + coverage
pnpm test
# → vitest 全 pass、coverage 70%/60% 達成
```

---

## 6. デプロイ手順

U7a 既存 deploy-web.yml の main branch trigger を再利用。U7d 追加機能を含む全 features が build → S3 upload → CloudFront invalidate される。

---

## 7. リスク

| リスク | 影響 | 対応 |
|---|---|---|
| React Query v5 breaking change (v6 release 等) | API 変更で test 大規模 fail | lock `^5.0.0` で v6 上昇を防止、移行は別 PR |
| Vite manualChunks の chunk hash 変化で CloudFront cache miss | deploy 後一時的 cache miss | hash-based filename で自然解消、最初の数 req のみ origin fetch |
| SSE 接続が CloudFront edge で 60s timeout | 長合議で切断 | U1 edge-stack で readTimeout: 60s 既設、合議 < 5s で問題なし |
| Service Worker が古い chunks 取得 (deploy 直後) | UI 不整合 | ultrathink I3: SW + Lifecycle の協調動作 (§7.1 詳細) |
| React Query cache が localStorage 等で persist されてない | reload で全 refetch | MVP では in-memory のみで OK、`@tanstack/react-query-persist-client` は Phase 2 検討 |

---

### 7.1 SW + Lifecycle 協調動作 (ultrathink I3)

deploy 直後の chunk 取得シナリオ (4 step):

```
deploy 後 (T+0s):
1. 新 SW が auto-update で fetch + activate (skipWaiting + clientsClaim)
2. 新 SW は新 precache manifest (新 hashed assets list) を保持
3. 既存 tab の old JS は **そのまま動作**、lazy import で old chunk を fetch しようとする
4. 新 SW: precache に old chunk なし → fetch from S3
5. S3: 30day Lifecycle で old chunk 保持中 → 200 OK 返却
6. user は tab reload まで old version で動作、reload 後 new version
```

**鍵**: U7a Infra Design I1 (S3 Lifecycle 30day) が **in-flight tab の old chunk fetch** を救済。Lifecycle なし + `--delete` だと old chunk 即削除 → user 画面が壊れる。

両者の組み合わせで in-flight session を壊さず deploy 可能。

---

## 8. コスト試算

U7d は AWS インフラ追加なし、U7a コスト ~¥200/月 に含まれる。追加コストゼロ。

---

## 9. 受入基準

- [x] monorepo (apps/web 拡張、新 package 追加なし)
- [x] CI workflow に size-limit 統一 (ultrathink I1)
- [x] rollup-plugin-visualizer で bundle 視覚化 (ultrathink I2)
- [x] SW + Lifecycle 4 step 協調動作明示 (ultrathink I3)
- [x] AWS インフラ影響ゼロ
- [x] consumer は apps/web 専用 (将来 packages/features/ refactor path 明示)
- [x] ローカル動作確認 6 step + `du -sh` 全体サイズ (ultrathink Imp2)
- [x] リスク 5 件 + 対応案
- [x] コスト試算: 追加 ¥0 (U7a 既存に統合)
- [x] ultrathink 全 5 件適用 (Important 3 + Improvements 2)

## 10. ultrathink 適用ログ (2026-05-16)

### Important 3
- **I1** (§2.1): bundle size check を `size-limit` に統一 (U7c/U7b と同 pattern)、宣言的、magic number 排除
- **I2** (§2.3): `rollup-plugin-visualizer` を devDep + Vite plugin で stats.html 自動生成
- **I3** (§7.1): SW + S3 Lifecycle 30day の 4 step 協調動作明示、in-flight tab の old chunk 救済根拠

### Improvements 2
- **Imp1** (§2.1): magic number `256000` を size-limit の宣言的 `"250 KB"` に置換
- **Imp2** (§5): ローカル動作確認に `du -sh` で bundle 全体サイズ確認 + stats.html 視覚化

---

## Post-CONSTRUCTION 改修注記 (2026-05-19)

本ドキュメント本体は 2026-05-16 承認時の Snapshot (ultrathink full 5 fixes 適用済) を保持。

**Important 3 / Improvements 2 の合計 5 件の Infra Design 修正点は全て継続有効**。`apps/web` の Vite config (manualChunks + visualizer)、`@tanstack/react-query` 依存、`vitest.config.ts`、size-limit preset 等の Design は不変。

### 軽微な追加
- **`apps/web/src/features/voice/`** 配下に新規 hook 2 種 (`useVoiceBackend.ts` + `useWebSpeechRecognition.ts`、`775f6a5`)
- **`apps/web/src/features/score/`** 配下に新規 component 2 種 (`ScoreRadialChart.tsx` + `ScoreLineChart.tsx`、`2400f45`)
- **`apps/web/src/features/decision/`** 配下に新規 hook 1 種 (`usePrefetchedDecisions.ts`、`2b08a75`)

これらは既存の `features/{voice,score,decision}/` ディレクトリ pattern に従って追加されており、build config / package.json 依存等への影響なし。

→ U7d Infrastructure Design は CONSTRUCTION 完了状態のまま、6 新規ファイルが既存 directory pattern 内で追加。
