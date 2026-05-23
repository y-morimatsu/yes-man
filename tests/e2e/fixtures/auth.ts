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
export interface GotoAuthenticatedOptions {
  /**
   * 2026-05-22 yes-no-quickstart: `/decision` を開いたとき DecisionPage は
   * default で QuickStartCard を表示するようになった。既存の e2e は textbox +
   * 「送信」ボタンを期待しているので、ここで自動的に「自分で入力する」を click
   * して text mode に遷移し、既存 spec を変更不要に保つ。
   *
   * 新 QuickStart spec を書く際は `{ skipQuickStart: false }` を指定し、
   * QuickStartCard 自体を assert する。
   */
  skipQuickStart?: boolean;
}

export async function gotoAuthenticated(
  page: Page,
  path = "/",
  user: { sub?: string; email?: string; display_name?: string } = {},
  options: GotoAuthenticatedOptions = {},
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

  if (options.skipQuickStart !== false && path.startsWith("/decision")) {
    const switchLink = page.getByTestId("quickstart-switch-to-text");
    if (await switchLink.isVisible().catch(() => false)) {
      await switchLink.click();
    }
  }
}
