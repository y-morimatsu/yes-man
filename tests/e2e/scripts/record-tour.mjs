/**
 * record-tour.mjs — YesMan v0.4.0 全機能ツアー動画録画スクリプト (~110-130s)。
 *
 * Login から始める版 (2026-05-23 改修):
 *   Splash → Sign-in → Home → Decision (合議×2、combo 🔥) → Score → Preference → Profile → Persona
 *
 * 前提:
 * - api (http://localhost:8000) と web (http://localhost:5173) が起動済
 * - api: AUTH_BACKEND=mock, MOCK_AUTO_USER=true (現在の dev .env 設定)
 * - web: VITE_AUTH_BYPASS=true (mock auth でログインフロー動作可)
 *
 * 出力:
 * - docs/demo/output/page@<hash>.webm (Playwright 自動命名)
 * - 後段で `docs/demo/scripts/convert.sh` (ffmpeg) で mp4 + GIF に変換
 *
 * 実行:
 *   cd tests/e2e && node scripts/record-tour.mjs
 */
import { chromium, devices } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = process.env.DEMO_BASE_URL ?? "http://localhost:5173";
const OUTPUT_DIR = path.resolve(__dirname, "../../../docs/demo/output");

const DEMO_USER = {
  email: "demo@yesman.internal",
  displayName: "ハッカソン デモ",
};

// 注: fresh context は元々 localStorage 空。
// addInitScript で clear() を仕込むと page.goto() ごとに auth state が消える bug の原因になるため使わない。

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ...devices["Pixel 5"],
    recordVideo: {
      dir: OUTPUT_DIR,
      size: { width: 393, height: 851 },
    },
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
  });

  const page = await context.newPage();
  // ============================================================
  // §1 Splash (~4s)
  // ============================================================
  console.log("▶ §1: Splash");
  await page.goto(`${BASE_URL}/auth/splash`);
  await page.waitForLoadState("networkidle");
  await pause(4000);

  // ============================================================
  // §2 Sign-in (~8s)
  // ============================================================
  console.log("▶ §2: Sign-in");
  // Splash には CTA「サインインへ」button があるので click
  const signInLink = page.getByRole("button", { name: /サインイン/ }).first();
  if (await signInLink.isVisible().catch(() => false)) {
    await signInLink.click();
  } else {
    // fallback: 直接 navigate
    await page.goto(`${BASE_URL}/auth/signin`);
  }
  await page.waitForLoadState("networkidle");
  await pause(1500);

  // Email + display name 入力 → サインイン
  await page.getByLabel("Email").fill(DEMO_USER.email);
  await pause(700);
  const displayNameField = page.getByLabel("表示名");
  if (await displayNameField.isVisible().catch(() => false)) {
    await displayNameField.fill(DEMO_USER.displayName);
    await pause(700);
  }
  await page.getByRole("button", { name: /^サインイン$/ }).click();
  await page.waitForLoadState("networkidle");
  await pause(2500);

  // ============================================================
  // §3 Home メニュー (~6s)
  // ============================================================
  console.log("▶ §3: Home メニュー");
  // sign-in 後は /decision に redirect されるので、明示的に Home (/) へ navigate
  await page.goto(`${BASE_URL}/`);
  await page.waitForLoadState("networkidle");
  await pause(5500);

  // ============================================================
  // §4 Decision: QuickStart → 合議 streaming (~28s)
  // ============================================================
  console.log("▶ §4: 合議で決定 (1 回目)");
  // BottomNav の「💭 決定」or Home の「合議で決定」 link で /decision に
  const decisionTab = page.getByRole("link", { name: /決定/ }).first();
  if (await decisionTab.isVisible().catch(() => false)) {
    await decisionTab.click();
  } else {
    await page.goto(`${BASE_URL}/decision`);
  }
  await page.waitForLoadState("networkidle");
  await pause(2500); // QuickStart カードを見せる

  // QuickStart Yes (1 回目)
  const quickYes1 = page.getByRole("button", { name: /Yes、提案を採択/ });
  if (await quickYes1.isVisible().catch(() => false)) {
    await quickYes1.click();
  } else {
    const inputBox = page.getByPlaceholder(/今日/);
    if (await inputBox.isVisible().catch(() => false)) {
      await inputBox.fill("今日のランチを決めて");
      await page.getByRole("button", { name: /送信/ }).click();
    }
  }
  await pause(8000); // 議論中 streaming (token + typing dots)
  await page
    .getByTestId("proposal-arrival-notification")
    .waitFor({ state: "visible", timeout: 30_000 })
    .catch(() => console.warn("proposal notification not seen in time"));
  await pause(2500);

  // 提案カード Yes 採択
  console.log("▶ §5: 1 回目 Yes → confetti");
  const yes1 = page.getByRole("button", { name: /Yes、提案を採択/ });
  if (await yes1.isVisible().catch(() => false)) {
    await yes1.click();
  }
  await pause(3000);

  // ============================================================
  // §6 もう一度 → 2 回目 → combo 🔥 (~20s)
  // ============================================================
  console.log("▶ §6: 2 回目 → combo 🔥");
  const resetBtn = page.getByRole("button", { name: /もう一度/ });
  if (await resetBtn.isVisible().catch(() => false)) {
    await resetBtn.click();
  } else {
    await page.goto(`${BASE_URL}/decision`);
  }
  await pause(1500);

  const quickYes2 = page.getByRole("button", { name: /Yes、提案を採択/ });
  if (await quickYes2.isVisible().catch(() => false)) {
    await quickYes2.click();
  }
  await pause(9000);
  await page
    .getByTestId("proposal-arrival-notification")
    .waitFor({ state: "visible", timeout: 30_000 })
    .catch(() => {});
  await pause(2000);
  const yes2 = page.getByRole("button", { name: /Yes、提案を採択/ });
  if (await yes2.isVisible().catch(() => false)) {
    await yes2.click();
  }
  await pause(4000); // 🔥 combo + 強化 confetti

  // ============================================================
  // §7 /score 委任度スコア (~8s)
  // ============================================================
  console.log("▶ §7: /score 委任度スコア");
  const scoreTab = page.getByRole("link", { name: /スコア/ }).first();
  if (await scoreTab.isVisible().catch(() => false)) {
    await scoreTab.click();
  } else {
    await page.goto(`${BASE_URL}/score`);
  }
  await page.waitForLoadState("networkidle");
  await pause(3500);
  await page.evaluate(() => window.scrollBy({ top: 400, behavior: "smooth" }));
  await pause(3500);

  // ============================================================
  // §8 /preference 嗜好プロファイル (~6s)
  // ============================================================
  console.log("▶ §8: /preference 嗜好プロファイル");
  await page.goto(`${BASE_URL}/preference`);
  await page.waitForLoadState("networkidle");
  await pause(5000);

  // ============================================================
  // §9 /profile プロフィール (~6s)
  // ============================================================
  console.log("▶ §9: /profile プロフィール");
  const profileTab = page.getByRole("link", { name: /プロフィール/ }).first();
  if (await profileTab.isVisible().catch(() => false)) {
    await profileTab.click();
  } else {
    await page.goto(`${BASE_URL}/profile`);
  }
  await page.waitForLoadState("networkidle");
  await pause(5500);

  // ============================================================
  // §10 /personas/selection ペルソナ選択 (~5s)
  // ============================================================
  console.log("▶ §10: /personas/selection");
  await page.goto(`${BASE_URL}/personas/selection`);
  await page.waitForLoadState("networkidle");
  await pause(4500);

  console.log("✅ tour 完了、context を close して動画を flush");
  await context.close();
  await browser.close();
  console.log(`📹 出力ディレクトリ: ${OUTPUT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
