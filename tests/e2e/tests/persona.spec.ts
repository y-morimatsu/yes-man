/** persona.spec.ts — Story G1-G6 (U-Test FD §2.2.3). */
import { expect, test } from "@playwright/test";
import { gotoAuthenticated } from "../fixtures/auth";

test.describe("Persona management", () => {
  test("PersonaListPage tabs render", async ({ page }) => {
    await gotoAuthenticated(page, "/personas");
    await expect(page.getByRole("heading", { name: /ペルソナ管理/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /自分の Persona/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /共有プール/ })).toBeVisible();
  });

  test("Create persona modal opens + closes", async ({ page }) => {
    await gotoAuthenticated(page, "/personas");
    await page.getByRole("button", { name: /＋ 新規/ }).click();
    await expect(page.getByText(/新規ペルソナ作成/)).toBeVisible();
    await page.getByRole("button", { name: /キャンセル/ }).click();
    await expect(page.getByText(/新規ペルソナ作成/)).not.toBeVisible();
  });

  test("Selection page renders + 上限 3 ガード message", async ({ page }) => {
    await gotoAuthenticated(page, "/personas/selection");
    await expect(page.getByRole("heading", { name: /ペルソナ選択/ })).toBeVisible();
    await expect(page.getByText(/0 \/ 3|選択中:/)).toBeVisible();
  });
});
