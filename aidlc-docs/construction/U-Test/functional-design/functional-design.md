# U-Test — Functional Design

**Unit**: U-Test — 横断テスト集約 (E2E + Integration + PBT + Contract + Load)
**Phase**: CONSTRUCTION — Functional Design
**Author**: AI-DLC workflow
**Created**: 2026-05-16
**Status**: ✅ APPROVED 2026-05-16 (ultrathink full / 6 fixes applied: Critical 1 + Important 3 + Improvements 2)

---

## 0. 位置付け

U2-U7d までの各 unit が **unit 内テスト** (vitest / pytest unit + integration) を持つ。U-Test は **unit 跨ぎの横断テスト** に集中:

1. **E2E (Playwright)**: FE + API + DB の full stack で user story を検証
2. **Cross-unit Integration**: U3 + U4 + U5 + U-Persona + U6 の連携 (例: 合議 → 採択 → preference 学習 → score 更新)
3. **PBT 集約**: 既存 U5 builder / U-Persona catalog の PBT 確認 + 不変条件横断
4. **Contract**: Repository Protocol contract (既存 U2 で実施) の確認
5. **Load / Performance**: NFR Req PERF-* 値の実測検証 (k6 or autocannon)
6. **Smoke test**: deploy 後の sanity check (CloudFront / API health)

### 関連要件
- 全 user story (A1-A4 / B1-B6 / C1-C4 / D1-D2 / E1-E3 / F1-F4 / G1-G6) を E2E で検証
- 各 unit の NFR Req 目標値を Load test で実測
- Decision Yes/No 採択 → preference 学習 → 次合議で反映 (cross-unit flow)

### 上流前提
| 出典 | 内容 |
|---|---|
| 全 U2-U7d unit COMPLETE | 各 unit 内テスト pass、本 unit は横断検証 |
| Docker Compose (U1 既存) | PostgreSQL + cognito-local + Mock LLM で E2E local 実行可 |
| `apps/api/tests/` | 既存 pytest unit + integration + PBT (拡張対象) |
| `packages/*/tests/`, `apps/web/tests/` | 既存 vitest unit (補完対象) |

### MVP スコープ (U-Test 内)
- ✅ Playwright で 5 主要 user journey E2E (sign-in / decision / persona / score / profile)
- ✅ Cross-unit integration test (U4 + U5 + U-Persona 連携)
- ✅ PBT 集約 (既存 U5 / U-Persona に加え、score consistency PBT)
- ✅ k6 Load test (DecisionStream SSE 同時接続 + REST endpoint throughput)
- ✅ Smoke test (CloudFront / API /health + auth)
- ⏭ Mutation testing は MVP 範囲外、Phase 2 検討
- ⏭ Chaos engineering は MVP 範囲外
- ⏭ Visual regression は U7b Storybook Chromatic で MVP は手動

---

## 1. ディレクトリ構成

```
tests/                                # repo root の新規 dir
├── e2e/                              # Playwright
│   ├── playwright.config.ts
│   ├── fixtures/
│   │   ├── auth.ts                   # cognito-local 経由で test user 認証
│   │   └── seed.ts                   # DB seed (builtin persona 等)
│   ├── tests/
│   │   ├── auth.spec.ts              # Story A1-A4
│   │   ├── decision.spec.ts          # Story B1-B6
│   │   ├── persona.spec.ts           # Story G1-G6
│   │   ├── score.spec.ts             # Story C1-C4
│   │   └── voice.spec.ts             # Story F1-F4
│   └── package.json
├── integration/                      # cross-unit
│   ├── pytest.ini
│   ├── conftest.py                   # 全 unit fixture (Docker Compose 経由)
│   └── tests/
│       ├── test_decision_to_preference.py     # U4 → U5 連携
│       ├── test_persona_blocked_in_decision.py # U-Persona blocked → U4 除外
│       ├── test_voice_to_decision.py          # U6 STT → U4 入力
│       └── test_score_after_no_streak.py      # U4 採択 → U4 score 更新
├── load/                             # k6
│   ├── k6.config.js
│   ├── scenarios/
│   │   ├── decision-throughput.js    # POST /v1/decisions/request RPS
│   │   ├── sse-concurrent.js         # SSE 同時 100 接続
│   │   └── persona-list.js           # GET /v1/personas/shared cache hit
│   └── README.md
├── smoke/                            # deploy 後の sanity
│   ├── smoke.sh                      # /health + auth endpoint 確認
│   └── README.md
└── README.md                         # 全テスト戦略の overview
```

---

## 2. E2E (Playwright) 戦略

### 2.1 環境 (ultrathink C1: Playwright webServer、Docker 不要)

```typescript
// tests/e2e/playwright.config.ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  webServer: [
    {
      command: "pnpm --filter @yesman/api start",
      port: 8000,
      env: {
        APP_ENV: "dev",
        AUTH_BACKEND: "mock",            // ← cognito-local 不要
        STORAGE_BACKEND: "mock",          // ← PostgreSQL 不要
        LLM_PROVIDER: "mock",
        VOICE_BACKEND: "mock",
        EVENT_BACKEND: "sync",
        LEARNING_CONSUMER_ENABLED: "false",
        MOCK_AUTO_USER: "true",           // ← AuthMiddleware bypass で test user 自動認証
      },
      reuseExistingServer: true,
    },
    {
      command: "pnpm --filter @yesman/web dev",
      port: 5173,
      env: {
        VITE_API_BASE_URL: "http://localhost:8000",
        VITE_COGNITO_REGION: "ap-northeast-1",
        VITE_COGNITO_USER_POOL_ID: "ap-northeast-1_test",
        VITE_COGNITO_APP_CLIENT_ID: "test",
        VITE_COGNITO_HOSTED_UI_URL: "https://test.auth.example.com",
        VITE_APP_VERSION: "e2e",
      },
      reuseExistingServer: true,
    },
  ],
  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
  },
});
```

**MVP MockBackend everywhere**:
- `AUTH_BACKEND=mock` + `MOCK_AUTO_USER=true` で AuthMiddleware が test user (fixed sub) 自動セット → cognito redirect 不要
- `STORAGE_BACKEND=mock` で in-memory store、Postgres 不要
- `LLM_PROVIDER=mock` + `VOICE_BACKEND=mock` で外部 AWS 呼び出しゼロ
- portable: Docker 不要、`pnpm install && pnpm e2e` だけで全 stack 起動

**prod-like E2E (real Cognito + Aurora)** は staging 環境 deploy 後の別 workflow (`e2e-staging.yml`)、本 unit scope は MVP の MockBackend everywhere。

### 2.2 主要 spec ファイル

#### 2.2.1 auth.spec.ts (Story A1-A4)
- sign-in 成功 → home redirect
- sign-in 後 reload で session 維持 (refresh token cookie)
- sign-out → /auth/signin redirect
- アカウント削除 → 二段階確認 → cognito user 削除 + DB cascade

#### 2.2.2 decision.spec.ts (Story B1-B6、ultrathink I1: UI レベル検証)

```typescript
// SSE 内部実装に依存しない、UI 表示で検証 (Playwright 推奨)
test("decision streaming + yes choice", async ({ page }) => {
  await page.goto("/decision");
  await page.fill('input[placeholder*="決めたいこと"]', "ランチ");
  await page.click('button:has-text("合議開始")');
  // utterance バブル出現を待つ (SSE event の最終結果を DOM で確認)
  await page.waitForSelector('[role="article"]', { timeout: 10_000 });
  // proposal 表示確認
  await page.waitForSelector('text=Yes', { timeout: 30_000 });
  await page.click('button:has-text("Yes")');
  // nudge banner 表示確認
  await page.waitForSelector("text=Yes 採択", { timeout: 5_000 });
});
```

- user_input 入力 → SSE 開始 → utterance バブル DOM 出現 → proposal 表示 → Yes 採択 → nudge 表示
- No 採択 → nudge 表示
- 沈黙ドメイン入力 (例: 「選挙の投票先を決めて」) → DecisionError silenced_domain で UI に固定メッセージ
- **SSE 低レベル test (EventSource/ReadableStream) は U7c api-client 内で msw v2 にて済**、E2E では UI レベル検証で十分

#### 2.2.3 persona.spec.ts (Story G1-G6)
- 自分の Persona 作成 → list_my に表示
- 沈黙ドメイン prompt で作成 → rejected_by_moderator で 422 + Toast
- 共有公開 → /personas/shared に匿名化済表示
- Selection 上限 3 ガード (4 個目選択不可)
- 報告 (report) → 閾値到達で auto_block

#### 2.2.4 score.spec.ts (Story C1-C4、ultrathink Imp1: API seed + UI verify hybrid)

```typescript
test("No 5 連発で danger UI 表示", async ({ page, request }) => {
  // ultrathink Imp1: user 操作 5 回より API 直接 seed が高速 (~30s → ~2s)
  for (let i = 0; i < 5; i++) {
    const decision = await request.post("/v1/decisions/request", {
      data: { user_input: `テスト ${i}` },
    });
    const { decision_id } = await decision.json();
    await request.post(`/v1/decisions/${decision_id}/choice`, {
      data: { choice: "no" },
    });
  }
  // UI で danger 表示を verify
  await page.goto("/score");
  await page.waitForSelector('[role="alert"]:has-text("No 連発")');
});
```

- 初期 score (No 0 件) → ratio null → message default
- No 5 連発 (API seed + UI verify hybrid) → danger UI 表示 + 警告メッセージ

#### 2.2.5 voice.spec.ts (Story F1-F4)
- voice backend = mock で /v1/voice/stt 動作確認
- マイク permission 拒否 → error state + text input fallback 動作

---

## 3. Cross-unit Integration test (pytest)

### 3.1 test_decision_to_preference.py (ultrathink I2: sync + eventbridge 両 path)

#### MVP path (event_backend=sync で同期実行、CI 高速)
1. DecisionEngine.run で合議 + apply_choice(yes)
2. SyncEventPublisher が PreferenceProfileBuilder を同期呼び出し
3. 次回 PreferenceLoader で yaml 取得、preference 反映確認

#### prod path 検証 (eventbridge Consumer 直接 test、LocalStack 不要)
```python
# tests/integration/test_consumer_eventbridge_path.py
async def test_consumer_processes_decision_confirmed_event():
    """eventbridge → SQS → Consumer の SQS Consumer 部分を直接 test.

    SQS は LocalStack 不要、Consumer の _process_message を直接呼ぶ.
    """
    consumer = DecisionConfirmedConsumer(
        queue_url="", region="ap-northeast-1",
        decision_repo=mock_decision_repo,
        preference_repo=mock_pref_repo,
    )
    msg_body = json.dumps({
        "decision_id": "...",
        "user_id": "...",
        "choice": "yes",
        # ...
    })
    await consumer._process_message(msg_body)
    # PreferenceProfile が更新されたか mock_pref_repo で verify
```

prod path の SQS message → consumer 受信は staging 環境 manual smoke (k6 等で間接確認) + Consumer ユニット test で十分。

### 3.2 test_persona_blocked_in_decision.py
1. Persona create + block 設定
2. PersonaSelection に blocked persona 含めて set → 422
3. or DecisionEngine `_resolve_personas` で blocked 除外確認

### 3.3 test_voice_to_decision.py
1. /v1/voice/stt (mock) で text 取得
2. /v1/decisions/request に text を input
3. SSE で合議完了

### 3.4 test_score_after_no_streak.py
1. 5 連続 No 採択
2. /v1/scores/me で no_count >= 5 確認

---

## 4. PBT 集約 (Hypothesis / Vitest fast-check)

### 4.1 既存
- U5 builder invariants (`apps/api/tests/property/test_builder_invariants.py`)
- U-Persona catalog invariants (`apps/api/tests/property/test_catalog_invariants.py`)

### 4.2 新規追加
- `test_score_consistency.py`: ratio == no_count / total (boundary 0/0)
- `test_decision_reducer_invariants.ts`: state transition で `input` の長さが ≤ 100,000 保持

---

## 5. Load test (k6)

### 5.1 シナリオ

#### 5.1.1 decision-throughput.js (ultrathink I3: Mock LLM のみ MVP)
- VU 10, duration 1min
- POST /v1/decisions/request (**Mock LLM、stream_delay=200ms** で意図的 latency 注入)
- 目標: p95 < 5 sec、error rate < 1%
- **scope**: MVP は **API 層 throughput のみ計測** (LLM 自体の性能は対象外)
- **実 Bedrock LLM load test** は staging 環境別 workflow (`load-staging.yml`)、Bedrock 料金管理 + retention で別 schedule

#### 5.1.2 sse-concurrent.js
- VU 100 (同時 SSE 接続)
- 各 VU で /v1/decisions/request/stream → event 受信完了まで
- 目標: 95% が 30 sec 以内 complete

#### 5.1.3 persona-list.js
- VU 50, duration 30 sec
- GET /v1/personas/shared (cache hit 想定)
- 目標: p95 < 200 ms

### 5.2 CI 実行

MVP では **手動 trigger** (workflow_dispatch)、prod 負荷検証時に実行。常時 CI では skip (k6 free tier 制限 + 時間)。

---

## 6. Smoke test

```bash
#!/bin/sh
# tests/smoke/smoke.sh
set -e
API="${API_URL:-https://api.yesman.example.com}"

echo "1. /health"
curl -fsS "${API}/health" || exit 1

echo "2. /v1/profiles/me without auth → 401"
status=$(curl -s -o /dev/null -w "%{http_code}" "${API}/v1/profiles/me")
[ "${status}" = "401" ] || exit 1

echo "3. CloudFront index.html"
curl -fsS "${WEB_URL}/" | grep -q "<title>YesMan</title>" || exit 1

echo "Smoke test OK"
```

deploy 後の post-deploy check で実行。

---

## 7. テスト戦略 (合計、ultrathink Imp2: CI time budget)

| 種別 | 場所 | フレームワーク | 件数目安 | CI 実行時間 |
|---|---|---|---|---|
| E2E | `tests/e2e/` | Playwright | 5 spec × 4-6 case = ~25 case | ~5 min |
| Integration | `tests/integration/` | pytest | 4 file × ~5 case = ~20 case | ~2 min |
| PBT | `apps/api/tests/property/` 既存 + 新規 | Hypothesis / fast-check | 2 既存 + 2 新規 | ~30 sec |
| Smoke | `tests/smoke/` | shell | 3 step | ~30 sec |
| **CI 合計** (Load は manual trigger 別 workflow) | - | - | - | **~8 min** |
| Load | `tests/load/` | k6 | 3 シナリオ | manual trigger、~10 min |

**CI 予算**: 10 min 以内に収まる、PR ごとに全 E2E + Integration + PBT + Smoke 実行可能。

---

## 8. 受入基準 (Stage 1 完了)

- [x] E2E: Playwright で 5 user journey 全カバー (UI レベル検証、ultrathink I1)
- [x] Integration: U4 + U5 + U-Persona + U6 + U7d cross-unit flow 4 件 + Consumer 直接 test (ultrathink I2)
- [x] PBT: 既存 2 + 新規 2 = 4 件
- [x] Load: k6 3 シナリオ Mock LLM 限定 MVP (ultrathink I3、実 Bedrock は staging 別)
- [x] Smoke: deploy 後の sanity 3 step
- [x] **Playwright webServer で Docker 不要起動** (ultrathink C1)、Mock everything で portable
- [x] ScorePage E2E は API seed + UI verify hybrid (ultrathink Imp1)
- [x] CI time budget ~8 min (ultrathink Imp2)、10 min 予算内
- [x] ultrathink 全 6 件適用 (Critical 1 + Important 3 + Improvements 2)

## 9. ultrathink 適用ログ (2026-05-16)

### Critical 1
- **C1** (§2.1): Playwright `webServer` config で Docker 不要、Mock backend everywhere で portable + 最小依存

### Important 3
- **I1** (§2.2.2): SSE は UI レベル検証 (utterance bubble DOM 出現)、低レベル EventSource 不確実性回避
- **I2** (§3.1): sync event 同期 path + eventbridge Consumer 直接 test の両 path カバー、LocalStack 不要
- **I3** (§5.1.1): k6 Mock LLM throughput のみ MVP scope、実 Bedrock は staging 別 workflow

### Improvements 2
- **Imp1** (§2.2.4): ScorePage No 5 連発 test を `page.request.post` API seed + UI verify hybrid で高速化 (~30s → ~2s)
- **Imp2** (§7): CI time budget ~8 min (E2E 5 + Integration 2 + PBT 0.5 + Smoke 0.5)、10 min 予算内
