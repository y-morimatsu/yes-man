# Build Instructions

**Phase**: CONSTRUCTION — Build and Test
**Created**: 2026-05-16
**Status**: 🟡 IN REVIEW
**Scope**: 全 11 unit (U1-U7d + U-Test) の build 手順統合

---

## 0. 前提

| 要件 | バージョン |
|---|---|
| Node.js | >= 20 |
| pnpm | >= 9 |
| Python | >= 3.12 |
| AWS CDK CLI | >= 2.x (U1 deploy 時のみ) |
| Docker | optional (E2E/Integration は Mock backend で不要) |

---

## 1. 全体 build 順序

依存チェーン (workspace 内):

```
apps/api (Python)        ← independent
   └─ openapi.json dump ─▶ packages/api-client (TS)
                              └─▶ packages/ui (TS, type-only dep on api-client)
                                     └─▶ apps/web (TS, dep on api-client + ui)
infra/ (CDK)             ← independent
```

---

## 2. Backend (apps/api、Python)

### 2.1 install

```bash
cd apps/api
pip install -e ".[dev]"
```

### 2.2 OpenAPI schema dump (U7c 連携)

```bash
cd apps/api
python scripts/dump_openapi.py
# → apps/api/openapi.json (~50-100 KB) 出力
git add apps/api/openapi.json
```

### 2.3 検証

```bash
# AST parse + import 解決
python -c "from yesman_api.main import app; print('OK')"

# Alembic migration (Aurora 想定、Mock backend なら skip)
cd apps/api
alembic upgrade head    # docker-postgres 起動時のみ
```

---

## 3. Frontend (pnpm workspace monorepo)

### 3.1 install (root)

```bash
cd <repo-root>
pnpm install --frozen-lockfile
```

`pnpm-workspace.yaml` で `apps/*` + `packages/*` を解決。

### 3.2 workspace build 順序

```bash
# U7c: api-client (TS 型生成 + tsc build)
pnpm --filter @yesman/api-client run generate    # openapi-typescript で schema.ts 生成
pnpm --filter @yesman/api-client build

# U7b: ui (tsc + cva + Tailwind preset)
pnpm --filter @yesman/ui build

# U7a + U7d: apps/web (Vite build + manualChunks + PWA)
# CI で VITE_APP_VERSION を git SHA で注入
export VITE_APP_VERSION=$(git rev-parse --short HEAD)
pnpm --filter @yesman/web build
```

### 3.3 bundle size 検証 (U7c/U7b/U7d 全 size-limit)

```bash
pnpm --filter @yesman/api-client run size    # < 5 KB gzip
pnpm --filter @yesman/ui run size            # < 7 KB gzip
pnpm --filter @yesman/web run size           # main < 250 KB / shared chunks 別閾値
```

### 3.4 Storybook build (U7b)

```bash
pnpm --filter @yesman/ui run build-storybook    # storybook-static/ 出力
```

---

## 4. CDK (infra)

### 4.1 install

```bash
cd infra
pnpm install --frozen-lockfile
```

### 4.2 synth

```bash
cd infra
pnpm cdk synth
# → cdk.out/ に CloudFormation template 出力、syntax + IAM policy 検証
```

### 4.3 test (snapshot + unit)

```bash
cd infra
pnpm test
```

### 4.4 deploy (prod 時のみ)

```bash
cd infra
pnpm cdk deploy --all --require-approval never
```

---

## 5. CI workflow build 統合

`.github/workflows/pr-test.yml` で以下を順次実行:

```yaml
- actions/cache (pip + pnpm + Playwright browsers)
- pnpm install --frozen-lockfile
- pip install -e apps/api[dev]
- pnpm --filter @yesman/api-client build
- pnpm --filter @yesman/ui build
- pnpm --filter @yesman/web build      # with VITE_APP_VERSION
- pnpm --filter @yesman/* run size     # bundle size enforce
- pnpm --filter @yesman/ui run build-storybook
- cd infra && pnpm cdk synth
```

CI 想定実行時間: **~5-7 min** (cache hit 時)

---

## 6. 受入基準

- [x] `pip install -e apps/api[dev]` 成功
- [x] `pnpm install` 成功 (workspace 全 package)
- [x] `python scripts/dump_openapi.py` 成功 (openapi.json 出力)
- [x] api-client / ui / web の `pnpm build` 全成功
- [x] `pnpm run size` 全 package で 閾値内
- [x] `cd infra && pnpm cdk synth` 成功
- [x] CI workflow が ~7 min 以内に完了
