/**
 * full-feature-demo.spec.ts — YesMan ハッカソンデモ用 全機能 walkthrough 録画.
 *
 * 目的:
 *   - Decision (合議 + drill-down + 外部サービス open) → スコア → ペルソナ → プロフィール
 *     の主要画面を 1 連続フローで通し、Playwright の video=on 機能で webm 録画する.
 *   - 出力先: tests/e2e/test-results/<dir>/video.webm
 *     postprocess script (scripts/convert-demo-video.sh) で mp4 化 + docs/presentation/videos/ に配置.
 *
 * 実行:
 *   E2E_VIDEO_ALL=1 RUN_DEMO=1 pnpm --filter @yesman/e2e test tests/demo/full-feature-demo
 *
 * Mock LLM 想定 (Playwright webServer config の MOCK_LLM_PERSONA_DELAY_SECONDS=0.5).
 * 実 LLM (gpt-5.4-nano 等) が 8000 で動いている場合は reuseExistingServer で再利用、
 * その場合 streaming 待ちが長くなるので各 waitForSelector の timeout に余裕を持たせる.
 */
import { expect, test } from "@playwright/test";
import { gotoAuthenticated } from "../../fixtures/auth";

const RUN_DEMO = !!process.env.RUN_DEMO;
test.skip(!RUN_DEMO, "demo 録画は RUN_DEMO=1 で明示起動");

// 録画スクリーンの aspect (mobile-first app, iPhone 14 程度)
test.use({
  viewport: { width: 390, height: 844 },
  video: {
    mode: "on",
    size: { width: 390, height: 844 },
  },
});

test("YesMan 全機能 walkthrough demo", async ({ page }) => {
  test.setTimeout(360_000); // 6 分 (real LLM 経路でも余裕)

  // -----------------------------------------------------------------
  // 1. Splash / login (mock auto-user) → /decision
  // -----------------------------------------------------------------
  await gotoAuthenticated(page, "/decision", {}, { skipQuickStart: false });
  await page.waitForTimeout(800);

  // -----------------------------------------------------------------
  // 2. QuickStartCard 表示 → 自分で入力に切替
  // -----------------------------------------------------------------
  await expect(page.getByTestId("quickstart-card")).toBeVisible();
  await page.waitForTimeout(1500); // QuickStart UI を viewer に見せる
  await page.getByTestId("quickstart-switch-to-text").click();
  await page.waitForTimeout(600);

  // -----------------------------------------------------------------
  // 3. プロンプト入力 → 合議開始 → drill-down chain
  // -----------------------------------------------------------------
  const textbox = page.getByPlaceholder(/今日/);
  await expect(textbox).toBeVisible();
  await textbox.fill("映画見たい");
  await page.waitForTimeout(600);
  await page.getByRole("button", { name: /送信/ }).click();

  // 合議 streaming (real LLM だと 10-30s, mock だと ~2s)
  await page.waitForSelector('[data-testid="proposal-result-card"]', {
    timeout: 90_000,
  });
  await page.waitForTimeout(1500);

  // drill-down: 最大 4 回 Yes → final
  for (let step = 1; step <= 4; step++) {
    // 次の Yes button (SwipeChoice fallback) を click
    const yesBtn = page.getByRole("button", { name: /Yes/ }).first();
    if (!(await yesBtn.isVisible())) break;
    await yesBtn.click();

    // popup (Amazon Prime Video) を消すため preempt — final step だけ起こる
    const popupPromise = page.context().waitForEvent("page", { timeout: 5_000 }).catch(() => null);

    // 次提案 or chosen card を待つ
    await Promise.race([
      page.waitForSelector('[data-testid="proposal-result-card"]', {
        state: "visible",
        timeout: 90_000,
      }),
      page.waitForSelector('[data-testid="proposal-result-card-chosen"]', {
        state: "visible",
        timeout: 90_000,
      }),
    ]).catch(() => {});

    const popup = await popupPromise;
    if (popup) {
      // final 段 — popup タブを即 close (ネットワーク副作用回避)
      await popup.close().catch(() => {});
      // 採択 UI を 2.5s 鑑賞して break (chain 完了)
      await page.waitForTimeout(2500);
      break;
    }
    await page.waitForTimeout(1200);
  }

  // 採択結果 + 外部サービス CTA を 3s 表示
  await page.waitForTimeout(3000);

  // -----------------------------------------------------------------
  // 4. YesMan スコア画面
  // -----------------------------------------------------------------
  await page.goto("/score");
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(2500);

  // -----------------------------------------------------------------
  // 5. ペルソナ画面 — 知り合い / 私の / 共有 を巡回
  // -----------------------------------------------------------------
  await page.goto("/persona");
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(1500);

  // 知り合い tab (anonymous pool)
  const friendsTab = page.getByRole("tab", { name: /知り合い/ });
  if (await friendsTab.isVisible().catch(() => false)) {
    await friendsTab.click();
    await page.waitForTimeout(2000);
  }

  // 私の tab
  const myTab = page.getByRole("tab", { name: /私の|マイ/ });
  if (await myTab.isVisible().catch(() => false)) {
    await myTab.click();
    await page.waitForTimeout(1500);
  }

  // -----------------------------------------------------------------
  // 6. プロフィール画面 — avatar editor + preferences
  // -----------------------------------------------------------------
  await page.goto("/profile");
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(3000);

  // -----------------------------------------------------------------
  // 7. Home に戻ってフィニッシュ
  // -----------------------------------------------------------------
  await page.goto("/");
  await page.waitForTimeout(2000);
});
