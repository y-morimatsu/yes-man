# U7c / api-client — Infrastructure Design

**Unit**: U7c — `packages/api-client`
**Phase**: CONSTRUCTION — Infrastructure Design
**Created**: 2026-05-16
**Status**: ✅ APPROVED 2026-05-16 (ultrathink full / 5 fixes applied: Important 3 + Improvements 2)
**Upstream**: FD 7 + NFR Req 5 + NFR Design 5 + Infra Design 5 = 累計 22 fixes

---

## 0. 位置付け

U7c は **pure TypeScript library** で AWS インフラを直接消費しない (= consumer の `apps/web` が CDK で deploy)。本ドキュメントは **monorepo / pnpm workspace 設定 + CI/CD パイプライン + 依存管理** をマップする。

---

## 1. Monorepo 構造

### 1.1 ルート pnpm-workspace.yaml (新規作成)

```yaml
packages:
  - "apps/*"      # web (U7a/d), api (既存)
  - "packages/*"  # api-client (U7c), ui (U7b)
```

### 1.2 ルート package.json

```jsonc
{
  "name": "yesman-monorepo",
  "private": true,
  "scripts": {
    "build": "pnpm -r build",
    "test": "pnpm -r test",
    "lint": "pnpm -r lint",
    "openapi:dump": "cd apps/api && python scripts/dump_openapi.py",
    "openapi:generate": "pnpm --filter @yesman/api-client run generate"
  },
  "devDependencies": {
    "pnpm": "^9.0.0",
    "typescript": "^5.4.0"
  }
}
```

### 1.3 ディレクトリ構成 (本 unit が触る範囲)

```
yesman-monorepo/
├── pnpm-workspace.yaml         # 新規 (本 unit で作成)
├── package.json                # root
├── apps/
│   ├── api/                    # 既存
│   │   ├── openapi.json        # ★ dump_openapi.py 出力 (本 unit で commit)
│   │   └── scripts/dump_openapi.py  # ★ 本 unit で作成
│   └── web/                    # U7a で作成、本 unit からは参照のみ
└── packages/
    ├── api-client/             # ★ 本 unit の主成果物
    │   ├── package.json
    │   ├── tsconfig.json
    │   ├── vitest.config.ts
    │   ├── src/...
    │   └── tests/...
    └── ui/                     # U7b で作成
```

---

## 2. apps/api/scripts/dump_openapi.py 詳細

```python
"""FastAPI OpenAPI schema を apps/api/openapi.json に dump.

U7c Infrastructure Design §2 + ultrathink C1 (server 起動不要) + I1 (validate_runtime skip).
CI / dev / pre-commit hook で呼び、git diff で API spec 変更を可視化.
"""
from __future__ import annotations

import json
import os
from pathlib import Path


# ultrathink I1: import 前に全 backend を mock に固定、validate_runtime を pass させる.
# dump 用途では route 列挙のみ必要、backend の real connection は不要.
os.environ.setdefault("APP_ENV", "dev")
os.environ.setdefault("AUTH_BACKEND", "mock")
os.environ.setdefault("LLM_PROVIDER", "mock")
os.environ.setdefault("VOICE_BACKEND", "mock")
os.environ.setdefault("STORAGE_BACKEND", "mock")
os.environ.setdefault("EVENT_BACKEND", "sync")
os.environ.setdefault("LEARNING_CONSUMER_ENABLED", "false")

from yesman_api.main import app  # noqa: E402 (env setup 後の import)


OUT = Path(__file__).parent.parent / "openapi.json"


def main() -> None:
    schema = app.openapi()
    OUT.write_text(
        json.dumps(schema, ensure_ascii=False, indent=2, sort_keys=True),
        encoding="utf-8",
    )
    print(f"wrote {OUT} ({OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
```

**`sort_keys=True`**: 順序差分を排除、git diff を意味のある変更のみに絞る。
**`os.environ.setdefault` (ultrathink I1)**: 全 backend を mock 固定で `validate_runtime` を pass、dev 環境差異を吸収。real prod-like env でも override されない (setdefault のため既存値優先)。

---

## 3. packages/api-client/ ファイル一覧 (新規作成)

| ファイル | 用途 | LOC 目安 |
|---|---|---|
| `package.json` | npm metadata + scripts | ~25 |
| `tsconfig.json` | strict + verbatimModuleSyntax | ~15 |
| `vitest.config.ts` | vitest 設定 | ~10 |
| `.eslintrc.cjs` | consistent-type-imports | ~10 |
| `.gitignore` | dist/ + node_modules/ | ~5 |
| `src/index.ts` | public exports | ~20 |
| `src/client.ts` | YesmanApiClient + request + validateBaseUrl | ~100 |
| `src/auth.ts` | TokenProvider interface | ~15 |
| `src/errors.ts` | ApiError + reasons | ~80 |
| `src/sse.ts` | DecisionStream + parseSseChunk | ~80 |
| `src/generated/schema.ts` | openapi-typescript 出力 (auto-gen) | (auto) |
| `src/modules/index.ts` | 7 module re-export | ~10 |
| `src/modules/profiles.ts` | profile endpoints | ~30 |
| `src/modules/decisions.ts` | decision + SSE | ~50 |
| `src/modules/scores.ts` | score | ~20 |
| `src/modules/preferences.ts` | preference | ~25 |
| `src/modules/personas.ts` | persona CRUD + share + report | ~70 |
| `src/modules/persona-selections.ts` | selection get/put/delete | ~25 |
| `src/modules/voice.ts` | TTS + STT + config | ~40 |
| `tests/*` | 5+ files (Unit + msw) | ~300 total |

合計約 25 ファイル、~750 LOC (生成 schema 除く)。

### 3.1 LOC → Bundle size 換算 (ultrathink Imp1)

| カテゴリ | TS LOC | minified JS | gzip |
|---|---|---|---|
| client.ts | ~100 | ~2 KB | ~0.8 KB |
| sse.ts | ~80 | ~1.5 KB | ~0.6 KB |
| errors.ts | ~80 | ~1.2 KB | ~0.5 KB |
| auth.ts (interface erased) | ~15 | ~0.1 KB | ~0.05 KB |
| index.ts + modules/index.ts | ~30 | ~0.5 KB | ~0.2 KB |
| modules/* (7 files) | ~260 | ~6 KB | ~2 KB |
| **runtime 合計** | ~565 | **~11.5 KB** | **~4.2 KB** |
| tests/* | ~300 | (bundle 対象外) | - |
| generated/schema.ts | (auto) | (type-only erased) | 0 |

**結論**: NFR Req PERF-U7c-01 (< 10 KB gzip) 達成見込み (~4.2 KB)、CI で `size-limit` (ultrathink Imp2) で自動 enforce.

### 3.2 size-limit 設定 (ultrathink Imp2)

```jsonc
// packages/api-client/package.json 抜粋
{
  "size-limit": [
    {
      "name": "main bundle",
      "path": "dist/index.js",
      "limit": "5 KB"  // gzip 後、4.2 KB 試算 + 安全マージン 0.8 KB
    }
  ],
  "scripts": {
    "size": "size-limit"
  },
  "devDependencies": {
    "size-limit": "^11.0.0",
    "@size-limit/preset-small-lib": "^11.0.0"
  }
}
```

CI 失敗条件: `dist/index.js` の gzip サイズが 5 KB 超過。

---

## 4. CI/CD パイプライン

### 4.1 PR 検証 workflow (ultrathink I2 + Imp2 反映)

```yaml
# .github/workflows/pr-frontend.yml (将来 / 想定)
name: PR frontend
on: [pull_request]
jobs:
  api-client:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - uses: actions/setup-python@v5
        with: { python-version: "3.12" }

      # ★ ultrathink I2: pip + pnpm cache でビルド時間短縮 (cryptography native build 等で初回 ~5min → 2回目以降 ~30s)
      - uses: actions/cache@v4
        with:
          path: |
            ~/.cache/pip
            ~/.cache/pnpm
          key: deps-${{ runner.os }}-${{ hashFiles('apps/api/pyproject.toml', 'pnpm-lock.yaml') }}
          restore-keys: |
            deps-${{ runner.os }}-

      - run: pip install -e apps/api[dev]
      - run: pnpm install --frozen-lockfile

      # ★ Step 1: OpenAPI dump
      - run: pnpm run openapi:dump

      # ★ Step 2: api-client generate
      - run: pnpm run openapi:generate

      # ★ Step 3: drift 検知
      - name: Check OpenAPI drift
        run: |
          git diff --exit-code apps/api/openapi.json packages/api-client/src/generated/schema.ts \
            || (echo "::error::OpenAPI/api-client drift detected. Run 'pnpm run openapi:dump && pnpm run openapi:generate' locally."; exit 1)

      # ★ Step 4: build + lint + test
      - run: pnpm --filter @yesman/api-client build
      - run: pnpm --filter @yesman/api-client lint
      - run: pnpm --filter @yesman/api-client test

      # ★ Step 5: ultrathink Imp2 — bundle size 自動検証 (size-limit)
      - run: pnpm --filter @yesman/api-client run size
```

### 4.2 pre-commit hook (任意、husky 想定)

```bash
# .husky/pre-commit (将来)
#!/bin/sh
# OpenAPI 変更時に自動 dump + generate
if git diff --cached --name-only | grep -q "^apps/api/src/"; then
  pnpm run openapi:dump
  pnpm run openapi:generate
  git add apps/api/openapi.json packages/api-client/src/generated/schema.ts
fi
```

---

## 5. AWS インフラ影響

| 項目 | 影響 |
|---|---|
| Lambda / ECS / S3 / CloudFront | ❌ 無し (U7c は library) |
| IAM / Secrets Manager | ❌ 無し |
| API Gateway / ALB | ❌ 無し (consumer のみ依存) |
| CloudWatch Logs | ❌ 無し |

U7c は **完全に静的 TypeScript パッケージ**。AWS インフラ変更ゼロ。

---

## 6. consumer 側 (apps/web) からの利用パターン (将来参照用)

### 6.1 ultrathink I3 注: api-client は bundler agnostic

api-client 自体は `import.meta.env` / `process.env` 等の bundler 固有 API に依存しない。
consumer 側 (U7a) が **自分の bundler に応じた env var 取得方法** を使う。

| bundler | env var アクセス |
|---|---|
| **Vite** (U7a MVP 採用) | `import.meta.env.VITE_*` |
| Next.js | `process.env.NEXT_PUBLIC_*` |
| Webpack (CRA) | `process.env.REACT_APP_*` |
| esbuild | `process.env.*` + define plugin |

### 6.2 Vite 採用版の利用例 (U7a 想定)

```typescript
// apps/web/src/lib/api.ts (U7a で実装、本 unit は参照のみ)
import { YesmanApiClient } from "@yesman/api-client";
import { CognitoTokenProvider } from "./auth";

export const api = new YesmanApiClient({
  baseUrl: import.meta.env.VITE_API_BASE_URL,  // ← Vite 固有、bundler により書き換え
  tokenProvider: new CognitoTokenProvider(),
  defaultHeaders: {
    "X-Client-Version": import.meta.env.VITE_APP_VERSION,
  },
  onError: (err) => {
    if (err.is("unauthorized")) {
      // redirect to login
    }
  },
});

// usage
const personas = await api.personas.listMy();
const stream = api.decisions.streamRequest({ user_input: "ランチ" });
for await (const event of stream.events()) {
  console.log(event);
}
```

---

## 7. ローカル動作確認 (Mock backend)

```bash
# 1. monorepo install
pnpm install

# 2. OpenAPI dump
pnpm run openapi:dump
# → apps/api/openapi.json 更新

# 3. api-client generate + build + test
pnpm --filter @yesman/api-client run generate
pnpm --filter @yesman/api-client build
pnpm --filter @yesman/api-client test
# → All tests pass (msw v2 で fetch interceptor)

# 4. bundle size 確認
ls -lh packages/api-client/dist/index.js
gzip -c packages/api-client/dist/index.js | wc -c
# → runtime JS < 10 KB gzip (NFR Req PERF-U7c-01)
```

---

## 8. リスク

| リスク | 影響 | 対応 |
|---|---|---|
| openapi-typescript v7 のメジャー変更 | 型生成出力フォーマット変化 | lock file 固定 + CI snapshot test |
| pnpm workspace で symlink 解決失敗 | apps/web から `@yesman/api-client` import 不可 | install 前に `pnpm-workspace.yaml` 存在確認、`pnpm install --shamefully-hoist` で fallback |
| Cognito ID Token 1h 切れ + refresh 失敗の loop | 401 → refresh → 401 で無限ループ | `retryOn401: false` の 2 回目で escape、UI に再ログイン誘導 |
| FastAPI OpenAPI 出力で circular reference | openapi-typescript 失敗 | Pydantic v2 で circular reference 警告、API 側で `ConfigDict(arbitrary_types_allowed=False)` で防止 |
| Node 18 と 20 の互換性 (Web Streams) | reader API 動作差 | engines.node ≥ 20 を package.json で指定 |

---

## 9. 受入基準

- [x] monorepo (pnpm workspace) 設定確定
- [x] dump_openapi.py 実装方針確定 + os.environ.setdefault で validate_runtime skip (ultrathink I1)
- [x] CI/CD workflow 設計 (drift 検知 + build + lint + test) + actions/cache@v4 で pip/pnpm キャッシュ (ultrathink I2)
- [x] AWS インフラ影響ゼロ (library のみ)
- [x] consumer 利用パターン明示 (U7a/d 参照用) + bundler agnostic 注記 + bundler 別 env var 表 (ultrathink I3)
- [x] LOC → bundle size 換算表 (~565 LOC → ~11.5 KB minified → ~4.2 KB gzip) (ultrathink Imp1)
- [x] size-limit 自動 enforce 設定 + CI step (ultrathink Imp2)
- [x] リスク 5 件 + 対応案
- [x] ultrathink 全 5 件適用 (Important 3 + Improvements 2)

## 10. ultrathink 適用ログ (2026-05-16)

### Important 3
- **I1** (§2): dump_openapi.py 冒頭で `os.environ.setdefault` を 7 件、全 backend を mock 固定、validate_runtime を pass
- **I2** (§4.1): GitHub Actions `actions/cache@v4` で pip + pnpm キャッシュ、cryptography native build 短縮 (~5min → ~30s)
- **I3** (§6.1): api-client は bundler agnostic、consumer 側 env var 取得は bundler 別 (Vite / Next.js / Webpack / esbuild 表)

### Improvements 2
- **Imp1** (§3.1): LOC → bundle size 換算表 (~565 runtime LOC → ~11.5 KB minified → ~4.2 KB gzip)、NFR Req §1.1 根拠
- **Imp2** (§3.2 + §4.1 Step 5): `size-limit` (preset-small-lib) で 5 KB gzip 上限を CI 自動 enforce
