/** E2E auth fixture — MOCK_AUTO_USER で自動認証 (U-Test FD §2.1). */
import type { Page } from "@playwright/test";

/** Default test user seeded into localStorage. AppConfig.mock_user_sub と整合. */
const DEFAULT_SUB = "11111111-1111-1111-1111-111111111111";
const DEFAULT_EMAIL = "test@example.com";
const DEFAULT_DISPLAY_NAME = "テストユーザ";

/**
 * Mock backend (`AUTH_BACKEND=mock` + `MOCK_AUTO_USER=true`) では
 * AuthMiddleware が自動で test user (fixed sub) を request.state.user にセット.
 *
 * Frontend は VITE_AUTH_BYPASS=true でも AuthProvider が
 * mockAuthStorage.getCurrentUser() を読むため、localStorage に MockUser が
 * 居ないと unauthenticated → /auth/splash へ redirect される (PR #11 で Splash 導入後).
 *
 * この fixture は addInitScript で localStorage を seed してから navigate するので、
 * AuthProvider が初期 state から authenticated を返し、Splash gate を回避できる.
 */
export async function gotoAuthenticated(
  page: Page,
  path = "/",
  user: { sub?: string; email?: string; display_name?: string } = {},
) {
  const sub = user.sub ?? DEFAULT_SUB;
  const email = user.email ?? DEFAULT_EMAIL;
  const display_name = user.display_name ?? DEFAULT_DISPLAY_NAME;

  await page.addInitScript(
    ({ sub, email, display_name }) => {
      localStorage.setItem(
        "yesman:mock-auth:users",
        JSON.stringify([
          {
            email,
            display_name,
            sub,
            created_at: new Date().toISOString(),
          },
        ]),
      );
      localStorage.setItem("yesman:mock-auth:current-email", email);
    },
    { sub, email, display_name },
  );

  await page.goto(path);
  await page.waitForLoadState("networkidle");
}
