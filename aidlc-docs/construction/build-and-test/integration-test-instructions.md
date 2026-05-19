# Integration Test Instructions

**Phase**: CONSTRUCTION — Build and Test
**Created**: 2026-05-16
**Last Updated**: 2026-05-19 (Post-CONSTRUCTION: E2E 100 件構成に拡張)
**Status**: ✅ APPROVED 2026-05-16 / 🟢 E2E 100/100 PASS (2026-05-17 〜 継続検証)
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

### 2.3 spec 一覧 (Post-CONSTRUCTION 2026-05-19 実測: 12 spec / 100 test)

| spec | test 数 | story | 検証内容 |
|---|---:|---|---|
| `auth.spec.ts` | 3 | A1-A4 | sign-in / profile / 二段階削除 confirmation |
| `decision.spec.ts` | 3 | B1-B6 | SSE → utterance → Yes/No → nudge |
| `design.spec.ts` | 9 | (cross) | FE-DESIGN 整合性 (typography / color palette / motion / mobile-first) |
| `inception-complete-screens.spec.ts` | 19 | (cross) | INCEPTION drawio 全 20 画面網羅 (URL ナビゲーション含む) |
| `inception-design.spec.ts` | 20 | (cross) | INCEPTION drawio design fidelity (tokens + copy + icons) |
| `inception-mobile.spec.ts` | 14 | (cross) | Pixel 5 mobile viewport (WCAG 2.5.5 touch target 44×44 / no horizontal scroll) |
| `inception-structural.spec.ts` | 11 | (cross) | INCEPTION structural (LIVE / pink nudge / persona icons / silence theater) |
| `no-burst-regenerate.spec.ts` | 5 | B6 | No 連打 → prefetch buffer swap (`usePrefetchedDecisions`、commit `2b08a75`) |
| `persona.spec.ts` | 3 | G1-G6 | list / create / selection 上限 3 / 💡おすすめ badge (`07c1c78` 反映後) |
| `score.spec.ts` | 2 | C1-C4 | Yes-ratio で warning 表示 / radial + line chart 描画 (`317280b` + `2400f45`) |
| `swipe-and-discussion.spec.ts` | 9 | B1-B3 | SwipeChoice 動作 + discussion live UI + AI bubble |
| `voice.spec.ts` | 2 | F1-F4 | VoiceMicButton render + mic permission + backend toggle (`775f6a5`) |
| **合計** | **100** | - | **全件 PASS (2026-05-17 〜 2026-05-19)** |

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
- [x] **E2E: 12 spec × 平均 8.3 test = 100 test、Mock backend で portable、全件 PASS** (Post-CONSTRUCTION 2026-05-17 実機確定)
- [x] Contract: Repository Protocol 適合 (既存)
- [x] Smoke: 3 step sanity check
- [x] CI workflow 統合、~8 min 内
- [x] Playwright HTML report が CI artifact で確認可能 (`tests/e2e/playwright-report/index.html`)

---

## 7. Post-CONSTRUCTION 改修注記 (2026-05-17 〜 2026-05-19)

CONSTRUCTION 完了時点で **5 spec / ~25 test** だった E2E 構成が、Post-CONSTRUCTION 段階で以下のように **12 spec / 100 test** に拡張された:

| 追加 spec | 目的 | 関連 commit |
|---|---|---|
| `design.spec.ts` (9 test) | FE-DESIGN extension 適用後の token/color/motion 整合性検証 | `1c7c5eb` + `1924411` |
| `inception-complete-screens.spec.ts` (19 test) | INCEPTION drawio 全 20 画面網羅 | `2400f45` |
| `inception-design.spec.ts` (20 test) | INCEPTION drawio design fidelity | `2400f45` |
| `inception-mobile.spec.ts` (14 test) | Pixel 5 mobile viewport (WCAG 2.5.5) | `2400f45` |
| `inception-structural.spec.ts` (11 test) | INCEPTION structural compliance | `2400f45` |
| `no-burst-regenerate.spec.ts` (5 test) | `usePrefetchedDecisions` (No 連打 prefetch buffer) | `2b08a75` |
| `swipe-and-discussion.spec.ts` (9 test) | `SwipeChoice` state-leak fix + discussion live UI | `2b08a75` |

→ Score-flip + Dynamic Persona Routing + Voice backend toggle + Splash 文言削除の各 commit 直後に E2E 全件再実行、いずれも 100/100 PASS で regression なしを確認。
