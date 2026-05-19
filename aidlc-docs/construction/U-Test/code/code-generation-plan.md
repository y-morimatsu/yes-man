# U-Test — Code Generation Plan (Part 1)

**Unit**: U-Test
**Phase**: CONSTRUCTION — Code Generation Part 1 (Planning)
**Created**: 2026-05-16
**Status**: ✅ APPROVED 2026-05-16 (light review)
**Upstream**: FD 6 + NFR Req 3 + NFR Design 0 + Infra Design 0 = 累計 9 fixes

---

## 0. 位置付け

NFR Design §1 で確定した「tests/ 配下 5 種テスト」を、Phase A-D の 4 段階で実装する詳細計画。

---

## 1. 全体方針

### 1.1 ファイル集計

| カテゴリ | 数 |
|---|---|
| **新規 tests/e2e** | 9 (package.json + playwright.config + tsconfig + 2 fixtures + 5 specs) |
| **新規 tests/integration** | 7 (pyproject + conftest + 5 tests) |
| **新規 tests/fixtures/shared** | 3 (personas.ts + decisions.ts + __init__.py) |
| **新規 tests/load** | 5 (k6.config + 3 scenarios + README) |
| **新規 tests/smoke** | 2 (smoke.sh + README) |
| **新規 PBT 追加** | 2 (score_consistency.py + decision_reducer_invariants.ts) |
| **新規 CI workflow** | 2 (pr-test.yml + load-test.yml) |
| **新規 README** | 1 (tests/README.md overview) |
| **合計** | **約 31 ファイル** |

### 1.2 順序

Phase A (fixtures + config) → B (E2E 9) → C (Integration + PBT 9) → D (Load + Smoke + CI 9 + README 1) → E (verify) の 5 段階。

### 1.3 品質基準

- Playwright config TypeScript 構文確認
- pytest collect で 20+ test 検出
- shell script syntax (bash -n) 確認
- k6 script syntax (k6 inspect) 確認
- CI workflow YAML 構文確認

---

## 2. Phase A.0: Pre-flight check

- [ ] **A.0.1** `ls tests/` で **不在確認**、monorepo root に新規追加
- [ ] **A.0.2** 各 unit の既存テスト (apps/api/tests/, packages/*/tests/, apps/web/tests/) 保持確認

---

## 3. Phase A: fixtures/shared + 設定 (4 ファイル)

- [ ] **A.1** `tests/README.md` overview
- [ ] **A.2** `tests/fixtures/shared/personas.ts`
- [ ] **A.3** `tests/fixtures/shared/decisions.ts`
- [ ] **A.4** `tests/fixtures/shared/__init__.py` (Python 側 sample data)

---

## 4. Phase B: tests/e2e 9 ファイル

- [ ] **B.1** `tests/e2e/package.json`
- [ ] **B.2** `tests/e2e/tsconfig.json`
- [ ] **B.3** `tests/e2e/playwright.config.ts` (NFR Design §2)
- [ ] **B.4** `tests/e2e/fixtures/auth.ts`
- [ ] **B.5** `tests/e2e/fixtures/seed.ts`
- [ ] **B.6** `tests/e2e/tests/auth.spec.ts`
- [ ] **B.7** `tests/e2e/tests/decision.spec.ts`
- [ ] **B.8** `tests/e2e/tests/persona.spec.ts`
- [ ] **B.9** `tests/e2e/tests/score.spec.ts`
- [ ] **B.10** `tests/e2e/tests/voice.spec.ts`

---

## 5. Phase C: tests/integration 7 + PBT 2 = 9 ファイル

- [ ] **C.1** `tests/integration/pyproject.toml`
- [ ] **C.2** `tests/integration/conftest.py` (NFR Design §4)
- [ ] **C.3** `tests/integration/tests/test_decision_to_preference.py`
- [ ] **C.4** `tests/integration/tests/test_persona_blocked_in_decision.py`
- [ ] **C.5** `tests/integration/tests/test_voice_to_decision.py`
- [ ] **C.6** `tests/integration/tests/test_score_after_no_streak.py`
- [ ] **C.7** `tests/integration/tests/test_consumer_eventbridge_path.py`
- [ ] **C.8** `apps/api/tests/property/test_score_consistency.py` (PBT 新規)
- [ ] **C.9** `apps/web/tests/property/decision_reducer.test.ts` (PBT 新規、fast-check)

---

## 6. Phase D: load + smoke + CI 9 + README = 9 ファイル

- [ ] **D.1** `tests/load/k6.config.js`
- [ ] **D.2** `tests/load/scenarios/decision-throughput.js`
- [ ] **D.3** `tests/load/scenarios/sse-concurrent.js`
- [ ] **D.4** `tests/load/scenarios/persona-list.js`
- [ ] **D.5** `tests/load/README.md`
- [ ] **D.6** `tests/smoke/smoke.sh` (chmod +x)
- [ ] **D.7** `tests/smoke/README.md`
- [ ] **D.8** `.github/workflows/pr-test.yml` (Infra Design §1.1)
- [ ] **D.9** `.github/workflows/load-test.yml` (Infra Design §1.2)

---

## 7. Phase E: verify

- [ ] **E.1** JSON 構文 (package.json + tsconfig.json)
- [ ] **E.2** YAML 構文 (CI workflows)
- [ ] **E.3** Python AST (conftest.py + test_*.py)
- [ ] **E.4** Shell syntax (`bash -n smoke.sh`)
- [ ] **E.5** LOC 集計 (~600 LOC 概算)

---

## 8. リスク

| リスク | 影響 | 対応 |
|---|---|---|
| Playwright browser install が CI で時間掛かる | CI > 10 min | actions/cache@v4 で ~/.cache/ms-playwright cache (Infra Design §1.1) |
| Integration test の Mock backend init 時間 | 各 test 遅延 | conftest で repo_factory を session scope fixture 化 (将来) |
| k6 scenarios が staging 環境で正しく動かない | manual trigger 失敗 | API_URL env override で staging 指定可能 |
| flaky E2E test で CI 不安定 | dev velocity 低下 | retries:1 (CI) + retry > 5% 監視 (NFR Req I2) |

---

## 9. 承認チェックリスト

- [x] Phase A.0 → A → B → C → D → E の 6 段階
- [x] 約 31 ファイル新規
- [x] FD/NFR Req/NFR Design/Infra Design 全 fix 反映
- [x] CI workflow に E2E + Integration + PBT + Smoke 統合
- [x] Load test は manual trigger 別 workflow
- [x] tests/fixtures/shared/ で重複排除

---

## Post-CONSTRUCTION 改修注記 (2026-05-17 〜 2026-05-19)

本 plan 本体は 2026-05-16 承認時の Snapshot (light review approved) を保持。

**Phase A〜E (fixtures + tests/README / e2e 9 / integration + PBT 9 / load + smoke + CI 9 / 構文 OK) の生成計画は全て継続有効**。

### Post-CONSTRUCTION で追加された E2E spec ファイル
| spec | commit | test 数 |
|---|---|---:|
| `tests/e2e/tests/design.spec.ts` | `1c7c5eb` + `1924411` | 9 |
| `tests/e2e/tests/inception-complete-screens.spec.ts` | `2400f45` | 19 |
| `tests/e2e/tests/inception-design.spec.ts` | `2400f45` | 20 |
| `tests/e2e/tests/inception-mobile.spec.ts` | `2400f45` | 14 |
| `tests/e2e/tests/inception-structural.spec.ts` | `2400f45` | 11 |
| `tests/e2e/tests/no-burst-regenerate.spec.ts` | `2b08a75` | 5 |
| `tests/e2e/tests/swipe-and-discussion.spec.ts` | `2b08a75` | 9 |
| **追加 spec 合計** | | **+ 87 test** |

CONSTRUCTION 完了時 5 spec / ~25 test → Post-CONSTRUCTION **12 spec / 100 test**

### `.gitignore` 追加 (`9a52954`)
- `tests/e2e/.last-run.json` 等の per-run 副産物を untrack
- HTML report (`tests/e2e/playwright-report/index.html`) と `results.json` のみ tracking 継続

### CI / fixture 構成は不変
- `tests/e2e/playwright.config.ts` + `tests/e2e/tests/fixtures/` 不変
- `pr-test.yml` workflow も不変、~8 min budget 内で 100 test 実行

→ U-Test Code Gen Plan は構成を維持、E2E spec を 7 件追加で 5 → 12 spec に拡張、全件 PASS 確認済。
