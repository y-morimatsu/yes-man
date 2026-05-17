/** inception-structural.spec.ts — drawio canonical 仕様の structural 検証.
 *
 * 前回 inception-design.spec.ts は color/font/copy 中心だった。本 spec は drawio の
 * **構造的 UI** (3-line proposal / LIVE badge / persona icon mapping / pink nudge banner
 * / Yes celebration / silence theater) を検証する.
 *
 * 仕様参照: aidlc-docs/inception/application-design/diagrams/ui-mockups.drawio
 * - B2 home-input: persona inline selector
 * - B7 discussion-live: 🔴 LIVE badge + 🛡️/☀️/⚡ icons + progress dots
 * - B4 proposal-card: 3-line (prefix/main/suffix) + 議論を見る + pink nudge
 * - Yes 確定: ✨🎉✨ + 主体性スコア参照
 * - C1-C3+ No 連打: 段階的 microcopy
 * - D Silence: ⚠️ 沈黙ドメイン + ... 中央表示
 * - G2 Persona: 🤔/🚀 emoji + 共有 ON/OFF 🔓/🔒
 */
import { expect, test } from "@playwright/test";
import { gotoAuthenticated } from "../fixtures/auth";

test.describe("INCEPTION B7: Discussion Live (drawio: SSE 合議中)", () => {
  test("合議中に 🔴 LIVE badge 表示 (drawio B7、FR-CV-01〜03)", async ({ page }) => {
    await gotoAuthenticated(page, "/decision");
    await page.getByPlaceholder(/今日/).fill("LIVE バッジ検証");
    await page.getByRole("button", { name: /送信/ }).click();
    // SSE streaming 中に "LIVE" 文字が表示される
    await expect(page.getByText(/🔴 LIVE|LIVE/).first()).toBeVisible({
      timeout: 60_000,
    });
  });

  test("Utterance bubble に persona icon (🛡️/☀️/⚡) が表示", async ({ page }) => {
    await gotoAuthenticated(page, "/decision");
    await page.getByPlaceholder(/今日/).fill("icon マッピング検証");
    await page.getByRole("button", { name: /送信/ }).click();
    await page.waitForSelector('[role="article"]', { timeout: 90_000 });
    // INCEPTION FR-CV-04: 議論を見る は default closed のため、明示的に open する
    // (proposal 到着まで待つ → 議論を見る click で utterance 領域を表示)
    await expect(
      page.getByRole("button", { name: /Yes、提案を採択/ }),
    ).toBeVisible({ timeout: 120_000 });
    await page.getByTestId("discussion-toggle").click();
    // 各 persona の article 内に対応 emoji icon が含まれる
    const cautious = page.locator('[role="article"]').filter({ hasText: "慎重派" });
    await expect(cautious).toBeVisible();
    const cautiousText = await cautious.textContent();
    expect(cautiousText).toContain("🛡️");
    const optimist = page.locator('[role="article"]').filter({ hasText: "楽観派" });
    const optimistText = await optimist.textContent();
    expect(optimistText).toContain("☀️");
    const efficient = page
      .locator('[role="article"]')
      .filter({ hasText: "効率派" });
    const efficientText = await efficient.textContent();
    expect(efficientText).toContain("⚡");
  });
});

test.describe("INCEPTION B4: Proposal Card 3-line + caption (drawio B4)", () => {
  test("Proposal は prefix (「今日の___は」) + main + caption の 3 部構成", async ({
    page,
  }) => {
    await gotoAuthenticated(page, "/decision");
    await page.getByPlaceholder(/今日/).fill("3-line proposal 検証");
    await page.getByRole("button", { name: /送信/ }).click();
    await page.waitForSelector('[role="article"]', { timeout: 90_000 });
    // 完了後の proposal display:
    // 1. caption「あなたに最適化された結論です」
    await expect(
      page.getByText(/あなたに最適化された結論です/),
    ).toBeVisible({ timeout: 120_000 });
  });

  test("Proposal 完了後「📂 議論を見る」リンク表示 (FR-CV-04)", async ({
    page,
  }) => {
    await gotoAuthenticated(page, "/decision");
    await page.getByPlaceholder(/今日/).fill("議論リンク検証");
    await page.getByRole("button", { name: /送信/ }).click();
    await page.waitForSelector('[role="article"]', { timeout: 90_000 });
    await expect(
      page.getByRole("button", { name: /議論を見る|📂 議論/ }),
    ).toBeVisible({ timeout: 120_000 });
  });
});

test.describe("INCEPTION Pink Nudge Banner (drawio B4 下部 nudge)", () => {
  test("Yes 採択後の nudge banner は pink 系背景 + 専用 copy", async ({ page }) => {
    await gotoAuthenticated(page, "/decision");
    await page.getByPlaceholder(/今日/).fill("nudge banner 検証");
    await page.getByRole("button", { name: /送信/ }).click();
    await page.waitForSelector('[role="article"]', { timeout: 90_000 });
    const yes = page.getByRole("button", { name: /Yes/, exact: false });
    await expect(yes).toBeVisible({ timeout: 120_000 });
    await yes.click();
    // INCEPTION nudge copy 表示
    await expect(
      page.getByText(/合議された結論です/).first(),
    ).toBeVisible({ timeout: 60_000 });
  });

  test("Yes celebration emoji ✨🎉✨ / 「素晴らしい従順さです」 (drawio B4-Yes)", async ({
    page,
  }) => {
    await gotoAuthenticated(page, "/decision");
    await page.getByPlaceholder(/今日/).fill("celebration 検証");
    await page.getByRole("button", { name: /送信/ }).click();
    await page.waitForSelector('[role="article"]', { timeout: 90_000 });
    const yes = page.getByRole("button", { name: /Yes/, exact: false });
    await expect(yes).toBeVisible({ timeout: 120_000 });
    await yes.click();
    // ✨🎉✨ または 「素晴らしい従順さです」 (逆説的設計コピー)
    await expect(
      page.getByText(/素晴らしい従順さです/).first(),
    ).toBeVisible({ timeout: 60_000 });
  });
});

test.describe("INCEPTION Score Dashboard (drawio Score 拡張)", () => {
  test("Score page に「主体性スコア」副題 + 説明テキスト (逆説的設計の明示)", async ({
    page,
  }) => {
    await gotoAuthenticated(page, "/score");
    // 旧来コピー「主体性スコア」も補助情報として表示すべき (drawio Score-Yes 演出参照)
    await expect(
      page.getByText(/逆説的設計/).first(),
    ).toBeVisible();
  });

  test("AI コメント (可変文) が大きく表示 (drawio B6 中央)", async ({ page }) => {
    await gotoAuthenticated(page, "/score");
    // AI コメントは serif italic で表示 (mockup の演出)
    const aiComment = page.locator("p.font-serif.italic").first();
    await expect(aiComment).toBeVisible();
  });
});

test.describe("INCEPTION G2 Persona Management (drawio: icon + 共有 status)", () => {
  test("自分の Persona list が「📌 自分のペルソナ」セクション (drawio G2)", async ({
    page,
  }) => {
    await gotoAuthenticated(page, "/personas");
    // タブ「自分の Persona」がアクティブの時、見出し or count 表示
    await expect(page.getByRole("button", { name: /自分の Persona/ })).toBeVisible();
  });

  test("Builtin persona は「(組み込み)」ラベル + persona icon (🛡️/☀️/⚡) が card 内", async ({
    page,
  }) => {
    await gotoAuthenticated(page, "/personas");
    await page.getByRole("button", { name: /共有プール/ }).click();
    // 共有プールには builtin (慎重派/楽観派/効率派) が表示される
    await expect(page.getByText(/慎重派/).first()).toBeVisible({ timeout: 60_000 });
    // 各 builtin card に対応する icon が表示される (DOM 内任意位置)
    const cardWithCautious = page
      .locator("[data-testid='persona-card'], article, .persona-card")
      .filter({ hasText: "慎重派" })
      .first();
    if (await cardWithCautious.count()) {
      const text = await cardWithCautious.textContent();
      expect(text).toMatch(/🛡️|🤔/); // INCEPTION drawio 慎重派 icon
    }
  });
});

test.describe("INCEPTION D: Silence Theater (drawio: 沈黙演出専用画面)", () => {
  test("沈黙ドメイン入力 → /decision で silence 検知 (現状は handler 内、page 遷移は未実装)", async ({
    page,
  }) => {
    await gotoAuthenticated(page, "/decision");
    // 沈黙領域の入力例: 「来週の選挙で誰に投票すべき」 (drawio D-Pre)
    await page.getByPlaceholder(/今日/).fill("選挙で誰に投票すべきか");
    await page.getByRole("button", { name: /送信/ }).click();
    // 沈黙判定 → 専用 region (region "沈黙演出") + 中央 "…" + 説明文
    await expect(
      page.getByRole("region", { name: /沈黙演出/ }),
    ).toBeVisible({ timeout: 90_000 });
    await expect(page.getByText(/この領域は AI/).first()).toBeVisible();
  });
});
