/**
 * capture-current-screens.mjs — 現状実装の全画面を Playwright で screenshot.
 *
 * 2026-05-24 final UI state を反映:
 *   - Home: 委任率 strip 先頭 + 決めてもらう人 card (入力 box 廃止)
 *   - Persona Selection: 3-tab (ビルトイン / 世界の誰か / カスタム) + 「＋ 新規」 modal
 *   - Decision: MangaStage theme color + click focus + 完了 header
 *   - Yes 採択後: overlay 「決まったこと」 read-only card 残置
 *   - Score: 過去の傾向 (PreferenceTrends embed)
 *   - Profile: ProfileCard 統合 + Avatar editor
 *
 * 前提:
 *   - api (http://localhost:8000) と web (http://localhost:5173) が起動済
 *   - api: AUTH_BACKEND=mock, MOCK_AUTO_USER=true
 *   - web: VITE_AUTH_BYPASS=true
 *
 * 実行:
 *   cd tests/e2e && node scripts/capture-current-screens.mjs
 *
 * 出力:
 *   docs/screens/current/01-splash.png ... 20-profile-edit.png
 */
import { chromium, devices } from "@playwright/test";
import { mkdir, rm } from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = process.env.DEMO_BASE_URL ?? "http://localhost:5173";
const OUT_DIR = path.resolve(__dirname, "../../../docs/screens/current");

const TS = Date.now();
const DEMO_USER = {
  email: `screen-cap-${TS}@yesman.internal`,
  displayName: "キャプチャ",
};

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function shoot(page, name) {
  const out = path.join(OUT_DIR, `${name}.png`);
  await page.screenshot({ path: out, fullPage: false });
  console.log(`📸 ${name}.png`);
}

async function shootFull(page, name) {
  const out = path.join(OUT_DIR, `${name}.png`);
  await page.screenshot({ path: out, fullPage: true });
  console.log(`📸 ${name}.png (full)`);
}

async function waitProposal(page, ms = 30_000) {
  await page
    .getByTestId("proposal-arrival-notification")
    .waitFor({ state: "visible", timeout: ms })
    .catch(() => {});
}

async function clickProposalYes(page) {
  const btn = page.getByRole("button", { name: /Yes、提案を採択/ });
  await btn.waitFor({ state: "visible", timeout: 30_000 }).catch(() => {});
  if (await btn.isVisible().catch(() => false)) {
    await btn.click();
  }
}

async function safeClick(locator) {
  if (await locator.isVisible().catch(() => false)) {
    await locator.click().catch(() => {});
  }
}

async function main() {
  // clean output dir
  await rm(OUT_DIR, { recursive: true, force: true });
  await mkdir(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ...devices["Pixel 5"],
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
  });

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
  // §1 Splash
  // ============================================================
  console.log("▶ §1: Splash");
  await page.goto(`${BASE_URL}/auth/splash`);
  await page.waitForLoadState("networkidle");
  await page
    .evaluate(() => {
      try {
        localStorage.clear();
      } catch {}
    })
    .catch(() => {});
  await pause(2000);
  await shoot(page, "01-splash");

  // ============================================================
  // §2 Sign-in
  // ============================================================
  console.log("▶ §2: Sign-in");
  const splashSignInBtn = page
    .getByRole("button", { name: /サインイン/ })
    .first();
  if (await splashSignInBtn.isVisible().catch(() => false)) {
    await splashSignInBtn.click();
  } else {
    await page.goto(`${BASE_URL}/auth/signin`);
  }
  await page.waitForLoadState("networkidle");
  await pause(1500);
  await shoot(page, "02-signin-empty");

  await page.getByLabel("Email").fill(DEMO_USER.email);
  await pause(500);
  const displayNameField = page.getByLabel("表示名");
  if (await displayNameField.isVisible().catch(() => false)) {
    await displayNameField.fill(DEMO_USER.displayName);
    await pause(500);
  }
  await shoot(page, "03-signin-filled");

  await page.getByRole("button", { name: /^サインイン$/ }).click();
  await page.waitForLoadState("networkidle");
  await pause(2500);

  // ============================================================
  // §3 Onboarding (最初の 1 問だけ capture)
  // ============================================================
  console.log("▶ §3: Onboarding (1 問目)");
  if (!page.url().endsWith("/onboarding")) {
    await page.goto(`${BASE_URL}/onboarding`);
    await page.waitForLoadState("networkidle");
  }
  await pause(2500);
  await shoot(page, "04-onboarding-q1");

  // 10 問だけ素早く答えて skip
  for (let i = 0; i < 10; i++) {
    const isNo = i % 4 === 2;
    const labelRegex = isNo ? /No、提案を拒否/ : /Yes、提案を採択/;
    const btn = page.getByRole("button", { name: labelRegex });
    await btn.waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
    if (await btn.isVisible().catch(() => false)) {
      await btn.click();
    }
    await pause(300);
  }
  await pause(1500);
  const skipBtn = page.getByTestId("onboarding-skip");
  if (await skipBtn.isVisible().catch(() => false)) {
    await shoot(page, "05-onboarding-skip-available");
    await skipBtn.click();
  } else {
    await page.goto(`${BASE_URL}/`);
  }
  await pause(2500);

  // ============================================================
  // §4 Home — 委任率 strip 先頭
  // ============================================================
  console.log("▶ §4: Home");
  if (!page.url().endsWith("/")) {
    await page.goto(`${BASE_URL}/`);
    await page.waitForLoadState("networkidle");
  }
  await pause(3000);
  await shoot(page, "06-home");
  await shootFull(page, "06-home-full");

  // ============================================================
  // §5 Persona Selection — 3-tab
  // ============================================================
  console.log("▶ §5: Persona Selection");
  const personaTab = page.getByRole("link", { name: /ペルソナ/ }).first();
  if (await personaTab.isVisible().catch(() => false)) {
    await personaTab.click();
  } else {
    await page.goto(`${BASE_URL}/personas/selection`);
  }
  await page.waitForLoadState("networkidle");
  await pause(3000);
  await shoot(page, "07-persona-selection-builtin");

  // 世界の誰か タブ
  await safeClick(page.getByTestId("persona-source-tab-anonymous"));
  await pause(2500);
  await shoot(page, "08-persona-selection-anonymous");

  // カスタム タブ (empty)
  await safeClick(page.getByTestId("persona-source-tab-my"));
  await pause(2000);
  await shoot(page, "09-persona-selection-custom-empty");

  // ＋ 新規 modal
  await safeClick(page.getByTestId("selection-create-persona"));
  await pause(2000);
  await shoot(page, "10-persona-create-modal-empty");

  // 入力済み modal
  const nameInput = page.locator('label:has-text("名前") input').first();
  if (await nameInput.isVisible().catch(() => false)) {
    await nameInput.fill("おばあちゃん");
    await pause(300);
  }
  const descInput = page.locator('label:has-text("説明") input').first();
  if (await descInput.isVisible().catch(() => false)) {
    await descInput.fill("やさしく見守ってくれる相談相手");
    await pause(300);
  }
  const promptTextarea = page
    .locator('label:has-text("プロンプト指示文") textarea')
    .first();
  if (await promptTextarea.isVisible().catch(() => false)) {
    await promptTextarea.fill(
      "あなたは何十年も人生経験を積んだやさしいおばあちゃんです。" +
        "若い人の悩みを温かく受け止め、決断を そっと後押ししてください。" +
        "無理せず、自分のペースで決めて大丈夫だよ、と伝えてください。",
    );
    await pause(800);
  }
  await shoot(page, "11-persona-create-modal-filled");

  // 保存 → my タブに自動切替
  const saveBtn = page.getByRole("button", { name: /^保存$/ }).first();
  if (await saveBtn.isVisible().catch(() => false)) {
    await saveBtn.click();
  }
  await pause(3500);
  await shoot(page, "12-persona-selection-custom-with-item");

  // ビルトイン 3 人選択して 決定 (合議用)
  await safeClick(page.getByTestId("persona-source-tab-builtin"));
  await pause(1000);
  await safeClick(page.getByRole("button", { name: /リセット/ }).first());
  await pause(1000);
  const builtinCards = page.locator(
    '[role="tabpanel"]#persona-panel-builtin article',
  );
  const count = await builtinCards.count();
  for (let i = 0; i < Math.min(count, 3); i++) {
    await builtinCards.nth(i).click().catch(() => {});
    await pause(300);
  }
  await pause(800);
  await shoot(page, "13-persona-selection-3-selected");
  await safeClick(page.getByTestId("selection-confirm"));
  await pause(2000);

  // ============================================================
  // §6 Decision — 合議
  // ============================================================
  console.log("▶ §6: Decision");
  const decideBtn = page.getByTestId("home-decide");
  if (await decideBtn.isVisible().catch(() => false)) {
    await decideBtn.click();
  } else {
    await page.goto(`${BASE_URL}/decision`);
  }
  await page.waitForLoadState("networkidle");
  await pause(2500);
  await shoot(page, "14-decision-quickstart");

  await clickProposalYes(page);
  await pause(5000); // streaming
  await shoot(page, "15-decision-streaming");

  await waitProposal(page);
  await pause(2500);
  await shoot(page, "16-decision-proposal-arrived");

  // 過去 bubble click で前面化 (新機能)
  const bubble0 = page.getByTestId("manga-bubble-0");
  if (await bubble0.isVisible().catch(() => false)) {
    await bubble0.click().catch(() => {});
    await pause(1500);
    await shoot(page, "17-decision-bubble-clicked-focus");
  }

  // Yes 採択 → overlay 「決まったこと」 残置
  await clickProposalYes(page);
  await pause(3500);
  await shoot(page, "18-decision-yes-residual");
  await page.evaluate(() => window.scrollBy({ top: 320, behavior: "smooth" }));
  await pause(2500);
  await shoot(page, "19-decision-yes-nudge-banner");
  await shootFull(page, "19-decision-yes-full");

  // ============================================================
  // §7 Score — 過去の傾向 embed
  // ============================================================
  console.log("▶ §7: Score");
  const onceMore = page.getByRole("button", { name: /もう一度/ }).first();
  if (await onceMore.isVisible().catch(() => false)) {
    await onceMore.click();
  } else {
    await page.goto(`${BASE_URL}/`);
  }
  await pause(2000);
  const scoreTab = page.getByRole("link", { name: /スコア/ }).first();
  if (await scoreTab.isVisible().catch(() => false)) {
    await scoreTab.click();
  } else {
    await page.goto(`${BASE_URL}/score`);
  }
  await page.waitForLoadState("networkidle");
  await pause(3500);
  await shoot(page, "20-score-top");
  await shootFull(page, "20-score-full");

  // ============================================================
  // §8 Profile — ProfileCard + Avatar
  // ============================================================
  console.log("▶ §8: Profile");
  const profileTab = page.getByRole("link", { name: /プロフィール/ }).first();
  if (await profileTab.isVisible().catch(() => false)) {
    await profileTab.click();
  } else {
    await page.goto(`${BASE_URL}/profile`);
  }
  await page.waitForLoadState("networkidle");
  await pause(3000);
  await shoot(page, "21-profile-view");
  await shootFull(page, "21-profile-full");

  // 編集モード
  const editBtn = page.getByRole("button", { name: /編集/ }).first();
  if (await editBtn.isVisible().catch(() => false)) {
    await editBtn.click();
    await pause(2500);
    await shoot(page, "22-profile-edit");
    await shootFull(page, "22-profile-edit-full");
    const cancelBtn = page.getByRole("button", { name: /キャンセル/ }).first();
    if (await cancelBtn.isVisible().catch(() => false)) {
      await cancelBtn.click();
    }
  }

  // ============================================================
  // §9 Personas (管理画面 /personas)
  // ============================================================
  console.log("▶ §9: /personas (管理)");
  await page.goto(`${BASE_URL}/personas`);
  await page.waitForLoadState("networkidle");
  await pause(2500);
  await shoot(page, "23-personas-list");

  console.log("✅ 全画面 capture 完了");
  await context.close();
  await browser.close();
  console.log(`📁 出力先: ${OUT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
