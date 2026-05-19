# U-Test — NFR Requirements

**Unit**: U-Test (横断テスト)
**Phase**: CONSTRUCTION — NFR Requirements
**Created**: 2026-05-16
**Status**: ✅ APPROVED 2026-05-16 (ultrathink full / 3 fixes applied: Important 2 + Improvements 1)
**Upstream**: FD 6 + NFR Req 3 = 累計 9 fixes

---

## 0. 位置付け

FD §1-9 で確定した「Playwright + pytest + k6 + smoke、Mock everywhere portable」設計に対し、5 観点で NFR を確定 (Security は test 自体で扱う対象ではないので Avail/Maint/Ext/Test 中心)。

---

## 1. Performance

| ID | 要件 | 計測 | 目標値 |
|---|---|---|---|
| **PERF-Test-01** | E2E 1 spec の実行時間 | per-spec | < 60 sec |
| **PERF-Test-02** | E2E 全 5 spec 並列実行時間 (ultrathink I1: 環境別) | full | **CI (2 workers): ~7-8 min / local (4 workers): < 5 min** |
| **PERF-Test-03** | Integration test 全実行 | full | < 2 min |
| **PERF-Test-04** | PBT max_examples 設定 | per-test | 100 (既存 U5 と同) |
| **PERF-Test-05** | k6 load test (load-staging) | per-scenario | < 10 min/シナリオ |
| **PERF-Test-06** | Smoke test 全 3 step | full | < 30 sec |
| **PERF-Test-07** | CI total time budget (Load 除く) | full | < 10 min |

---

## 2. Availability

| ID | 要件 | 根拠 |
|---|---|---|
| **AVAIL-Test-01** | E2E test は **`retries: 1` (CI のみ)** で偶発 fail 救済 (ultrathink I2)、ただし retry 発生率 > 5% でアラート (HTML report で監視) | dev velocity + 現実的 SSE async 対応 |
| **AVAIL-Test-02** | webServer 起動失敗時に明確なエラーメッセージ + 自動 retry なし | fast feedback |
| **AVAIL-Test-03** | Mock backend で外部依存ゼロ (Cognito/Bedrock/Aurora 不要) | offline 実行可 |
| **AVAIL-Test-04** | Integration test は DB state を test 間で isolation | parallel 実行可 |

---

## 3. Maintainability

| ID | 要件 | 根拠 |
|---|---|---|
| **MAINT-Test-01** | E2E spec は user story 単位、1 spec = 1 user journey | story 駆動 |
| **MAINT-Test-02** | Playwright Page Object Model は MVP 不採用、直接 selector で簡素化 | over-engineering 回避 |
| **MAINT-Test-03** | Integration test の fixture は conftest.py 集約 | DRY |
| **MAINT-Test-04** | k6 シナリオは 1 file = 1 scenario | locality |
| **MAINT-Test-05** | 各 test type の README で実行手順明示 | onboarding |

---

## 4. Extensibility

| ID | 要件 | 根拠 |
|---|---|---|
| **EXT-Test-01** | 新 user story 追加時、`tests/e2e/tests/<name>.spec.ts` 1 ファイル追加で完結 | Open-Closed |
| **EXT-Test-02** | 新 integration scenario は `tests/integration/tests/test_<name>.py` 1 file 追加 | 同 |
| **EXT-Test-03** | Load シナリオは `tests/load/scenarios/<name>.js` 追加で k6 trigger 可 | 同 |
| **EXT-Test-04** | E2E で staging 環境向けに `baseURL` を env で切替可能 | dev/staging 両対応 |

---

## 5. Testability (meta)

| ID | 要件 | 根拠 |
|---|---|---|
| **TEST-Test-01** | E2E は Playwright trace + screenshot で fail 時 debug 容易 | trace: "on-first-retry" |
| **TEST-Test-02** | Integration test fail で API log 含めて出力 | debug |
| **TEST-Test-03** | PBT fail 時に Hypothesis seed + minimal example 保存 | reproducibility |
| **TEST-Test-04** | E2E + Integration の test data は **`tests/fixtures/shared/`** で共通化 (ultrathink Imp1)、重複排除 | DRY |
| **TEST-Test-05** | 各 test type で `--ui` mode (interactive debug) サポート | dev experience |

---

## 6. 環境変数 / 設定

| 変数 | 用途 |
|---|---|
| `E2E_BASE_URL` | E2E target (default localhost:5173) |
| `API_URL` | Smoke target API |
| `WEB_URL` | Smoke target Web |
| `K6_VUS` | Load test virtual users override |
| `PLAYWRIGHT_WORKERS` | Playwright parallel workers (CI: 4) |

---

## 7. 受入基準

- [x] 5 観点で 22 NFR ID 定義 (Perf 7 + Avail 4 + Maint 5 + Ext 4 + Test 5)
- [x] CI time < 10 min budget 厳守 + 環境別 worker 数 (ultrathink I1)
- [x] retries: 1 CI のみ + retry > 5% アラート (ultrathink I2)
- [x] Mock everywhere で portable
- [x] tests/fixtures/shared/ で重複排除 (ultrathink Imp1)
- [x] 新テスト追加が 1 file で完結 (Open-Closed)
- [x] ultrathink 全 3 件適用 (Important 2 + Improvements 1)

## 8. ultrathink 適用ログ (2026-05-16)

### Important 2
- **I1** (PERF-Test-02): CI 2 workers / local 4 workers の環境別 target
- **I2** (AVAIL-Test-01): retries:1 (CI のみ) + retry > 5% アラート、現実的 flaky 対応

### Improvements 1
- **Imp1** (TEST-Test-04): `tests/fixtures/shared/` で E2E + Integration の seed 共通化

---

## Post-CONSTRUCTION 改修注記 (2026-05-19)

本ドキュメント本体は 2026-05-16 承認時の Snapshot (ultrathink full 3 fixes 適用済) を保持。

### E2E 件数の拡張
- CONSTRUCTION 時点: 5 spec / ~25 test (target NFR)
- Post-CONSTRUCTION 実機: **12 spec / 100 test 全件 PASS** (2026-05-17 `b3bceb0` で確定)
- CI ~8 min budget は維持 (mobile-chrome / Pixel 5 で 2.1m 実行)

### NFR 数値目標
- **CI 実行時間 < 10 min**: 達成 (実測 ~8 min)
- **Mock everywhere portable**: 達成 (Docker 不要、cryptography native build 不要)
- **PBT max_examples=100**: 不変

→ U-Test NFR Req は CONSTRUCTION 完了時の目標値を超過達成 (test 件数 4 倍化しつつ CI budget 内に収まる)。
