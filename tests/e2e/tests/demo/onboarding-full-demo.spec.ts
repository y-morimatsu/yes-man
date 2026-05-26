/**
 * onboarding-full-demo.spec.ts — アプリ起動 (Splash) → 新規ユーザ登録 → onboarding → 全画面 walkthrough.
 *
 * 流れ:
 *  1. localStorage を空にして /auth/splash を開く (新規ユーザ視点)
 *  2. 「はじめる」 → /auth/signin
 *  3. Email + 表示名 入力 → サインイン
 *  4. /onboarding で 3 問だけ Yes/No → 「もういい」 で skip
 *  5. /decision (Home) — QuickStart → 自分で入力 → "映画見たい" → drill-down → 外部リンク
 *  6. /score (YesMan スコア)
 *  7. /persona (知り合い / 私の tab)
 *  8. /profile (Avatar editor + Preferences)
 *
 * 実行:
 *   E2E_VIDEO_ALL=1 RUN_DEMO=1 pnpm --filter @yesman/e2e test tests/demo/onboarding-full-demo
 *
 * Auth bypass mode 前提 (VITE_AUTH_BYPASS=true / dev server default).
 * MOCK_AUTO_USER=true の API 側と一致しない sub になるが、register API は冪等で
 * Profile を生成するので問題なく動作する.
 */
import { expect, test } from "@playwright/test";

const RUN_DEMO = !!process.env.RUN_DEMO;
test.skip(!RUN_DEMO, "demo 録画は RUN_DEMO=1 で明示起動");

test.use({
  viewport: { width: 390, height: 844 },
  video: { mode: "on", size: { width: 390, height: 844 } },
});

const DEMO_EMAIL = `demo-${Date.now()}@example.com`;
const DEMO_NAME = "デモ ユーザ";

test("起動 → 新規登録 → 全画面 walkthrough demo", async ({ page, context }) => {
  test.setTimeout(420_000); // 7 分

  // 0. localStorage / sessionStorage 全消し → 新規ユーザ視点
  await context.clearCookies();
  await page.goto("/auth/splash"); // SplashPage 経由で開始
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  // -----------------------------------------------------------------
  // 1. Splash 画面 — 「はじめる」 ボタンが出るまで再 navigate
  // -----------------------------------------------------------------
  await page.goto("/auth/splash");
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(2200);

  const startBtn = page.getByRole("button", { name: /はじめる/ });
  await expect(startBtn).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(1200);
  await startBtn.click();

  // -----------------------------------------------------------------
  // 2. SignIn 画面 — Email + 表示名 入力
  // -----------------------------------------------------------------
  await expect(page.getByRole("textbox", { name: /Email/i })).toBeVisible({
    timeout: 10_000,
  });
  await page.waitForTimeout(1200);

  await page.getByRole("textbox", { name: /Email/i }).click();
  await page.getByRole("textbox", { name: /Email/i }).pressSequentially(
    DEMO_EMAIL,
    { delay: 60 },
  );
  await page.waitForTimeout(500);

  await page.getByRole("textbox", { name: /表示名/ }).click();
  await page.getByRole("textbox", { name: /表示名/ }).pressSequentially(
    DEMO_NAME,
    { delay: 90 },
  );
  await page.waitForTimeout(900);

  await page.getByRole("button", { name: /^サインイン$/ }).click();

  // -----------------------------------------------------------------
  // 3. Onboarding 嗜好把握 — 3 問だけ Yes/No → skip
  // -----------------------------------------------------------------
  // navigate するまで wait
  await page.waitForURL(/\/onboarding|\/$/, { timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(1500);

  if (/\/onboarding/.test(page.url())) {
    await expect(page.getByTestId("onboarding-page")).toBeVisible({
      timeout: 5_000,
    });
    await page.waitForTimeout(1500);

    // 3 問だけ Yes/No 交互に答える
    for (let i = 0; i < 3; i++) {
      const isYes = i % 2 === 0;
      const btn = page.getByRole("button", {
        name: isYes ? /Yes、提案を採択/ : /No、提案を拒否/,
      });
      if (!(await btn.isVisible().catch(() => false))) break;
      await btn.click();
      await page.waitForTimeout(900);
    }

    // skip button で onboarding 終了
    const skipBtn = page.getByTestId("onboarding-skip");
    if (await skipBtn.isVisible().catch(() => false)) {
      await page.waitForTimeout(800);
      await skipBtn.click();
    }
  }

  // -----------------------------------------------------------------
  // 4. Home (/) — onboarding 後の着地点. home-decide ボタンで /decision に遷移
  // -----------------------------------------------------------------
  await page.waitForURL("/", { timeout: 20_000 }).catch(() => page.goto("/"));
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(2500); // Home 画面 (welcome strip / call card) を見せる

  // home-decide button click → /decision
  const homeDecide = page.getByTestId("home-decide");
  if (await homeDecide.isVisible().catch(() => false)) {
    await page.waitForTimeout(1200);
    await homeDecide.click();
  }
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(1500);

  // QuickStartCard が出れば「自分で入力する」 → text mode
  const qsCard = page.getByTestId("quickstart-card");
  if (await qsCard.isVisible().catch(() => false)) {
    await page.waitForTimeout(1500);
    await page.getByTestId("quickstart-switch-to-text").click();
    await page.waitForTimeout(800);
  }

  const textbox = page.getByPlaceholder(/今日/);
  if (await textbox.isVisible().catch(() => false)) {
    await textbox.click();
    await textbox.pressSequentially("映画見たい", { delay: 110 });
    await page.waitForTimeout(700);
    await page.getByRole("button", { name: /送信/ }).click();

    // 合議 → drill-down
    await page
      .waitForSelector('[data-testid="proposal-result-card"]', { timeout: 120_000 })
      .catch(() => {});
    await page.waitForTimeout(1800);

    for (let step = 1; step <= 5; step++) {
      const yesBtn = page.getByRole("button", { name: /Yes/ }).first();
      if (!(await yesBtn.isVisible().catch(() => false))) break;

      const popupPromise = page
        .context()
        .waitForEvent("page", { timeout: 6_000 })
        .catch(() => null);

      await yesBtn.click();

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
        console.log(`✅ popup opened: ${popup.url()}`);
        await page.waitForTimeout(1500);
        await popup.close().catch(() => {});
        await page.waitForTimeout(3500);
        break;
      }
      await page.waitForTimeout(1800);
    }
  }

  // -----------------------------------------------------------------
  // 5. /score
  // -----------------------------------------------------------------
  await page.goto("/score");
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(3000);

  // -----------------------------------------------------------------
  // 6. /persona — 知り合い / 私の tab
  // -----------------------------------------------------------------
  await page.goto("/persona");
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(1800);

  const friendsTab = page.getByRole("tab", { name: /知り合い/ });
  if (await friendsTab.isVisible().catch(() => false)) {
    await friendsTab.click();
    await page.waitForTimeout(2500);
  }

  const myTab = page.getByRole("tab", { name: /私の|マイ/ });
  if (await myTab.isVisible().catch(() => false)) {
    await myTab.click();
    await page.waitForTimeout(2000);
  }

  // -----------------------------------------------------------------
  // 7. /profile
  // -----------------------------------------------------------------
  await page.goto("/profile");
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(3500);

  // 仕上げに Home に戻る
  await page.goto("/");
  await page.waitForTimeout(2000);
});
