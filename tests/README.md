# tests/ — YesMan 横断テスト

U2-U7d 各 unit 内テストに加え、本 unit (U-Test) は cross-unit 横断テストを集約。

## 構成

| dir | 種別 | 実行方法 |
|---|---|---|
| `e2e/` | Playwright (FE + API + Mock backend full stack) | `pnpm --filter @yesman/e2e test` |
| `integration/` | pytest (cross-unit API、Mock everywhere) | `pytest tests/integration` |
| `fixtures/shared/` | E2E + Integration 共通 fixture (ultrathink NFR Req Imp1) | - (import only) |
| `load/` | k6 (manual trigger、staging 環境) | `k6 run tests/load/scenarios/<name>.js` |
| `smoke/` | shell (deploy 後 sanity) | `bash tests/smoke/smoke.sh` |

## ローカル動作確認

```bash
# E2E (Mock backend で API + Web 両起動、Docker 不要)
cd tests/e2e
pnpm install
pnpm exec playwright install --with-deps chromium
pnpm test

# Integration
pytest tests/integration -v

# Smoke (apps/api を Mock backend で起動後)
bash tests/smoke/smoke.sh
```

## CI

`.github/workflows/pr-test.yml` で PR ごとに E2E + Integration + PBT + Smoke を実行 (~8 min)。
Load test は `load-test.yml` workflow_dispatch で手動 trigger。
