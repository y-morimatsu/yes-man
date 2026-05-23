/**
 * record-full-tour.mjs — YesMan 全機能網羅ツアー動画 (~160-180s).
 *
 * カバレッジ:
 *   Splash → Sign-in (新規) → Onboarding (性格/生活 swipe) → Home →
 *   Decision (合議 + Drill-down chain 4 段 + service CTA) →
 *   Score → Preference → Personas (list + selection) → Profile
 *
 * 前提:
 * - api (http://localhost:8000) と web (http://localhost:5173) が起動済
 * - api: AUTH_BACKEND=mock, MOCK_AUTO_USER=true, EVENT_BACKEND=inline-async
 * - web: VITE_AUTH_BYPASS=true (mock auth 経由のログイン)
 *
 * 出力:
 * - docs/demo/output/page@<hash>.webm (Playwright 自動命名)
 * - docs/demo/scripts/convert.sh で mp4 + GIF に変換可能
 *
 * 実行:
 *   cd tests/e2e && node scripts/record-full-tour.mjs
 */
import { chromium, devices } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = process.env.DEMO_BASE_URL ?? "http://localhost:5173";
const OUTPUT_DIR = path.resolve(__dirname, "../../../docs/demo/output");

// 毎回 unique email にして onboarding を確実に triggers (per-user 完了フラグの仕様上、
// 同じ email を 2 度 sign-in すると skip される).
const TS = Date.now();
const DEMO_USER = {
  email: `demo-${TS}@yesman.internal`,
  displayName: "ハッカソン デモ",
};

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** SSE proposal が来るのを待つ (要素 testid 経由)、 timeout で fallback. */
async function waitProposal(page, ms = 30_000) {
  await page
    .getByTestId("proposal-arrival-notification")
    .waitFor({ state: "visible", timeout: ms })
    .catch(() => {});
}

/** 提案カード上の「Yes、提案を採択」 button が visible になるまで wait し、click. */
async function clickProposalYes(page) {
  const btn = page.getByRole("button", { name: /Yes、提案を採択/ });
  await btn.waitFor({ state: "visible", timeout: 30_000 }).catch(() => {});
  if (await btn.isVisible().catch(() => false)) {
    await btn.click();
  }
}

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

  // TanStack Query Devtools の overlay が click を intercept する dev mode の挙動を
  // 録画中だけ非表示にする。localStorage を触らないので「addInitScript の
  // page.goto 毎再実行 bug」とは無関係。
  await context.addInitScript(() => {
    const css = ".tsqd-parent-container { display: none !important; }";
    const inject = () => {
      if (!document.head) return false;
      const style = document.createElement("style");
      style.textContent = css;
      document.head.appendChild(style);
      return true;
    };
    if (!inject()) {
      document.addEventListener("DOMContentLoaded", inject);
    }
  });

  const page = await context.newPage();

  // ============================================================
  // §1 Splash (~4s)
  // ============================================================
  console.log("▶ §1: Splash");
  await page.goto(`${BASE_URL}/auth/splash`);
  await page.waitForLoadState("networkidle");
  // ここで localStorage を初期化 (addInitScript 経由は page.goto ごとに走って
  // auth state を消す bug の原因 → 一度だけ evaluate で clear)
  await page
    .evaluate(() => {
      try {
        localStorage.clear();
      } catch {}
    })
    .catch(() => {});
  await pause(4000);

  // ============================================================
  // §2 Sign-in (~8s) — 新規 email
  // ============================================================
  console.log(`▶ §2: Sign-in (${DEMO_USER.email})`);
  const splashSignInBtn = page
    .getByRole("button", { name: /サインイン/ })
    .first();
  if (await splashSignInBtn.isVisible().catch(() => false)) {
    await splashSignInBtn.click();
  } else {
    await page.goto(`${BASE_URL}/auth/signin`);
  }
  await page.waitForLoadState("networkidle");
  await pause(1200);
  await page.getByLabel("Email").fill(DEMO_USER.email);
  await pause(700);
  const displayNameField = page.getByLabel("表示名");
  if (await displayNameField.isVisible().catch(() => false)) {
    await displayNameField.fill(DEMO_USER.displayName);
    await pause(700);
  }
  await page.getByRole("button", { name: /^サインイン$/ }).click();
  // 新規 user は /onboarding に redirect される (per-user 仕様)
  await page.waitForLoadState("networkidle");
  await pause(2000);

  // ============================================================
  // §3 Onboarding (~45s) — 15-18 問 swipe + 「もういい」 skip
  // ============================================================
  console.log("▶ §3: Onboarding (性格 + 生活 swipe)");
  // 確実に /onboarding にいることを確認、いなければ navigate
  if (!page.url().endsWith("/onboarding")) {
    await page.goto(`${BASE_URL}/onboarding`);
    await page.waitForLoadState("networkidle");
  }
  await pause(2500); // 最初の質問カードを見せる

  // 質問を交互に yes/no で答える (デモ用に variation 出す)
  // 18 問答えると確信ライン (25 問の閾値) 手前で 「ある程度 把握」 CTA は未到達。
  // → 18 問は不足、20-21 問にして CTA を出すか、 15 問で skip するか。
  // ベスト: 15 問で skip して 「あとで やる」 CTA を見せ、その後再開して 25 問
  // 到達で「ある程度 把握」 + 「もういい」 CTA に切替を見せる... のは長すぎる。
  //
  // シンプル化: 25 問答えて確信ライン到達 → 「もういい、 進む」 で skip。
  const TOTAL_ONBOARDING_ANSWERS = 25;
  for (let i = 0; i < TOTAL_ONBOARDING_ANSWERS; i++) {
    // pattern: yes / yes / no / yes / yes (no を時々挟む)
    const isNo = i % 5 === 2;
    const labelRegex = isNo ? /No、提案を拒否/ : /Yes、提案を採択/;
    const btn = page.getByRole("button", { name: labelRegex });
    await btn
      .waitFor({ state: "visible", timeout: 5000 })
      .catch(() => {});
    if (await btn.isVisible().catch(() => false)) {
      await btn.click();
    }
    // 答えるたびに次の question にすぐ advance するが、視認用に 600ms 確保
    await pause(600);
  }
  // 「ある程度 把握できました」 + 「もういい、 進む →」 CTA を見せる
  await pause(2500);
  const skipBtn = page.getByTestId("onboarding-skip");
  if (await skipBtn.isVisible().catch(() => false)) {
    await skipBtn.click();
  }
  // submit + /home redirect の遷移演出
  await pause(3500);

  // ============================================================
  // §4 Home メニュー (~7s)
  // ============================================================
  console.log("▶ §4: Home メニュー");
  if (!page.url().endsWith("/")) {
    await page.goto(`${BASE_URL}/`);
    await page.waitForLoadState("networkidle");
  }
  await pause(6500);

  // ============================================================
  // §5 Decision: 合議 + Drill-down chain (~75s)
  // ============================================================
  console.log("▶ §5: Decision (合議 + drill-down chain)");
  const decisionTab = page.getByRole("link", { name: /決定/ }).first();
  if (await decisionTab.isVisible().catch(() => false)) {
    await decisionTab.click();
  } else {
    await page.goto(`${BASE_URL}/decision`);
  }
  await page.waitForLoadState("networkidle");
  await pause(2500); // QuickStart カードを見せる

  // (a) QuickStart Yes → 1 段目 (depth 0) の合議
  console.log("  → QuickStart Yes (depth 0 開始)");
  await clickProposalYes(page);
  await pause(8000); // streaming
  await waitProposal(page);
  await pause(2000); // proposal カード + マスコット を見せる

  // (b) chain step 1 — Yes (depth 0 → 1)
  console.log("  → Yes (drill-down depth 1: service routing 質問期待)");
  await clickProposalYes(page);
  await pause(10000); // 次の chain consensus (depth 1)
  await waitProposal(page);
  await pause(2500); // chain breadcrumb (1 件) + proposal を見せる

  // (c) chain step 2 — Yes (depth 1 → 2)
  console.log("  → Yes (drill-down depth 2: subtype 絞り込み期待)");
  await clickProposalYes(page);
  await pause(10000);
  await waitProposal(page);
  await pause(2500); // breadcrumb (2 件)

  // (d) chain step 3 — Yes (depth 2 → 3 = final)
  console.log("  → Yes (drill-down depth 3: specific instance、final 期待)");
  await clickProposalYes(page);
  await pause(10000);
  await waitProposal(page);
  await pause(2500); // breadcrumb (3 件) + 最終 proposal

  // (e) final Yes → confetti + combo + service CTA
  console.log("  → Final Yes (confetti + 🎬 service CTA)");
  await clickProposalYes(page);
  await pause(3500); // confetti + マスコット + 初期 NudgeBanner
  // service CTA は NudgeBanner の下にあるので軽く scroll してしっかり見せる
  await page.evaluate(() => window.scrollBy({ top: 240, behavior: "smooth" }));
  await pause(4500);

  // ============================================================
  // §6 /score 委任度スコア (~12s)
  // ============================================================
  console.log("▶ §6: /score");
  const scoreTab = page.getByRole("link", { name: /スコア/ }).first();
  if (await scoreTab.isVisible().catch(() => false)) {
    await scoreTab.click();
  } else {
    await page.goto(`${BASE_URL}/score`);
  }
  await page.waitForLoadState("networkidle");
  await pause(4000); // 円グラフ + ピンクバナー
  await page.evaluate(() => window.scrollBy({ top: 400, behavior: "smooth" }));
  await pause(4000);
  await page.evaluate(() => window.scrollBy({ top: 400, behavior: "smooth" }));
  await pause(3000);

  // ============================================================
  // §7 /preference (~8s) — onboarding 反映を確認
  // ============================================================
  console.log("▶ §7: /preference");
  await page.goto(`${BASE_URL}/preference`);
  await page.waitForLoadState("networkidle");
  await pause(4000);
  await page.evaluate(() => window.scrollBy({ top: 400, behavior: "smooth" }));
  await pause(3500);

  // ============================================================
  // §8 /personas (~6s)
  // ============================================================
  console.log("▶ §8: /personas (builtin + 共有プール)");
  await page.goto(`${BASE_URL}/personas`);
  await page.waitForLoadState("networkidle");
  await pause(5500);

  // ============================================================
  // §9 /personas/selection (~6s)
  // ============================================================
  console.log("▶ §9: /personas/selection (Dynamic Routing badge)");
  await page.goto(`${BASE_URL}/personas/selection`);
  await page.waitForLoadState("networkidle");
  await pause(5500);

  // ============================================================
  // §10 /profile (~8s)
  // ============================================================
  console.log("▶ §10: /profile");
  const profileTab = page.getByRole("link", { name: /プロフィール/ }).first();
  if (await profileTab.isVisible().catch(() => false)) {
    await profileTab.click();
  } else {
    await page.goto(`${BASE_URL}/profile`);
  }
  await page.waitForLoadState("networkidle");
  await pause(4500);
  await page.evaluate(() => window.scrollBy({ top: 400, behavior: "smooth" }));
  await pause(3500);

  console.log("✅ tour 完了、context を close して動画を flush");
  await context.close();
  await browser.close();
  console.log(`📹 出力ディレクトリ: ${OUTPUT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
