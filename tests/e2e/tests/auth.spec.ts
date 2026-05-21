/** auth.spec.ts — Story A1-A4 (U-Test FD §2.2.1). */
import { expect, test } from "@playwright/test";
import { gotoAuthenticated } from "../fixtures/auth";

test.describe("Auth flow", () => {
  test("Home renders for authenticated user (Mock backend)", async ({ page }) => {
    await gotoAuthenticated(page, "/");
    // Authenticated 時は HomePage Hub Dashboard (5 機能 nav) が表示される.
    // Splash は PR #11 で /auth/splash に分離 (RequireAuth が unauthenticated を redirect).
    await expect(page.getByRole("heading", { name: /合議で決定/ })).toBeVisible();
  });

  test("Profile page accessible after sign-in", async ({ page }) => {
    await gotoAuthenticated(page, "/profile");
    await expect(page.getByRole("heading", { name: /プロフィール/ })).toBeVisible();
  });

  test("Account delete two-step confirmation flow", async ({ page }) => {
    await gotoAuthenticated(page, "/profile");
    await page.getByRole("button", { name: /アカウント削除/ }).first().click();
    // Modal opens with checkbox
    await expect(page.getByText(/上記を理解し/)).toBeVisible();
    // Delete button is disabled until checkbox checked
    const deleteFinal = page.getByRole("button", { name: /完全に削除する/ });
    await expect(deleteFinal).toBeDisabled();
    // Cancel works
    await page.getByRole("button", { name: /キャンセル/ }).click();
    await expect(page.getByText(/上記を理解し/)).not.toBeVisible();
  });
});
