/** decision.spec.ts — Story B1-B6 (U-Test FD §2.2.2 + ultrathink I1: UI レベル検証). */
import { expect, test } from "@playwright/test";
import { gotoAuthenticated } from "../fixtures/auth";
import { clickYesUntilNudgeBanner } from "../fixtures/drill-down";

test.describe("Decision flow", () => {
  test("DecisionPage renders with input + start button", async ({ page }) => {
    await gotoAuthenticated(page, "/decision");
    await expect(page.getByRole("heading", { name: /何を きめますか/ })).toBeVisible();
    await expect(page.getByPlaceholder(/今日/)).toBeVisible();
    await expect(page.getByRole("button", { name: /送信/ })).toBeVisible();
  });

  test("Start button disabled when input empty", async ({ page }) => {
    await gotoAuthenticated(page, "/decision");
    await expect(page.getByRole("button", { name: /送信/ })).toBeDisabled();
  });

  test("Decision streaming → utterance bubbles → Yes 連鎖で drill-down → NudgeBanner", async ({ page }) => {
    // 2026-05-25 A 案 revert: depth=0 は is_final=false で返るため、Yes は drill-down 経路.
    // 4 段目 (depth=3) で NudgeBanner が出る.
    await gotoAuthenticated(page, "/decision");
    await page.getByPlaceholder(/今日/).fill("ランチ何にする");
    await page.getByRole("button", { name: /送信/ }).click();
    // Mock LLM の utterance バブル DOM 出現を待つ (SSE event 完了)
    await page.waitForSelector('[role="article"]', { timeout: 90_000 });
    // 初回 Yes ボタン表示 (root proposal 完了)
    await expect(
      page.getByRole("button", { name: /Yes/, exact: false }),
    ).toBeVisible({ timeout: 120_000 });
    // Yes を連打して 4 段 drill-down → 最終で NudgeBanner
    await clickYesUntilNudgeBanner(page);
    // nudge banner 表示確認 (heading に絞ることで "YesMan" link との strict mode 衝突を回避)
    await expect(
      page.getByRole("heading", { name: /Yes 採択/ }),
    ).toBeVisible({ timeout: 60_000 });
  });
});
