/**
 * record-full-tour-v2.mjs — YesMan 全機能網羅ツアー動画 v2 (~200-220s).
 *
 * v1 (record-full-tour.mjs) に加え、2026-05-24 以降の新機能を網羅:
 *   - Home: 委任率 strip が先頭、入力 box は廃止
 *   - Persona selection: 3-tab (ビルトイン / 世界の誰か / カスタム)
 *     + 「＋ 新規」 modal → custom persona 作成 → my タブへ自動切替
 *   - MangaStage: persona theme color (sky/amber/violet) + click to focus
 *   - StageHeader: 完了後「結論 / N 人の意見が まとまりました」
 *   - DecisionResult: Yes 採択後も overlay に「決まったこと」 read-only card 残置
 *   - Score: 「📊 過去の傾向」 (PreferenceTrends embed)
 *   - Profile: ProfileCard 統合 + Avatar / AvatarEditor
 *
 * カバレッジ:
 *   Splash → Sign-in (新規) → Onboarding (skip) → Home (委任率 top) →
 *   Persona Selection (3-tab + create modal) →
 *   Decision (合議 + bubble click + StageHeader 完了 + Yes 残置) →
 *   Score (過去の傾向 embed) → Profile (avatar 編集)
 *
 * 前提:
 * - api (http://localhost:8000) と web (http://localhost:5173) が起動済
 * - api: AUTH_BACKEND=mock, MOCK_AUTO_USER=true
 * - web: VITE_AUTH_BYPASS=true
 *
 * 実行:
 *   cd tests/e2e && node scripts/record-full-tour-v2.mjs
 *
 * 出力:
 *   docs/demo/output/<auto>.webm
 *   convert: docs/demo/scripts/convert.sh
 */
import { chromium, devices } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = process.env.DEMO_BASE_URL ?? "http://localhost:5173";
const OUTPUT_DIR = path.resolve(__dirname, "../../../docs/demo/output");

const TS = Date.now();
const DEMO_USER = {
  email: `demo-v2-${TS}@yesman.internal`,
  displayName: "ツアー v2",
};

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

async function clickProposalNo(page) {
  const btn = page.getByRole("button", { name: /No、提案を拒否/ });
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

  // TanStack Query Devtools の overlay を録画中だけ非表示.
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
  await page
    .evaluate(() => {
      try {
        localStorage.clear();
      } catch {}
    })
    .catch(() => {});
  await pause(4000);

  // ============================================================
  // §2 Sign-in (~8s)
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
  await page.waitForLoadState("networkidle");
  await pause(2000);

  // ============================================================
  // §3 Onboarding (~25s) — 短縮版 (10 問のみ → skip)
  // ============================================================
  console.log("▶ §3: Onboarding (短縮 10 問 + skip)");
  if (!page.url().endsWith("/onboarding")) {
    await page.goto(`${BASE_URL}/onboarding`);
    await page.waitForLoadState("networkidle");
  }
  await pause(2500);

  const ONBOARDING_QUICK = 10;
  for (let i = 0; i < ONBOARDING_QUICK; i++) {
    const isNo = i % 4 === 2;
    const labelRegex = isNo ? /No、提案を拒否/ : /Yes、提案を採択/;
    const btn = page.getByRole("button", { name: labelRegex });
    await btn.waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
    if (await btn.isVisible().catch(() => false)) {
      await btn.click();
    }
    await pause(500);
  }
  // skip CTA があれば押す
  const skipBtn = page.getByTestId("onboarding-skip");
  await pause(2000);
  if (await skipBtn.isVisible().catch(() => false)) {
    await skipBtn.click();
  } else {
    // fallback: 直接 Home へ
    await page.goto(`${BASE_URL}/`);
  }
  await pause(3000);

  // ============================================================
  // §4 Home — 委任率 strip top + welcome (~6s)
  // ============================================================
  console.log("▶ §4: Home (委任率 strip 先頭 + 決めてもらう人 card)");
  if (!page.url().endsWith("/")) {
    await page.goto(`${BASE_URL}/`);
    await page.waitForLoadState("networkidle");
  }
  await pause(5500);

  // ============================================================
  // §5 Persona Selection 3-tab + Create Modal (~30s)
  // ============================================================
  console.log("▶ §5: Persona Selection (3-tab + create modal)");
  // ペルソナタブ (BottomNav) または 「決めてもらう人を変更」 ボタンから遷移
  const personaTab = page.getByRole("link", { name: /ペルソナ/ }).first();
  if (await personaTab.isVisible().catch(() => false)) {
    await personaTab.click();
  } else {
    await page.goto(`${BASE_URL}/personas/selection`);
  }
  await page.waitForLoadState("networkidle");
  await pause(3500); // ビルトイン tab default + おすすめ badge

  // (a) 世界の誰か タブを click
  console.log("  → 世界の誰か タブ");
  await safeClick(page.getByTestId("persona-source-tab-anonymous"));
  await pause(3500);

  // (b) カスタム タブを click (空状態を見せる)
  console.log("  → カスタム タブ (空状態)");
  await safeClick(page.getByTestId("persona-source-tab-my"));
  await pause(3500);

  // (c) 「＋ 新規」ボタン押下 → modal 表示
  console.log("  → ＋ 新規 modal を開く");
  const createBtn = page.getByTestId("selection-create-persona");
  await safeClick(createBtn);
  await pause(2500);

  // (d) modal で入力
  console.log("  → modal で カスタム persona 入力");
  const nameInput = page.locator('label:has-text("名前") input').first();
  if (await nameInput.isVisible().catch(() => false)) {
    await nameInput.fill("おばあちゃん");
    await pause(800);
  }
  const descInput = page.locator('label:has-text("説明") input').first();
  if (await descInput.isVisible().catch(() => false)) {
    await descInput.fill("やさしく見守ってくれる相談相手");
    await pause(800);
  }
  const promptTextarea = page.locator('label:has-text("プロンプト指示文") textarea').first();
  if (await promptTextarea.isVisible().catch(() => false)) {
    await promptTextarea.fill(
      "あなたは何十年も人生経験を積んだやさしいおばあちゃんです。" +
      "若い人の悩みを温かく受け止め、決断を そっと後押ししてください。" +
      "無理せず、自分のペースで決めて大丈夫だよ、と伝えてください。",
    );
    await pause(1500);
  }
  // 保存ボタン
  const saveBtn = page.getByRole("button", { name: /^保存$/ }).first();
  if (await saveBtn.isVisible().catch(() => false)) {
    await saveBtn.click();
  }
  await pause(3500); // 作成成功 → my タブに自動切替

  // (e) my タブで作成済 persona を select
  console.log("  → 作成した persona を select");
  // PersonaCard を click (my タブの最初の card)
  const myCard = page.locator('[role="tabpanel"]#persona-panel-my article').first();
  if (await myCard.isVisible().catch(() => false)) {
    await myCard.click();
  }
  await pause(2000);

  // (f) ビルトインタブに戻る → builtin 3 種を select (合議用に 3 人選ぶ)
  console.log("  → ビルトインタブで 3 人選択");
  await safeClick(page.getByTestId("persona-source-tab-builtin"));
  await pause(1500);
  // 既存選択を全 reset してから 3 人選び直す
  await safeClick(page.getByRole("button", { name: /リセット/ }).first());
  await pause(1500);
  // 3 つの builtin card を順に click (慎重 / 楽観 / 効率)
  const builtinCards = page.locator(
    '[role="tabpanel"]#persona-panel-builtin article',
  );
  const count = await builtinCards.count();
  for (let i = 0; i < Math.min(count, 3); i++) {
    await builtinCards.nth(i).click().catch(() => {});
    await pause(700);
  }
  await pause(1500);

  // (g) 決定ボタン押下 → Home へ
  console.log("  → 決定 で Home へ");
  await safeClick(page.getByTestId("selection-confirm"));
  await pause(2500);

  // ============================================================
  // §6 Decision — 合議 + click focus + 完了 header + Yes 残置 (~50s)
  // ============================================================
  console.log("▶ §6: Decision (合議 + bubble click + 完了 header + Yes 残置)");
  // Home の「決めてもらう」ボタン
  const decideBtn = page.getByTestId("home-decide");
  if (await decideBtn.isVisible().catch(() => false)) {
    await decideBtn.click();
  } else {
    await page.goto(`${BASE_URL}/decision`);
  }
  await page.waitForLoadState("networkidle");
  await pause(2500); // QuickStart カード

  // QuickStart Yes で合議開始
  console.log("  → QuickStart Yes で合議開始");
  await clickProposalYes(page);
  await pause(6000); // streaming
  await waitProposal(page);
  await pause(2500); // proposal arrival

  // 過去 bubble を click して前面化 (新機能)
  console.log("  → 過去 bubble を click で前面化");
  const bubble0 = page.getByTestId("manga-bubble-0");
  if (await bubble0.isVisible().catch(() => false)) {
    await bubble0.click().catch(() => {});
    await pause(2200);
  }
  const bubble1 = page.getByTestId("manga-bubble-1");
  if (await bubble1.isVisible().catch(() => false)) {
    await bubble1.click().catch(() => {});
    await pause(2200);
  }
  // actor icon click でも前面化
  const actor2 = page.getByTestId("manga-actor-2");
  if (await actor2.isVisible().catch(() => false)) {
    await actor2.click().catch(() => {});
    await pause(2200);
  }

  // Yes 採択 → overlay に「決まったこと」 read-only card が残る (新機能)
  console.log("  → Yes 採択 → overlay 残置 card を確認");
  await clickProposalYes(page);
  await pause(4500); // StageHeader が「結論 / まとまりました」 に切替 + 残置 card
  // scroll で NudgeBanner + Combo を見せる
  await page.evaluate(() => window.scrollBy({ top: 240, behavior: "smooth" }));
  await pause(4000);

  // 「もう一度」 で再戻り (Home)
  const onceMore = page.getByRole("button", { name: /もう一度/ }).first();
  if (await onceMore.isVisible().catch(() => false)) {
    await onceMore.click();
  } else {
    await page.goto(`${BASE_URL}/`);
  }
  await pause(2500);

  // ============================================================
  // §7 Score — 過去の傾向 embed (~15s)
  // ============================================================
  console.log("▶ §7: Score (PreferenceTrends embed)");
  const scoreTab = page.getByRole("link", { name: /スコア/ }).first();
  if (await scoreTab.isVisible().catch(() => false)) {
    await scoreTab.click();
  } else {
    await page.goto(`${BASE_URL}/score`);
  }
  await page.waitForLoadState("networkidle");
  await pause(4500); // radial chart + AI コメント
  await page.evaluate(() => window.scrollBy({ top: 400, behavior: "smooth" }));
  await pause(4000); // 折れ線 + footnote
  await page.evaluate(() => window.scrollBy({ top: 400, behavior: "smooth" }));
  await pause(4500); // 📊 過去の傾向 (PreferenceTrends 新機能)

  // ============================================================
  // §8 Profile — Avatar 編集 (~12s)
  // ============================================================
  console.log("▶ §8: Profile (Avatar 編集)");
  const profileTab = page.getByRole("link", { name: /プロフィール/ }).first();
  if (await profileTab.isVisible().catch(() => false)) {
    await profileTab.click();
  } else {
    await page.goto(`${BASE_URL}/profile`);
  }
  await page.waitForLoadState("networkidle");
  await pause(3500); // ProfileCard 統合表示

  // 編集ボタンを押して AvatarEditor を見せる
  const editBtn = page.getByRole("button", { name: /編集/ }).first();
  if (await editBtn.isVisible().catch(() => false)) {
    await editBtn.click();
    await pause(3500); // EditMode + AvatarEditor (color preset + emoji preset)
    // キャンセル
    const cancelBtn = page.getByRole("button", { name: /キャンセル/ }).first();
    if (await cancelBtn.isVisible().catch(() => false)) {
      await cancelBtn.click();
    }
  }
  await pause(2500);

  console.log("✅ tour v2 完了、context を close して動画を flush");
  await context.close();
  await browser.close();
  console.log(`📹 出力ディレクトリ: ${OUTPUT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
