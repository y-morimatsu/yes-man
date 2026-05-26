/** drill-down-decision.spec.ts — 2026-05-25 自動深堀り検証 (MAX_DRILL_DEPTH=4).
 *
 * 仕様:
 *  - depth=0 root proposal は is_final=false で返る
 *  - Yes 連鎖で depth 0→1→2→3→4 まで進行、depth=4 (= MAX) で is_final=true + NudgeBanner + 外部 CTA
 *  - chain-breadcrumb には これまでの選択履歴 が並ぶ
 *  - mock LLM の DRILL_DOWN_PROPOSALS に合わせ、最終 proposal は Amazon Prime Video カテゴリに
 *    ヒットする (固有名 + Amazon Prime Video の CTA が出る)
 *
 * 2026-05-26 drill-down-auto-open (FR-DAO-01/02/09):
 *  - final proposal text は疑問形「XXX で 開きますか?」で終わる (mock: DRILL_DOWN_PROPOSALS[4])
 *  - 5 回目の Yes で `page.waitForEvent("popup")` が fire し、URL に amazon.co.jp/Amazon-Video を含む
 *  - popup tab は即 close して network 副作用回避
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

  test("Yes 5 連打で final → 疑問形 proposal + popup 自動 open + NudgeBanner + CTA fallback", async ({ page }) => {
    await gotoAuthenticated(page, "/decision");
    await page.getByPlaceholder(/今日/).fill("暇つぶしに何しよう");
    await page.getByRole("button", { name: /送信/ }).click();

    // root proposal arrival
    await expect(page.getByTestId("proposal-result-card")).toBeVisible({
      timeout: 90_000,
    });

    // 2026-05-26 drill-down-auto-open: 4 段 drill-down で final card まで進める (Yes 4 click).
    // 5 回目の Yes は別途 page.waitForEvent("popup") とともに発火させる.
    const nudgeHeading = page.getByRole("heading", {
      name: /Yes 採択|素晴らしい従順さ/,
    });
    let finalReached = false;
    for (let i = 0; i < 6; i++) {
      // 既に final 段 card かどうか: proposal-result-card の text に「開きますか」が含まれるか確認
      const cardText = await page
        .getByTestId("proposal-result-card")
        .innerText()
        .catch(() => "");
      if (cardText.includes("開きますか")) {
        finalReached = true;
        break;
      }
      // まだ drill-down 中なら Yes を 1 回押して次段を待つ
      const yes = page
        .getByRole("button", { name: /Yes/, exact: false })
        .first();
      await yes.click();
      await page
        .getByTestId("proposal-result-card")
        .waitFor({ timeout: 60_000 })
        .catch(() => undefined);
      await page.waitForTimeout(150);
    }
    expect(finalReached, "final 段の card が表示されるまでに 6 click 以内で到達").toBe(true);

    // FR-DAO-01: final proposal は疑問形「開きますか?」で終わる
    const finalText = await page.getByTestId("proposal-result-card").innerText();
    expect(finalText).toMatch(/開きますか[??]/);

    // NFR-DAO-10: Yes button aria-label に "新しいタブ" が含まれる (a11y semantic)
    const yesBtnFinal = page.locator('button[aria-label*="新しいタブ"]').first();
    await expect(yesBtnFinal).toBeVisible({ timeout: 5_000 });

    // FR-DAO-02/03/09 + NFR-DAO-06: 5 回目の Yes click で popup (window.open) が fire.
    // ultrathink review DAO-RVW-001 fix: page.waitForEvent("popup") + popup.waitForURL で
    // about:blank race condition を回避し、確実に navigated URL を検証する.
    const [popup] = await Promise.all([
      page.waitForEvent("popup", { timeout: 10_000 }),
      yesBtnFinal.click(),
    ]);
    await popup
      .waitForURL(/amazon\.co\.jp/, { timeout: 5_000 })
      .catch(() => undefined); // network 制限環境では catch して下の expect で fail させる
    expect(popup.url()).toContain("amazon.co.jp");
    await popup.close(); // network 副作用回避

    // NudgeBanner 出現 (元タブ)
    await expect(nudgeHeading).toBeVisible({ timeout: 30_000 });

    // FR-DAO-04 + NFR-DAO-01: 外部 CTA button が fallback として依然 visible
    const cta = page.getByTestId("external-service-cta");
    await expect(cta).toBeVisible({ timeout: 10_000 });
    const href = await cta.getAttribute("href");
    expect(href).toContain("amazon.co.jp");

    // chain breadcrumb には 4 件のノード (root + 3 中間段)
    const chain = page.getByTestId("drill-down-chain");
    await expect(chain).toBeVisible();
    const nodeCount = await chain.locator("span.rounded-md").count();
    expect(nodeCount).toBeGreaterThanOrEqual(4);
  });
});
