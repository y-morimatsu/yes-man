/**
 * tests/setup.ts — vitest global setup (U7a + U7d).
 *
 * ultrathink:
 * - U7a NFR Design I1: vi.stubEnv で env を test 用 fixture 設定
 * - U7a NFR Design I3: aws-amplify mock を tests/mocks/ から取り込み
 * - U7d Code Gen Plan I2: getUserMedia mock 追加 (voice tests 用)
 * - mock-auth Task 1: Node 22+ built-in localStorage は .clear() を持たないため
 *   jsdom の window.localStorage で上書き (Node 25 + vitest 2.x 互換対応)
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

// Node 22+ では global.localStorage が node:internal/webstorage を指し、
// .clear() を持たない。vitest 2.x + jsdom 環境での互換対応として
// in-memory localStorage を global に設定する。
(function patchLocalStorage() {
  const store: Record<string, string> = {};
  const mock = {
    getItem: (key: string) => (key in store ? store[key] : null),
    setItem: (key: string, value: string) => { store[key] = String(value); },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { Object.keys(store).forEach(k => delete store[k]); },
    get length() { return Object.keys(store).length; },
    key: (n: number) => Object.keys(store)[n] ?? null,
  };
  // Only patch if current localStorage.clear is not a function
  try {
    if (typeof localStorage.clear !== "function") {
      Object.defineProperty(globalThis, "localStorage", {
        configurable: true,
        writable: true,
        value: mock,
      });
    }
  } catch {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      writable: true,
      value: mock,
    });
  }
}());

vi.stubEnv("VITE_API_BASE_URL", "http://localhost:8000");
vi.stubEnv("VITE_COGNITO_REGION", "ap-northeast-1");
vi.stubEnv("VITE_COGNITO_USER_POOL_ID", "ap-northeast-1_test");
vi.stubEnv("VITE_COGNITO_APP_CLIENT_ID", "test-client");
vi.stubEnv("VITE_COGNITO_HOSTED_UI_URL", "https://test.auth.example.com");
vi.stubEnv("VITE_APP_VERSION", "test");

import "./mocks/aws-amplify";

// ultrathink U7d Code Gen Plan I2: getUserMedia mock (voice tests 用)
Object.defineProperty(navigator, "mediaDevices", {
  writable: true,
  configurable: true,
  value: {
    getUserMedia: vi.fn().mockResolvedValue({
      getTracks: () => [{ stop: vi.fn() }],
    }),
  },
});

// MediaRecorder mock (jsdom 未実装)
class MockMediaRecorder {
  state = "inactive";
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  constructor(public stream: MediaStream) {}
  start() {
    this.state = "recording";
  }
  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["fake-audio"]) });
    this.onstop?.();
  }
}
(globalThis as unknown as { MediaRecorder: typeof MockMediaRecorder }).MediaRecorder =
  MockMediaRecorder;

afterEach(() => cleanup());
