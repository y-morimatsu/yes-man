/**
 * record-tour.mjs — YesMan v0.4.0 全機能ツアー動画録画スクリプト (~90s)。
 *
 * 前提:
 * - api (http://localhost:8000) と web (http://localhost:5173) が起動済
 * - api: AUTH_BACKEND=mock, MOCK_AUTO_USER=true (現在の dev .env 設定)
 * - web: VITE_AUTH_BYPASS=true (現在の dev .env 設定)
 *
 * 出力:
 * - docs/demo/output/<auto>.webm (Playwright 自動命名)
 * - 後段で `scripts/convert.sh` (ffmpeg) で mp4 + GIF に変換可能
 *
 * 実行:
 *   cd tests/e2e && node ../../docs/demo/record-tour.mjs
 */
import { chromium, devices } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = process.env.DEMO_BASE_URL ?? "http://localhost:5173";
// Output to repo-root/docs/demo/output/ (tests/e2e/scripts/ → ../../../docs/demo/output/)
const OUTPUT_DIR = path.resolve(__dirname, "../../../docs/demo/output");

const MOCK_USER = {
  sub: "11111111-1111-1111-1111-111111111111",
  email: "demo@yesman.internal",
  display_name: "ハッカソン デモ",
};

async function seedAuth(page) {
  await page.addInitScript(
    ({ sub, email, display_name }) => {
      localStorage.setItem(
        "yesman:mock-auth:users",
        JSON.stringify([
          { email, display_name, sub, created_at: new Date().toISOString() },
        ]),
      );
      localStorage.setItem("yesman:mock-auth:current-email", email);
      localStorage.removeItem("yesman:quickstart:recent-yes");
      localStorage.removeItem("yesman:yes-combo");
    },
    MOCK_USER,
  );
}

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
  await seedAuth(page);

  console.log("▶ §1: Decision page (QuickStart カード)");
  await page.goto(`${BASE_URL}/decision`);
  await page.waitForLoadState("networkidle");
  await pause(2500);

  console.log("▶ §2: QuickStart → 合議 streaming");
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
  await pause(8000);
  await page
    .getByTestId("proposal-arrival-notification")
    .waitFor({ state: "visible", timeout: 30_000 })
    .catch(() => {
      console.warn("proposal notification not seen in time");
    });
  await pause(2500);

  console.log("▶ §3: 1 回目 Yes 採択 → confetti");
  const yes1 = page.getByRole("button", { name: /Yes、提案を採択/ });
  if (await yes1.isVisible().catch(() => false)) {
    await yes1.click();
  }
  await pause(3000);

  console.log("▶ §4: もう一度 → 2 回目 → combo 🔥");
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
  await pause(4000);

  console.log("▶ §5: /score 委任度スコア");
  await page.goto(`${BASE_URL}/score`);
  await page.waitForLoadState("networkidle");
  await pause(3500);
  await page.evaluate(() => window.scrollBy({ top: 400, behavior: "smooth" }));
  await pause(3500);

  console.log("▶ §6: /preference 嗜好プロファイル");
  await page.goto(`${BASE_URL}/preference`);
  await page.waitForLoadState("networkidle");
  await pause(4500);

  console.log("▶ §7: /personas/selection ペルソナ選択");
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
