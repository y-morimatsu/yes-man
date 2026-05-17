/**
 * env.ts — typed environment variable accessor (NFR Design §5 + ultrathink I1).
 *
 * production-strict: 起動時に required env 欠落で throw、main.tsx で早期失敗.
 * test 環境では tests/setup.ts の vi.stubEnv で全 env を fixture 設定済.
 */

function required(key: string): string {
  const value = import.meta.env[key];
  if (!value || typeof value !== "string") {
    throw new Error(`Missing required env: ${key}`);
  }
  return value;
}

export const env = {
  apiBaseUrl: required("VITE_API_BASE_URL"),
  cognitoRegion: required("VITE_COGNITO_REGION"),
  cognitoUserPoolId: required("VITE_COGNITO_USER_POOL_ID"),
  cognitoAppClientId: required("VITE_COGNITO_APP_CLIENT_ID"),
  cognitoHostedUiUrl: required("VITE_COGNITO_HOSTED_UI_URL"),
  appVersion: (import.meta.env.VITE_APP_VERSION as string) ?? "dev",
  isDev: import.meta.env.DEV,
  // E2E / dev 用: Cognito を bypass し AuthProvider を強制 authenticated 化.
  // backend 側 MOCK_AUTO_USER と対称、Cognito 未設定の e2e 環境で /v1 API を素通り可能化.
  authBypass: import.meta.env.VITE_AUTH_BYPASS === "true",
  mockUserSub:
    (import.meta.env.VITE_MOCK_USER_SUB as string) ??
    "11111111-1111-1111-1111-111111111111",
  mockUserEmail:
    (import.meta.env.VITE_MOCK_USER_EMAIL as string) ?? "test@example.com",
};
