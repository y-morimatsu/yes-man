# Unit Test Instructions

**Phase**: CONSTRUCTION — Build and Test
**Created**: 2026-05-16
**Status**: 🟡 IN REVIEW
**Scope**: 各 unit 内の test (vitest / pytest unit + integration)

---

## 0. 前提

Build (build-instructions.md) 完了済、各 workspace の test 実行可能状態。

---

## 1. Backend (apps/api、pytest)

### 1.1 全 test 実行

```bash
cd apps/api
pytest -v
```

### 1.2 階層別

```bash
# Unit test (各 domain / application / infrastructure)
pytest tests/unit -v

# Integration test (Repository + adapter integration)
pytest tests/integration -v

# Contract test (Repository Protocol 適合)
pytest tests/contract -v

# Property-Based Testing (Hypothesis)
pytest tests/property -v
```

### 1.3 unit 別 (主要)

| unit | test path | テスト数 |
|---|---|---|
| U2 storage | `tests/unit/persistence/`, `tests/integration/persistence/`, `tests/contract/` | 既存 |
| U3 auth | `tests/unit/auth/`, `tests/integration/auth/` | 既存 |
| U4 decision | `tests/unit/decision/`, `tests/integration/decision/` | 既存 Phase I 全 |
| U5 learning | `tests/unit/learning/`, `tests/property/test_builder_invariants.py` | 既存 |
| U-Persona | `tests/unit/persona/` (5 file)、`tests/property/test_catalog_invariants.py` | 累計 5 + 1 PBT |
| U6 voice | `tests/unit/voice/` (5 file)、`tests/integration/voice/` (placeholder) | 5 + 1 placeholder |

### 1.4 coverage

```bash
cd apps/api
pytest --cov=src/yesman_api --cov-report=term --cov-report=html
# → htmlcov/ に出力、coverage 80%+ target
```

---

## 2. Frontend packages (vitest)

### 2.1 @yesman/api-client (U7c)

```bash
pnpm --filter @yesman/api-client test
# → tests/{client, auth, errors, sse, modules/*}.test.ts、~30 cases
```

### 2.2 @yesman/ui (U7b)

```bash
pnpm --filter @yesman/ui test
# → tests/{primitives, composites, hooks}/*.test.tsx、~25 cases
# coverage: lines 80% / branches 70%
```

### 2.3 @yesman/web (U7a + U7d)

```bash
pnpm --filter @yesman/web test
# → tests/shell/* (U7a) + tests/features/* (U7d)、~30 cases
# coverage: lines 75% / branches 65%
```

---

## 3. PBT (Property-Based Testing) 横断

### 3.1 Backend (Hypothesis)

```bash
cd apps/api
pytest tests/property -v
```

該当 file:
- `test_builder_invariants.py` (U5): apply_yes/no 不変条件
- `test_catalog_invariants.py` (U-Persona): Selection 不変条件
- `test_silence_guard_input.py` / `test_silence_guard_llm_output.py` (U3): SilenceGuard
- `test_jwt_robustness.py` / `test_parser_robustness.py` (U3): JWT + parser
- `test_score_consistency.py` (U-Test 新規): ratio invariant
- `test_prompt_size_bound.py` (U4)
- `test_builder_invariants.py` (U5)
- `test_jsonb_roundtrip.py` (U2)

### 3.2 Frontend (fast-check)

```bash
pnpm --filter @yesman/web test -- decision_reducer
# → apps/web/tests/property/decision_reducer.test.ts、state machine 不変条件
```

---

## 4. CI workflow (`.github/workflows/pr-frontend.yml` + `pr-test.yml`)

```yaml
# Backend tests
- run: pytest apps/api -v
- run: pytest apps/api --cov=src/yesman_api --cov-report=xml

# Frontend tests
- run: pnpm --filter @yesman/api-client test
- run: pnpm --filter @yesman/ui test
- run: pnpm --filter @yesman/web test
```

CI 想定実行時間 (unit のみ): **~3-5 min**

---

## 5. ローカル動作確認

### 5.1 watch mode (dev)

```bash
# Backend
cd apps/api
pytest --watch    # pytest-watch があれば、なければ手動 re-run

# Frontend
pnpm --filter @yesman/ui test:watch
pnpm --filter @yesman/web test:watch
```

### 5.2 単一 test debug

```bash
# pytest
pytest apps/api/tests/unit/decision/test_engine.py::TestRun::test_normal -v -s

# vitest
pnpm --filter @yesman/web exec vitest run --reporter=verbose tests/features/decision/reducer.test.ts
```

---

## 6. 受入基準

- [x] Backend pytest 全 pass (~150+ cases、unit + integration + contract + PBT)
- [x] Frontend vitest 全 pass (~85 cases、3 package 合計)
- [x] Coverage 目標達成:
  - Backend: lines > 80%
  - api-client: lines > 85%
  - ui: lines > 80% / branches > 70%
  - web: lines > 75% / branches > 65%
- [x] PBT 全 case max_examples=100 で fail なし
- [x] CI unit test 実行時間 < 5 min

---

## Post-CONSTRUCTION 改修注記 (2026-05-19)

CONSTRUCTION 完了後に追加/更新された unit test:

### Backend (`apps/api/tests/`)
- `tests/unit/decision/test_scorer.py`: Yes-ratio 反転 (`317280b`) + `_build_history` 追加 (`2400f45`) を反映
- `tests/property/test_score_consistency.py`: PBT を Yes-ratio に更新 (`317280b`)
- 既存 53 ファイル構成は不変

### Web (`apps/web/tests/`)
- `tests/features/score/ScorePage.test.tsx`: radial + line chart 描画検証を追加 (`2400f45`)
- `tests/features/score/scoreLevel.test.ts`: 閾値反転検証 (`317280b`)
- `tests/setup.ts`: `getUserMedia` + `MediaRecorder` mock 拡張 (Voice toggle 検証用、`775f6a5`)
- 既存 14 ファイル構成は不変

### Cross-package
- `packages/ui` Storybook stories は 6 件で不変、`VoiceMicButton` の toggle 化 (`775f6a5`) は story 更新で対応

→ 既存の `pytest -v` + `pnpm test` コマンドで全件 PASS、CI 実行時間 < 5 min 予算内を維持。
