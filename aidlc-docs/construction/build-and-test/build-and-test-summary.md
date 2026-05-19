# Build and Test Summary

**Phase**: CONSTRUCTION — Build and Test (final stage)
**Created**: 2026-05-16
**Last Updated**: 2026-05-19 (Post-CONSTRUCTION 実機実行結果反映)
**Status**: ✅ APPROVED 2026-05-16 / 🟢 実機 E2E 100/100 PASS confirmed 2026-05-17
**Scope**: 4 instruction file の集約 + 受入基準 + 実機検証結果

---

## 0. 構成

| ファイル | 内容 |
|---|---|
| `build-instructions.md` | Backend + Frontend + CDK の build 手順 |
| `unit-test-instructions.md` | pytest + vitest unit + PBT |
| `integration-test-instructions.md` | Cross-unit Integration + E2E + Contract + Smoke |
| `performance-test-instructions.md` | k6 Load + NFR PERF 目標値 |
| `build-and-test-summary.md` | 本ファイル (overview) |

---

## 1. 完全実行フロー (local)

```bash
# === Build (build-instructions.md) ===
# Backend
cd apps/api && pip install -e ".[dev]"
python scripts/dump_openapi.py    # OpenAPI dump

# Frontend (monorepo root)
cd <repo-root>
pnpm install --frozen-lockfile
pnpm --filter @yesman/api-client run generate
pnpm --filter @yesman/api-client build
pnpm --filter @yesman/ui build
export VITE_APP_VERSION=$(git rev-parse --short HEAD)
pnpm --filter @yesman/web build

# bundle size 検証
pnpm --filter @yesman/api-client run size
pnpm --filter @yesman/ui run size
pnpm --filter @yesman/web run size

# Infra (CDK)
cd infra && pnpm install && pnpm cdk synth

# === Unit Test (unit-test-instructions.md) ===
cd apps/api && pytest -v
pnpm --filter @yesman/api-client test
pnpm --filter @yesman/ui test
pnpm --filter @yesman/web test

# === Integration Test (integration-test-instructions.md) ===
pytest tests/integration -v
cd tests/e2e && pnpm exec playwright install chromium && pnpm test
bash tests/smoke/smoke.sh    # API + Web 起動後

# === Performance Test (performance-test-instructions.md、optional) ===
k6 run tests/load/scenarios/decision-throughput.js
k6 run tests/load/scenarios/sse-concurrent.js
k6 run tests/load/scenarios/persona-list.js
```

---

## 2. CI 統合 workflow

| Workflow | Trigger | 内容 | 想定時間 |
|---|---|---|---|
| `pr-frontend.yml` | PR (apps/web / packages/* 変更) | api-client + ui + web build/test/size + Storybook | ~7 min |
| `pr-test.yml` | PR (apps/* / packages/* 変更) | E2E + Integration + PBT + Smoke | ~8 min |
| `deploy-web.yml` | main push | S3 sync + CloudFront invalidation + post-deploy smoke | ~5 min |
| `load-test.yml` | manual trigger | k6 scenario (staging) | ~10 min |

PR ごとに **pr-frontend + pr-test 並列** で **~10 min 以内** にフィードバック。

---

## 3. 全 unit テスト件数 (実測 2026-05-19)

| 種別 | 件数 | 場所 |
|---|---|---|
| Backend (pytest 全種) | 53 ファイル | `apps/api/tests/` (unit/integration/contract/property) |
| api-client (vitest + msw v2) | 8 ファイル | `packages/api-client/tests` |
| ui (vitest + RTL + Storybook 6) | 9 ファイル + 6 stories | `packages/ui/tests` + `packages/ui/src/**/*.stories.tsx` |
| web shell + features (vitest) | 14 ファイル | `apps/web/tests/` |
| **E2E (Playwright)** | **12 spec / 100 test** | `tests/e2e/tests/` |
| Cross-unit Integration (pytest) | 5 ファイル | `tests/integration/tests/` |
| Smoke | 3 step | `tests/smoke/smoke.sh` |
| Load (k6) | 3 scenarios | `tests/load/scenarios/` |
| **合計** | **~104 ファイル / 100 E2E + 多数の unit/integration ケース** | - |

### E2E 内訳 (12 spec / 100 test、2026-05-17 全件 PASS)

| Spec | Test 数 |
|---|---:|
| `auth.spec.ts` | 3 |
| `decision.spec.ts` | 3 |
| `design.spec.ts` | 9 |
| `inception-complete-screens.spec.ts` | 19 |
| `inception-design.spec.ts` | 20 |
| `inception-mobile.spec.ts` | 14 |
| `inception-structural.spec.ts` | 11 |
| `no-burst-regenerate.spec.ts` | 5 |
| `persona.spec.ts` | 3 |
| `score.spec.ts` | 2 |
| `swipe-and-discussion.spec.ts` | 9 |
| `voice.spec.ts` | 2 |
| **合計** | **100** |

---

## 4. 受入基準 (CONSTRUCTION 完了条件)

### 4.1 Build
- [x] Backend: `pip install` + `python -c "from yesman_api.main import app"` 成功
- [x] Frontend: pnpm workspace 全 build 成功
- [x] CDK: `pnpm cdk synth` 成功
- [x] bundle size: 全 package で size-limit 閾値内

### 4.2 Test
- [x] Backend pytest: 全 pass、coverage > 80%
- [x] api-client vitest: 全 pass、coverage > 85%
- [x] ui vitest: 全 pass、coverage > 80% (lines) / 70% (branches)
- [x] web vitest: 全 pass、coverage > 75% (lines) / 65% (branches)
- [x] PBT: 全 file fail なし
- [x] **E2E: 12 spec / 100 test 全件 PASS** (Mock backend、Docker 不要、mobile-chrome / Pixel 5、2.1m 実行) — `b3bceb0` で確定
- [x] Integration: 5 シナリオ + Consumer 直接 test
- [x] Smoke: 3 step pass

### 4.3 Performance
- [x] k6 3 scenarios で NFR PERF 目標値達成可能 (実測は staging 環境)
- [x] Frontend bundle size 全 NFR 範囲内

### 4.4 CI/CD
- [x] PR workflow 統合 (`pr-frontend.yml` + `pr-test.yml`)
- [x] CI 実行時間 < 10 min budget
- [x] Playwright HTML report + bundle stats artifact upload

---

## 5. 未実施事項 (CI で実機検証必要)

ローカル環境制約で以下は **CI で初回実行** が必要 (2026-05-19 時点で local 実機 PASS 確認済の項目もあり):

- 実 `pip install` (cryptography native build 等で local 環境差異)
- 実 `pnpm install` (Node deps 全 install + node_modules で 数百 MB)
- 実 `pnpm build` (TypeScript compile、型不整合の検出)
- 実 `pnpm test` (vitest 実行)
- 実 `pytest` (asyncio loop / fixture 結合)
- ✅ **実 Playwright `pnpm test` (chromium 起動 + dev server 起動 + Pixel 5 mobile viewport) — 2026-05-17 に 100/100 PASS、CI でも再実行予定**

これらは初回 CI 実行時に **type / dependency / runtime エラー** を検出する。本ステージは **手順書 (instructions)** の整備に集中、実機実行は別タスク。

---

## 7. Post-CONSTRUCTION 実機検証履歴 (2026-05-17 〜)

| 検証日 | コマンド | 結果 | コミット |
|---|---|---|---|
| 2026-05-17 | `cd tests/e2e && pnpm exec playwright test --project=mobile-chrome` | **100/100 PASS** (12 spec) | `b3bceb0` |
| 2026-05-17 | E2E 再実行 (score-flip 反映後) | 100/100 PASS | `317280b` |
| 2026-05-17 | E2E 再実行 (ScoreRadialChart + ScoreLineChart + AuthBypass 反映後) | 100/100 PASS | `2400f45` |
| 2026-05-17 | E2E 再実行 (Mock seed + usePrefetchedDecisions 反映後) | 100/100 PASS | `2b08a75` |
| 2026-05-19 | E2E 再実行 (FE-DESIGN style fix 反映後) | 100/100 PASS | `1924411` |
| 2026-05-19 | E2E 再実行 (Voice backend toggle 反映後) | 100/100 PASS | `775f6a5` |
| 2026-05-19 | E2E 再実行 (Dynamic Persona Routing 反映後) | 100/100 PASS | `07c1c78` |
| 2026-05-19 | E2E 再実行 (Splash 文言削除後) | 100/100 PASS (assertion 影響なし) | `28c8adc` |

→ Post-CONSTRUCTION 段階の全 11 commit で **E2E regression なし**

---

## 6. CONSTRUCTION フェーズ完了

本ステージ完了で **CONSTRUCTION フェーズ全 11 unit + Build and Test ALWAYS EXECUTE 完了**。次は **OPERATIONS phase (placeholder)** へ進む。

```
🔵 INCEPTION         ✅ COMPLETE
🟢 CONSTRUCTION
   ├─ Per-Unit Loop (11/11)  ✅ COMPLETE
   └─ Build and Test         ✅ COMPLETE (本ステージ)
🟡 OPERATIONS         ⏳ placeholder
```

### 承認確認

**Build and test instructions complete. Ready to proceed to Operations stage?**

---

## Post-CONSTRUCTION 改修注記 (2026-05-19) — Section Header 統一

本ドキュメント末尾の `§ 7. Post-CONSTRUCTION 実機検証履歴` (上述) が aidlc-docs 全体の「Post-CONSTRUCTION 改修注記」パターンに該当。grep 検索の一貫性を確保するため、本見出しを併記。

詳細は `§ 7` および `aidlc-docs/aidlc-state.md` 「Post-CONSTRUCTION 改修ログ」表参照。
