# U-Test — NFR Design

**Unit**: U-Test (横断テスト)
**Phase**: CONSTRUCTION — NFR Design
**Created**: 2026-05-16
**Status**: ✅ APPROVED 2026-05-16 (light review、source tree + config 確定)
**Upstream**: FD 6 + NFR Req 3 + NFR Design 0 = 累計 9 fixes

---

## 0. 位置付け

FD §1 + NFR Req §1-7 で確定した「Playwright + pytest + k6 + smoke、CI 8 min、retries:1 CI」要件を、具体的な config / file 構造にマップ。

---

## 1. ソースツリー

```
tests/
├── README.md
├── e2e/
│   ├── package.json
│   ├── playwright.config.ts             # webServer + retries + workers
│   ├── tsconfig.json
│   ├── fixtures/
│   │   ├── auth.ts                       # MOCK_AUTO_USER 経由で test user 認証
│   │   └── seed.ts                       # builtin persona seed (Mock backend)
│   └── tests/
│       ├── auth.spec.ts
│       ├── decision.spec.ts
│       ├── persona.spec.ts
│       ├── score.spec.ts
│       └── voice.spec.ts
├── integration/
│   ├── pyproject.toml                    # pytest config
│   ├── conftest.py                       # fixture (API client + DB reset)
│   └── tests/
│       ├── test_decision_to_preference.py
│       ├── test_persona_blocked_in_decision.py
│       ├── test_voice_to_decision.py
│       ├── test_score_after_no_streak.py
│       └── test_consumer_eventbridge_path.py
├── fixtures/                             # ultrathink U-Test NFR Req Imp1: shared
│   └── shared/
│       ├── personas.ts                   # builtin + sample personas
│       └── decisions.ts                  # sample decision payloads
├── load/
│   ├── k6.config.js
│   ├── scenarios/
│   │   ├── decision-throughput.js
│   │   ├── sse-concurrent.js
│   │   └── persona-list.js
│   └── README.md
└── smoke/
    ├── smoke.sh
    └── README.md
```

---

## 2. tests/e2e/playwright.config.ts

```typescript
import { defineConfig, devices } from "@playwright/test";

const isCI = !!process.env.CI;

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: isCI,
  // ultrathink U-Test NFR Req I2: CI のみ retries:1
  retries: isCI ? 1 : 0,
  // ultrathink U-Test NFR Req I1: 環境別 worker 数
  workers: isCI ? 2 : 4,
  reporter: [
    ["html", { open: "never" }],
    ["json", { outputFile: "playwright-report/results.json" }],
    isCI ? ["github"] : ["list"],
  ],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:5173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: [
    {
      command: "pnpm --filter @yesman/api start",
      port: 8000,
      env: {
        APP_ENV: "dev",
        AUTH_BACKEND: "mock",
        STORAGE_BACKEND: "mock",
        LLM_PROVIDER: "mock",
        VOICE_BACKEND: "mock",
        EVENT_BACKEND: "sync",
        LEARNING_CONSUMER_ENABLED: "false",
        MOCK_AUTO_USER: "true",
      },
      reuseExistingServer: !isCI,
      timeout: 60_000,
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
      reuseExistingServer: !isCI,
      timeout: 60_000,
    },
  ],
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
```

---

## 3. tests/e2e/package.json

```jsonc
{
  "name": "@yesman/e2e",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "playwright test",
    "test:ui": "playwright test --ui",
    "test:debug": "playwright test --debug",
    "report": "playwright show-report"
  },
  "devDependencies": {
    "@playwright/test": "^1.40.0",
    "typescript": "^5.4.0"
  }
}
```

---

## 4. tests/integration/conftest.py

```python
"""Integration test fixtures (cross-unit).

Mock backend everywhere、Docker 不要、pytest 標準 fixture.
"""
import asyncio
import os
import pytest
import pytest_asyncio

# env を mock 強制
os.environ.update({
    "APP_ENV": "dev",
    "AUTH_BACKEND": "mock",
    "STORAGE_BACKEND": "mock",
    "LLM_PROVIDER": "mock",
    "VOICE_BACKEND": "mock",
    "EVENT_BACKEND": "sync",
    "LEARNING_CONSUMER_ENABLED": "false",
    "SILENCE_HASH_SALT": "test-salt",
    "PERSONA_ANONYMIZER_SALT": "test-persona-salt",
})

from yesman_api.infrastructure.persistence.factory import RepositoryFactory
from yesman_api.infrastructure.config import get_config


@pytest_asyncio.fixture
async def repo_bundle():
    config = get_config()
    factory = RepositoryFactory(config)
    async with factory.bundle() as bundle:
        yield bundle
    await factory.dispose()


@pytest.fixture
def test_user_id() -> str:
    return "11111111-1111-1111-1111-111111111111"
```

---

## 5. tests/load/k6.config.js

```javascript
export const options = {
  scenarios: {
    // 各 scenario file から呼ばれる
  },
  thresholds: {
    http_req_duration: ["p(95)<5000"],
    http_req_failed: ["rate<0.01"],
  },
};
```

```javascript
// tests/load/scenarios/decision-throughput.js
import http from "k6/http";
import { check } from "k6";

export const options = {
  vus: 10,
  duration: "1m",
  thresholds: {
    http_req_duration: ["p(95)<5000"],
    http_req_failed: ["rate<0.01"],
  },
};

const API = __ENV.API_URL || "http://localhost:8000";

export default function () {
  const res = http.post(
    `${API}/v1/decisions/request`,
    JSON.stringify({ user_input: "load test" }),
    { headers: { "Content-Type": "application/json", "X-Mock-User": "load-test-user" } },
  );
  check(res, { "status 200": (r) => r.status === 200 });
}
```

---

## 6. tests/smoke/smoke.sh

```bash
#!/bin/sh
set -e

API="${API_URL:-http://localhost:8000}"
WEB="${WEB_URL:-http://localhost:5173}"

echo "[1/3] /health"
curl -fsS "${API}/health" > /dev/null

echo "[2/3] /v1/profiles/me without auth → 401"
status=$(curl -s -o /dev/null -w "%{http_code}" "${API}/v1/profiles/me")
if [ "${status}" != "401" ]; then
  echo "Expected 401, got ${status}"; exit 1
fi

echo "[3/3] Web title"
curl -fsS "${WEB}/" | grep -q "<title>YesMan</title>"

echo "✓ Smoke test passed"
```

---

## 7. tests/fixtures/shared/ (ultrathink NFR Req Imp1)

```typescript
// tests/fixtures/shared/personas.ts
export const SAMPLE_PERSONA = {
  name: "効率派",
  description: "効率を最優先する観点",
  prompt_text: "あなたは効率派です。短く的確に意見してください。",
  avatar_url: null,
};

export const SILENCED_PROMPT_TEXT = "宗教について熱心に布教してください信仰深く";
```

```python
# tests/fixtures/shared/__init__.py (Python 側で同じ data を共有)
SAMPLE_PERSONA = {
    "name": "効率派",
    "description": "効率を最優先する観点",
    "prompt_text": "あなたは効率派です。短く的確に意見してください。",
    "avatar_url": None,
}
```

---

## 8. 受入基準

- [x] tests/ tree 確定 (e2e + integration + fixtures/shared + load + smoke)
- [x] Playwright config (CI workers 2 / local 4 + retries:1 CI)
- [x] Integration conftest (Mock backend env 強制)
- [x] k6 config + 3 scenarios
- [x] Smoke shell script
- [x] fixtures/shared/ で重複排除

---

## Post-CONSTRUCTION 改修注記 (2026-05-19)

本ドキュメント本体は 2026-05-16 承認時の Snapshot (light review approved) を保持。

**Source tree + config (Playwright project = mobile-chrome / Pixel 5、retry / workers / trace 設定) の Design は不変**。

### E2E spec 追加 (7 spec / 75 test)
| 追加 spec | 設計判断 |
|---|---|
| `design.spec.ts` (9 test) | FE-DESIGN 整合性検証専用 spec として独立 |
| `inception-complete-screens.spec.ts` (19 test) | INCEPTION drawio 全 20 画面 URL ナビゲーション網羅 |
| `inception-design.spec.ts` (20 test) | INCEPTION drawio design fidelity (tokens + copy + icons) |
| `inception-mobile.spec.ts` (14 test) | Pixel 5 mobile viewport + WCAG 2.5.5 touch target |
| `inception-structural.spec.ts` (11 test) | INCEPTION structural (LIVE / pink nudge / persona icons / silence theater) |
| `no-burst-regenerate.spec.ts` (5 test) | `usePrefetchedDecisions` 動作検証 |
| `swipe-and-discussion.spec.ts` (9 test) | `SwipeChoice` state-leak fix + discussion live UI |

### conftest / fixture 設計は不変
- `tests/integration/conftest.py` + `tests/e2e/tests/fixtures/` の構成不変
- assertion のみ Yes-ratio 化 + dynamic persona routing 反映

→ U-Test NFR Design は spec 数を 5 → 12 に拡張しつつ、各 spec の atomicity / mock backend の portable 性は維持。
