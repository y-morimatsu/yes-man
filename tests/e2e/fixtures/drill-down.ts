/** drill-down helper — Yes 連鎖で最終 (NudgeBanner) まで進める E2E utility.
 *
 * 2026-05-25: root proposal (depth=0) は is_final=false で返り、Yes を押すと
 * chain_context を積んで再 stream が走る。MAX_DRILL_DEPTH=4 のため depth=4 (5 回目の
 * Yes クリック) で NudgeBanner が表示される。
 *
 * 2026-05-26 drill-down-auto-open: 5 回目の Yes は final proposal「XXX で 開きますか?」
 * への採択であり、window.open で外部サイトを新タブで開きつつ NudgeBanner も表示する.
 * popup 発火を assert したい test は本 helper を使わず page.waitForEvent("popup") 経由で
 * 5 click 目を直接呼ぶこと.
 */
import { expect, type Page } from "@playwright/test";

/**
 * Yes ボタンを最大 `maxClicks` 回押して、NudgeBanner heading が出るまで進める。
 * 各 click 後に次 proposal の card が出るのを待ち、NudgeBanner が出た時点で終了。
 */
export async function clickYesUntilNudgeBanner(
  page: Page,
  options: { maxClicks?: number; perStepTimeout?: number } = {},
): Promise<void> {
  const maxClicks = options.maxClicks ?? 8;
  const perStepTimeout = options.perStepTimeout ?? 60_000;
  const nudgeHeading = page.getByRole("heading", {
    name: /Yes 採択|素晴らしい従順さ/,
  });

  for (let i = 0; i < maxClicks; i++) {
    if (await nudgeHeading.isVisible().catch(() => false)) return;
    const yes = page
      .getByRole("button", { name: /Yes/, exact: false })
      .first();
    await yes.click();
    // 次の proposal-card / nudge が出るのを待つ. どちらも来なければ失敗.
    await Promise.race([
      nudgeHeading.waitFor({ timeout: perStepTimeout }).catch(() => undefined),
      page
        .getByTestId("proposal-result-card")
        .waitFor({ timeout: perStepTimeout })
        .catch(() => undefined),
    ]);
    // proposal-card が arrival した直後は state="streaming" → "completed" の繊細な瞬間.
    // Yes button が再 mount されるのを少しだけ待つ.
    await page.waitForTimeout(150);
  }
  await expect(nudgeHeading).toBeVisible({ timeout: perStepTimeout });
}
