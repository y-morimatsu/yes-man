/**
 * Playwright config (U-Test NFR Design §2 + ultrathink C1/I1/I2 整合).
 */
import { defineConfig, devices } from "@playwright/test";

const isCI = !!process.env.CI;

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: isCI,
  // 実 LLM (LiteLLM/Bedrock) 経由の e2e は first-token latency 10-30s + 全 streaming 30-90s
  // が普通。Mock では <1s だが、両用に十分なマージンを取って test 全体 timeout を 5 分に.
  timeout: 300_000,
  expect: { timeout: 30_000 },
  // ultrathink NFR Req I2: CI のみ retries:1、retry > 5% で要監視
  retries: isCI ? 1 : 0,
  // ultrathink NFR Req I1: 環境別 worker 数
  workers: isCI ? 2 : 4,
  reporter: [
    ["html", { open: "never" }],
    ["json", { outputFile: "playwright-report/results.json" }],
    isCI ? ["github"] : ["list"],
  ],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:5173",
    trace: process.env.E2E_TRACE_ALL ? "on" : "on-first-retry",
    screenshot: process.env.E2E_SCREENSHOT_ALL ? "on" : "only-on-failure",
    video: process.env.E2E_VIDEO_ALL ? "on" : "retain-on-failure",
    // SLOW_MO=300 (ms) 等で env 経由 slow-mo (headed 観察用、CI では未設定で 0)
    launchOptions: {
      slowMo: process.env.SLOW_MO ? Number(process.env.SLOW_MO) : 0,
    },
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
        // Mock LLM に per-persona delay を入れて LIVE badge / chat-like timing を観測可能にする.
        // 0.5s × 3 persona + proposal = ~2s 程度の合議時間、e2e で stream 期間が assert 可能.
        MOCK_LLM_PERSONA_DELAY_SECONDS: "0.5",
        VOICE_BACKEND: "mock",
        EVENT_BACKEND: "sync",
        LEARNING_CONSUMER_ENABLED: "false",
        MOCK_AUTO_USER: "true",
        SILENCE_HASH_SALT: "e2e-salt",
        PERSONA_ANONYMIZER_SALT: "e2e-persona-salt",
        // E2E: web (5173) → api (8000) cross-origin を許可 (pydantic-settings は list[str] を JSON parse)
        CORS_ALLOWED_ORIGINS: '["http://localhost:5173"]',
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
        // E2E: backend MOCK_AUTO_USER と対称、AuthProvider を強制 authenticated 化
        VITE_AUTH_BYPASS: "true",
        VITE_MOCK_USER_SUB: "11111111-1111-1111-1111-111111111111",
        VITE_MOCK_USER_EMAIL: "test@example.com",
      },
      reuseExistingServer: !isCI,
      timeout: 60_000,
    },
  ],
  // INCEPTION drawio mockup は 280×520 phone aspect ratio で設計されている.
  // Primary viewport は mobile (iPhone 13: 390×844 = 1:2.16、drawio 比率 1:1.86 に近い).
  // Mobile Chrome (Pixel 5) を使うことで実機 PWA 利用を再現.
  projects: [
    {
      name: "mobile-chrome",
      use: { ...devices["Pixel 5"] },
    },
  ],
});
