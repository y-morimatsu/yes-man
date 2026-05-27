/**
 * typography-redesign-check.spec.ts — 文字サイズ +2px 一括拡大後の視覚確認用 screenshot.
 *
 * mobile viewport 390x844 (iPhone 13) で 5 主要画面を撮影、
 * docs/screens/typography-redesign/ に出力.
 *
 * 実行:
 *   RUN_DEMO=1 pnpm --filter @yesman/e2e test tests/demo/typography-redesign-check --project=mobile-chrome
 */
import { test } from "@playwright/test";
import { gotoAuthenticated } from "../../fixtures/auth";

const RUN_DEMO = !!process.env.RUN_DEMO;
test.skip(!RUN_DEMO, "demo 録画は RUN_DEMO=1 で明示起動");

test.use({ viewport: { width: 390, height: 844 } });

const OUT = "docs/screens/typography-redesign";

test("5 画面を screenshot — typography 拡大後", async ({ page }) => {
  test.setTimeout(120_000);

  // 1. Splash
  await page.goto("/auth/splash");
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `../../${OUT}/01-splash.png`, fullPage: true });

  // 2. SignIn
  await page.goto("/auth/signin");
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `../../${OUT}/02-signin.png`, fullPage: true });

  // 3. Decision (QuickStart)
  await gotoAuthenticated(page, "/decision", {}, { skipQuickStart: false });
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `../../${OUT}/03-decision-quickstart.png`, fullPage: true });

  // 4. Score
  await gotoAuthenticated(page, "/score");
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `../../${OUT}/04-score.png`, fullPage: true });

  // 5. Persona
  await gotoAuthenticated(page, "/persona");
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `../../${OUT}/05-persona.png`, fullPage: true });

  // 6. Profile
  await gotoAuthenticated(page, "/profile");
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `../../${OUT}/06-profile.png`, fullPage: true });
});
