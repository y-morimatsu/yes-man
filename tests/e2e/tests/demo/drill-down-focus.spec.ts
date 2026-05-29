/**
 * drill-down-focus.spec.ts — YES/NO 深堀り → 外部リンク fokus デモ録画.
 *
 * 流れ:
 *  1. /decision auto-login (mock user)
 *  2. QuickStart → text mode → "映画見たい" 送信
 *  3. 合議 SSE 待ち
 *  4. YES 連打で drill-down chain を可視化 (各段で 1.5s ポーズして breadcrumb を見せる)
 *  5. 最終 YES で popup → Amazon Prime Video URL を 1s screenshot 用に保持
 *  6. 採択 card + 外部サービス CTA を 4s 表示してフィニッシュ
 *
 * 実行:
 *   E2E_VIDEO_ALL=1 RUN_DEMO=1 pnpm --filter @yesman/e2e test tests/demo/drill-down-focus
 */
import { expect, test } from "@playwright/test";
import { gotoAuthenticated } from "../../fixtures/auth";

const RUN_DEMO = !!process.env.RUN_DEMO;
test.skip(!RUN_DEMO, "demo 録画は RUN_DEMO=1 で明示起動");

test.use({
  viewport: { width: 390, height: 844 },
  video: { mode: "on", size: { width: 390, height: 844 } },
});

test("YES/NO 深堀り → 外部リンク demo", async ({ page }) => {
  test.setTimeout(360_000);

  // 1. Splash → /decision
  await gotoAuthenticated(page, "/decision", {}, { skipQuickStart: false });
  await page.waitForTimeout(1200);

  // 2. QuickStart UI → text mode へ
  await expect(page.getByTestId("quickstart-card")).toBeVisible();
  await page.waitForTimeout(1800);
  await page.getByTestId("quickstart-switch-to-text").click();
  await page.waitForTimeout(800);

  // 3. プロンプト入力 (ゆっくりタイプで visual feedback)
  const textbox = page.getByPlaceholder(/今日/);
  await expect(textbox).toBeVisible();
  await textbox.click();
  await page.waitForTimeout(400);
  await textbox.pressSequentially("映画見たい", { delay: 110 });
  await page.waitForTimeout(900);
  await page.getByRole("button", { name: /送信/ }).click();

  // 4. 合議 SSE → proposal card
  await page.waitForSelector('[data-testid="proposal-result-card"]', {
    timeout: 120_000,
  });
  // pink-nudge banner と breadcrumb を見せるため 2s ポーズ
  await page.waitForTimeout(2000);

  // 5. drill-down chain (最大 5 段 Yes)
  for (let step = 1; step <= 5; step++) {
    const yesBtn = page.getByRole("button", { name: /Yes/ }).first();
    if (!(await yesBtn.isVisible().catch(() => false))) break;

    // final 段で popup が開く可能性に備え preempt
    const popupPromise = page
      .context()
      .waitForEvent("page", { timeout: 6_000 })
      .catch(() => null);

    await yesBtn.click();

    // 次提案 (drill-down) か chosen card (final 採択) を待つ
    await Promise.race([
      page.waitForSelector('[data-testid="proposal-result-card"]', {
        state: "visible",
        timeout: 120_000,
      }),
      page.waitForSelector('[data-testid="proposal-result-card-chosen"]', {
        state: "visible",
        timeout: 120_000,
      }),
      page.waitForSelector('[data-testid="external-service-cta"]', {
        state: "visible",
        timeout: 120_000,
      }),
    ]).catch(() => {});

    const popup = await popupPromise;
    if (popup) {
      // 最終 popup を 1.5s 視認させて close (実 URL は Amazon Prime Video)
      const popupUrl = popup.url();
      console.log(`✅ popup opened: ${popupUrl}`);
      await page.waitForTimeout(1500);
      await popup.close().catch(() => {});

      // 戻ってきた main page の external CTA + chain breadcrumb を 4s 表示
      await page.waitForTimeout(4000);
      break;
    }

    // 各 drill-down 後に breadcrumb (これまでの決定) と pink nudge を見せる
    await page.waitForTimeout(2000);
  }

  // 最終 frame をもう 2s 保持
  await page.waitForTimeout(2000);
});
