# U-Test — Infrastructure Design

**Unit**: U-Test
**Phase**: CONSTRUCTION — Infrastructure Design
**Created**: 2026-05-16
**Status**: ✅ APPROVED 2026-05-16 (light review)
**Upstream**: FD 6 + NFR Req 3 + NFR Design 0 = 累計 9 fixes

---

## 0. 位置付け

U-Test は **テスト集約 unit**、本番 AWS インフラ消費なし。CI workflow + Playwright browser binary cache のみ。

---

## 1. CI/CD パイプライン

### 1.1 PR test workflow 拡張

```yaml
# .github/workflows/pr-test.yml (新規)
name: PR test (cross-unit)
on:
  pull_request:
    paths:
      - "tests/**"
      - "apps/**"
      - "packages/**"
      - ".github/workflows/pr-test.yml"

jobs:
  e2e:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - uses: actions/setup-python@v5
        with: { python-version: "3.12" }
      # Playwright browser cache
      - uses: actions/cache@v4
        with:
          path: ~/.cache/ms-playwright
          key: playwright-${{ runner.os }}-${{ hashFiles('tests/e2e/package.json') }}
      - run: pnpm install --frozen-lockfile
      - run: pip install -e apps/api[dev]

      # workspace build (api-client + ui)
      - run: pnpm --filter @yesman/api-client build
      - run: pnpm --filter @yesman/ui build

      # Install Playwright browsers (cached)
      - run: pnpm --filter @yesman/e2e exec playwright install --with-deps chromium

      # E2E
      - run: pnpm --filter @yesman/e2e test
        env: { CI: "true" }

      # Integration (pytest)
      - run: pytest tests/integration -v

      # PBT (既存 + 新規) 通常の pytest 内で走る
      - run: pytest apps/api/tests/property -v

      # Smoke (Mock backend で起動後)
      - run: bash tests/smoke/smoke.sh
        env: { API_URL: "http://localhost:8000", WEB_URL: "http://localhost:5173" }

      # Upload artifacts
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-report
          path: tests/e2e/playwright-report
```

### 1.2 Load test workflow (manual trigger)

```yaml
# .github/workflows/load-test.yml
name: Load test (manual)
on:
  workflow_dispatch:
    inputs:
      scenario:
        description: "k6 scenario"
        required: true
        default: "decision-throughput"

jobs:
  load:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: grafana/setup-k6-action@v1
      - run: k6 run tests/load/scenarios/${{ inputs.scenario }}.js
```

---

## 2. AWS インフラ影響

| 項目 | 影響 |
|---|---|
| S3 / CloudFront / Cognito | ❌ 無し (E2E は Mock backend) |
| Lambda / ECS | ❌ 無し |
| Bedrock | ❌ 無し (Mock LLM) |
| Aurora | ❌ 無し (Mock storage) |

**結論**: U-Test は **AWS インフラ追加ゼロ**、CI runner 時間のみ消費。

---

## 3. ローカル動作確認

```bash
# E2E
cd tests/e2e
pnpm install
pnpm exec playwright install --with-deps chromium
pnpm test
# → 5 spec 並列実行、~5 min

# Integration
cd ../integration
pytest -v
# → 4 file × ~5 case = ~20 case、~2 min

# Load (local 簡易)
cd ../load
k6 run scenarios/decision-throughput.js
# → 10 VU × 1 min

# Smoke
bash tests/smoke/smoke.sh
```

---

## 4. 受入基準

- [x] CI workflow (pr-test.yml) で E2E + Integration + PBT + Smoke を 1 job 化
- [x] Load test は workflow_dispatch (手動)
- [x] Playwright browser binary を actions/cache で 2 回目以降高速化
- [x] AWS インフラ影響ゼロ
- [x] ローカル動作確認 4 step

---

## Post-CONSTRUCTION 改修注記 (2026-05-19)

本ドキュメント本体は 2026-05-16 承認時の Snapshot (light review approved) を保持。

**CI workflow (pr-test.yml / load-test.yml) + Playwright cache 戦略 + integration / load / smoke の Design は不変**。

### E2E spec 拡張に伴う infra-level 影響
- `tests/e2e/tests/*.spec.ts` の追加 7 spec はすべて既存の Playwright config (mobile-chrome / Pixel 5) で実行
- CI `pr-test.yml` の workflow 構成は不変、cache 戦略も従来通り
- HTML report (`tests/e2e/playwright-report/index.html`) は GitHub Actions artifact upload 設定で取得可能
- `.gitignore` で `tests/e2e/.last-run.json` 等の per-run 副産物を untrack (`9a52954`)

→ U-Test Infrastructure Design は CONSTRUCTION 完了状態のまま、E2E spec 拡張は infra 不変で吸収。
