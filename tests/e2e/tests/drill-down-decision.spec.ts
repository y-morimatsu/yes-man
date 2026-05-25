/** drill-down-decision.spec.ts — 2026-05-25 自動深堀り検証 (MAX_DRILL_DEPTH=4).
 *
 * 仕様:
 *  - depth=0 root proposal は is_final=false で返る
 *  - Yes 連鎖で depth 0→1→2→3→4 まで進行、depth=4 (= MAX) で is_final=true + NudgeBanner + 外部 CTA
 *  - chain-breadcrumb には これまでの選択履歴 が並ぶ
 *  - mock LLM の DRILL_DOWN_PROPOSALS に合わせ、最終 proposal は Amazon Prime Video カテゴリに
 *    ヒットする (固有名 + Amazon Prime Video の CTA が出る)
 */
import { expect, test } from "@playwright/test";
import { gotoAuthenticated } from "../fixtures/auth";

test.describe("drill-down decision (Yes 連鎖)", () => {
  test("Yes 1 回目で chain breadcrumb + drill-down 再 stream が起動", async ({ page }) => {
    await gotoAuthenticated(page, "/decision");
    await page.getByPlaceholder(/今日/).fill("暇つぶしに何しよう");
    await page.getByRole("button", { name: /送信/ }).click();

    // root proposal arrival
    await expect(page.getByTestId("proposal-result-card")).toBeVisible({
      timeout: 90_000,
    });

    // chain breadcrumb は depth=0 では非表示
    await expect(page.getByTestId("drill-down-chain")).toBeHidden();

    // Yes クリック → 次段 stream が起動 (proposal-result-card が re-mount される)
    await page
      .getByRole("button", { name: /Yes/, exact: false })
      .first()
      .click();

    // chain breadcrumb が出現する (これまでの 1 件)
    await expect(page.getByTestId("drill-down-chain")).toBeVisible({
      timeout: 60_000,
    });

    // 次段の proposal が arrival (proposal-arrival-notification が 2 回目発火)
    await expect(page.getByTestId("proposal-result-card")).toBeVisible({
      timeout: 60_000,
    });
  });

  test("Yes 5 連打で final → NudgeBanner + 外部 service CTA (Amazon Prime Video)", async ({ page }) => {
    await gotoAuthenticated(page, "/decision");
    await page.getByPlaceholder(/今日/).fill("暇つぶしに何しよう");
    await page.getByRole("button", { name: /送信/ }).click();

    // root proposal arrival
    await expect(page.getByTestId("proposal-result-card")).toBeVisible({
      timeout: 90_000,
    });

    // 5 段 drill-down (depth 0→4). 各 Yes 後に次 card / nudge を待つ.
    const nudgeHeading = page.getByRole("heading", {
      name: /Yes 採択|素晴らしい従順さ/,
    });
    for (let i = 0; i < 7; i++) {
      if (await nudgeHeading.isVisible().catch(() => false)) break;
      const yes = page
        .getByRole("button", { name: /Yes/, exact: false })
        .first();
      await yes.click();
      // 次の card もしくは nudge を待つ
      await Promise.race([
        nudgeHeading.waitFor({ timeout: 60_000 }).catch(() => undefined),
        page
          .getByTestId("proposal-result-card")
          .waitFor({ timeout: 60_000 })
          .catch(() => undefined),
      ]);
      await page.waitForTimeout(150);
    }

    // NudgeBanner 出現
    await expect(nudgeHeading).toBeVisible({ timeout: 30_000 });

    // 外部 service CTA が visible (mock proposal が "Amazon Prime" を含むため movie カテゴリ → Amazon Prime Video)
    const cta = page.getByTestId("external-service-cta");
    await expect(cta).toBeVisible({ timeout: 10_000 });
    const href = await cta.getAttribute("href");
    expect(href).toContain("amazon.co.jp");

    // chain breadcrumb には 4 件のノード (root + 3 中間段)
    const chain = page.getByTestId("drill-down-chain");
    await expect(chain).toBeVisible();
    const nodeCount = await chain
      .locator("span.rounded-md")
      .count();
    expect(nodeCount).toBeGreaterThanOrEqual(4);
  });
});
