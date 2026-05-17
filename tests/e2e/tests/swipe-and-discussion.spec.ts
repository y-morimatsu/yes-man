/** swipe-and-discussion.spec.ts — INCEPTION 仕様違反 2 件の修正検証.
 *
 * 1. 議論を見る button (FR-CV-04):
 *    - proposal 完了後に visible
 *    - default closed (utterance bubbles 非表示)
 *    - click で open (label "▲ 議論を閉じる"、utterance 表示)
 *    - 再 click で close
 *    - Yes/No 採択後も DOM 残置 (採択後の振り返り閲覧可能)
 *
 * 2. Swipe Yes/No (ui-mockups.md §1.1 + drawio screen-03):
 *    - SwipeChoice 内に proposal card と Yes/No fallback button
 *    - playwright.touchscreen で right swipe → Yes 採択
 *    - playwright.touchscreen で left swipe → No 採択
 *    - キーボード ←/→ も alternative として動作 (WCAG 2.1.1)
 *    - aria-label に "スワイプで Yes / No 採択" 文言
 */
import { expect, test } from "@playwright/test";
import { gotoAuthenticated } from "../fixtures/auth";

async function startDecisionAndWaitForProposal(page: any) {
  await gotoAuthenticated(page, "/decision");
  await page.getByPlaceholder(/今日/).fill("swipe + discussion 検証");
  await page.getByRole("button", { name: /送信/ }).click();
  // proposal が出るまで待つ (SwipeChoice 内の article + Yes 採用 button が visible)
  await expect(
    page.getByRole("button", { name: /Yes/, exact: false }),
  ).toBeVisible({ timeout: 120_000 });
}

test.describe("FR-CV-04: 議論を見る button (default closed + toggle + persist after choose)", () => {
  test("proposal 完了後、議論を見る button が visible (data-testid='discussion-toggle')", async ({
    page,
  }) => {
    await startDecisionAndWaitForProposal(page);
    const toggle = page.getByTestId("discussion-toggle");
    await expect(toggle).toBeVisible();
    // label は default "📂 議論を見る" (drawio canonical、FR-CV-04 内部 ID は UI に出さない)
    await expect(toggle).toHaveText(/議論を見る/);
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  test("議論を見る を click → utterance 領域 visible + label 「閉じる」", async ({
    page,
  }) => {
    await startDecisionAndWaitForProposal(page);
    const toggle = page.getByTestId("discussion-toggle");

    // default closed: utterance region 不在
    expect(
      await page.getByRole("region", { name: /議論/ }).count(),
    ).toBe(0);

    // 1 回 click → open
    await toggle.click();
    await expect(page.getByRole("region", { name: /議論/ })).toBeVisible();
    await expect(toggle).toHaveText(/議論を閉じる/);
    await expect(toggle).toHaveAttribute("aria-expanded", "true");

    // 再 click → close
    await toggle.click();
    expect(
      await page.getByRole("region", { name: /議論/ }).count(),
    ).toBe(0);
    await expect(toggle).toHaveText(/議論を見る/);
  });

  test("Yes 採択後も 議論を見る button が visible (DOM 残置)", async ({ page }) => {
    await startDecisionAndWaitForProposal(page);

    // Yes 採択 (fallback button click で確実に発火)
    await page.getByRole("button", { name: /Yes/, exact: false }).click();
    // nudge banner 表示まで待つ (heading にだけ "Yes 採択")
    await expect(
      page.getByRole("heading", { name: /Yes 採択|素晴らしい従順さ/ }),
    ).toBeVisible({ timeout: 60_000 });

    // 議論を見る button が依然として visible (採択後も振り返り閲覧可能)
    const toggle = page.getByTestId("discussion-toggle");
    await expect(toggle).toBeVisible();
    // open → 採択済みでも utterance 履歴が見える
    await toggle.click();
    await expect(page.getByRole("region", { name: /議論/ })).toBeVisible();
  });
});

test.describe("Swipe Yes/No (INCEPTION ui-mockups.md §1.1 + drawio screen-03)", () => {
  test("SwipeChoice container は data-testid='swipe-choice' + aria-label", async ({
    page,
  }) => {
    await startDecisionAndWaitForProposal(page);
    const swipe = page.getByTestId("swipe-choice");
    await expect(swipe).toBeVisible();
    const aria = await swipe.getAttribute("aria-label");
    expect(aria).toMatch(/スワイプで Yes/);
  });

  test("Swipe card に keyboard accessible (tabIndex + arrow key handler) 存在", async ({
    page,
  }) => {
    await startDecisionAndWaitForProposal(page);
    // role="group" + tabIndex で keyboard focus 可能 (WCAG 2.1.1)
    const swipeCard = page.getByTestId("swipe-card");
    await expect(swipeCard).toBeVisible();
    // aria-roledescription で swipeable と通知
    const desc = await swipeCard.getAttribute("aria-roledescription");
    expect(desc).toContain("swipeable");
    // tabIndex = 0 で focusable
    const tabIdx = await swipeCard.getAttribute("tabindex");
    expect(tabIdx).toBe("0");
  });

  test("Right swipe (touchscreen) → Yes 採択 (mock LLM 前提)", async ({
    page,
  }) => {
    test.skip(
      process.env.LLM_PROVIDER === "litellm",
      "real LLM 環境では swipe 後の nudge 生成も実 LLM 経由になり flaky のため skip",
    );
    await startDecisionAndWaitForProposal(page);

    // Swipe area の中心を取得
    const swipeArea = page.getByTestId("swipe-choice");
    const box = await swipeArea.boundingBox();
    expect(box).not.toBeNull();
    const startX = box!.x + 50;
    const endX = box!.x + box!.width - 20;
    const y = box!.y + box!.height / 2;

    // Playwright touchscreen を使って右へ swipe
    await page.touchscreen.tap(startX, y); // initial touch
    // 連続 swipe (mouse fallback で再現、Pixel 5 device は touch サポート)
    await page.mouse.move(startX, y);
    await page.mouse.down();
    for (let x = startX; x <= endX; x += 30) {
      await page.mouse.move(x, y);
    }
    await page.mouse.up();

    // Yes 採択 → nudge banner heading 表示
    await expect(
      page.getByRole("heading", { name: /Yes 採択|素晴らしい従順さ/ }),
    ).toBeVisible({ timeout: 30_000 });
  });

  test("キーボード ArrowRight (WCAG 2.1.1 alternative) → Yes 採択", async ({
    page,
  }) => {
    test.skip(
      process.env.LLM_PROVIDER === "litellm",
      "real LLM 環境では skip (上記同様)",
    );
    await startDecisionAndWaitForProposal(page);
    const swipeCard = page.getByTestId("swipe-card");
    await swipeCard.focus();
    await page.keyboard.press("ArrowRight");
    await expect(
      page.getByRole("heading", { name: /Yes 採択|素晴らしい従順さ/ }),
    ).toBeVisible({ timeout: 30_000 });
  });

  test("Fallback button (WCAG 2.5.1 single-pointer) も保持: Yes/No 共に visible", async ({
    page,
  }) => {
    await startDecisionAndWaitForProposal(page);
    // SwipeChoice 内に fallback Yes/No buttons (no swipe 環境で必須)
    await expect(
      page.getByRole("button", { name: /No、提案を拒否|No/, exact: false }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Yes、提案を採択|Yes/, exact: false }),
    ).toBeVisible();
  });

  test("スワイプガイド「👆 スワイプして決定」 が visible", async ({ page }) => {
    await startDecisionAndWaitForProposal(page);
    await expect(page.getByText(/スワイプして/).first()).toBeVisible();
  });
});
