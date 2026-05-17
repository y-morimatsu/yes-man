/** E2E auth fixture — MOCK_AUTO_USER で自動認証 (U-Test FD §2.1). */
import type { Page } from "@playwright/test";

/**
 * Mock backend (`AUTH_BACKEND=mock` + `MOCK_AUTO_USER=true`) では
 * AuthMiddleware が自動で test user (fixed sub) を request.state.user にセット.
 * E2E ではこの fixture を呼ぶだけで認証済 page を準備可能.
 */
export async function gotoAuthenticated(page: Page, path = "/") {
  await page.goto(path);
  // AuthProvider が refresh 完了するまで待つ
  await page.waitForLoadState("networkidle");
}
