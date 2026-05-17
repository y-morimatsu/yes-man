# Integration Test Instructions

**Phase**: CONSTRUCTION — Build and Test
**Created**: 2026-05-16
**Status**: 🟡 IN REVIEW
**Scope**: unit 跨ぎ integration test (U-Test §3) + E2E (U-Test §2)

---

## 0. 前提

- Mock backend everywhere (Docker / Aurora / Cognito 不要)
- Playwright browser (chromium) install 済
- Build (build-instructions.md) + Unit test (unit-test-instructions.md) 通過

---

## 1. Cross-unit Integration (pytest)

### 1.1 実行

```bash
pytest tests/integration -v
```

### 1.2 シナリオ別 (U-Test FD §3)

| ファイル | 検証内容 | 関連 unit |
|---|---|---|
| `test_decision_to_preference.py` | Decision Yes 採択 → preference 学習 (sync event) | U4 + U5 |
| `test_consumer_eventbridge_path.py` | SQS Consumer 直接 test (prod path) | U5 |
| `test_persona_blocked_in_decision.py` | blocked persona → DecisionEngine 除外 | U-Persona + U4 |
| `test_voice_to_decision.py` | STT 出力 → decision input | U6 + U4 |
| `test_score_after_no_streak.py` | 5 連続 No → ratio > 0.5 + danger | U4 + score |

### 1.3 conftest

`tests/integration/conftest.py` で env を Mock 強制、repo_bundle fixture が per-test in-memory store。

CI 実行時間: **~2 min**

---

## 2. E2E (Playwright、U-Test §2)

### 2.1 install

```bash
cd tests/e2e
pnpm install
pnpm exec playwright install --with-deps chromium
```

### 2.2 実行

```bash
# 全 spec
pnpm test

# UI mode (debug)
pnpm test:ui

# 単一 spec
pnpm exec playwright test tests/decision.spec.ts
```

### 2.3 spec 一覧 (U-Test §2.2)

| spec | story | 検証内容 |
|---|---|---|
| `auth.spec.ts` | A1-A4 | sign-in/profile/二段階削除 confirmation |
| `decision.spec.ts` | B1-B6 | SSE → utterance → Yes/No → nudge |
| `persona.spec.ts` | G1-G6 | list / create / selection 上限 3 |
| `score.spec.ts` | C1-C4 | initial + No 5 連発で danger UI (API seed hybrid) |
| `voice.spec.ts` | F1-F4 | VoiceMicButton render + mic permission |

### 2.4 環境

Playwright `webServer` で API + Web 自動起動:
- `pnpm --filter @yesman/api start` (port 8000、Mock everything)
- `pnpm --filter @yesman/web dev` (port 5173)

Docker 不要、`reuseExistingServer: !isCI` で local dev でも reuse。

### 2.5 CI 設定

- `workers: 2` (CI、GitHub Actions 2 vCPU)、`workers: 4` (local)
- `retries: 1` (CI のみ)、retry > 5% でアラート
- `trace: on-first-retry`、`screenshot: only-on-failure`

CI 実行時間: **~5-7 min** (cache 含む)

---

## 3. Contract test (既存)

```bash
pytest apps/api/tests/contract -v
```

Repository Protocol (DecisionRepository / PersonaRepository 等) が SqlModel + Mock 両実装で同じ動作することを保証。U2 で既存実装、新 unit 追加時も追加必要。

CI 実行時間: **~30 sec**

---

## 4. Smoke test (deploy 後 sanity)

```bash
bash tests/smoke/smoke.sh
# - GET ${API}/health → 200
# - GET ${API}/v1/profiles/me → 401/403 (auth required)
# - GET ${WEB}/ → contains <title>YesMan</title>
```

`pr-test.yml` CI の最後 step + prod deploy 後 `deploy-web.yml` post-deploy step で実行。

CI 実行時間: **~30 sec**

---

## 5. CI 統合 workflow

`.github/workflows/pr-test.yml` で以下を 1 job 内で順次実行:

```
1. Cache restore (pip + pnpm + Playwright browsers)
2. Install deps (pnpm + pip)
3. Build workspace (api-client + ui)
4. Install Playwright browsers
5. E2E (Playwright)            → ~5-7 min
6. Integration (pytest)         → ~2 min
7. PBT (apps/api/tests/property)→ ~30 sec
8. Smoke (smoke.sh)             → ~30 sec
9. Upload Playwright report artifact
```

CI 合計実行時間: **~8 min** (10 min 予算内)

---

## 6. 受入基準

- [x] Integration: 5 シナリオで cross-unit flow 検証 (現状 placeholder + Consumer 直接 test)
- [x] E2E: 5 spec × 4-6 case = ~25 case、Mock backend で portable
- [x] Contract: Repository Protocol 適合 (既存)
- [x] Smoke: 3 step sanity check
- [x] CI workflow 統合、~8 min 内
- [x] Playwright HTML report が CI artifact で確認可能
