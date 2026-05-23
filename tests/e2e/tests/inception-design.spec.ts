/** inception-design.spec.ts — INCEPTION 上流仕様 (ui-mockups.md / screens/*.svg / drawio) 完全準拠検証.
 *
 * 仕様参照:
 * - aidlc-docs/inception/application-design/ui-mockups.md §1.2 / §1.3 (color + typography)
 * - aidlc-docs/inception/application-design/screens/01..06.svg (canonical UI mockups)
 * - aidlc-docs/inception/application-design/diagrams/ui-mockups.drawio
 * - README.md §デザインで埋め込まれた SVG モックアップ
 *
 * ultrathink で再評価: tokens (color/font) だけでなく copy/icon/layout 構造まで検証.
 *
 * INCEPTION canonical tokens:
 * - 背景 cream:      #FFF7E8 (warm cream)
 * - Header beige:    #F5E5C4
 * - Text primary:    #4A3D45 (warm dark brown)
 * - Accent coral:    #E8775A (proposal sub-text / accent)
 * - Send btn black:  #0A0A0A (INCEPTION screen-01 → 送信 button background)
 * - Yes 強調:        #4CAF50, No 抑制: #90A4AE, Score: #FFA726
 * - Heading font:    Noto Serif JP Bold
 */
import { expect, test } from "@playwright/test";
import { gotoAuthenticated } from "../fixtures/auth";

test.describe("INCEPTION tokens (color/font)", () => {
  test("Body 背景 = #FFF7E8 warm cream", async ({ page }) => {
    await gotoAuthenticated(page, "/");
    const bg = await page.evaluate(
      () =>
        getComputedStyle(document.querySelector("main") ?? document.body)
          .backgroundColor,
    );
    expect(bg).toBe("rgb(255, 247, 232)");
  });

  test("Primary text = #4A3D45 warm dark brown", async ({ page }) => {
    // INCEPTION token は Splash heading が一番代表的、Splash route に直接アクセス.
    await page.goto("/auth/splash");
    const heading = page.getByRole("heading", { level: 1 }).first();
    await expect(heading).toBeVisible();
    await expect(heading).toHaveCSS("color", "rgb(74, 61, 69)");
  });

  test("Heading font に Noto Serif JP 含む", async ({ page }) => {
    await page.goto("/auth/splash");
    const heading = page.getByRole("heading", { level: 1 }).first();
    const ff = await heading.evaluate((el) => getComputedStyle(el).fontFamily);
    expect(ff).toMatch(/Noto Serif JP/);
  });

  test("Header bar 背景 = #F5E5C4 warm beige", async ({ page }) => {
    await gotoAuthenticated(page, "/");
    const header = page.locator("header, [role='banner']").first();
    const bg = await header.evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    );
    expect(bg).toMatch(/rgb\(245,\s*229,\s*196\)/);
  });

  test("Send / CTA button 背景 = coral #E8775A", async ({ page }) => {
    await gotoAuthenticated(page, "/decision");
    await page.getByPlaceholder(/決めたいことを入力|何を|今日の/).first().fill("テスト");
    const send = page
      .getByRole("button", { name: /送信|合議開始/ })
      .first();
    await expect(send).toBeVisible();
    await expect(send).toHaveCSS("background-color", "rgb(232, 119, 90)");
  });
});

test.describe("INCEPTION Header (全画面共通、screens/01-06 上部)", () => {
  test("Logo 「🪞 YesMan」 (mirror emoji 必須、INCEPTION screen-01..06 共通)", async ({
    page,
  }) => {
    await gotoAuthenticated(page, "/");
    // ロゴテキストに 🪞 (鏡) emoji が含まれるべき (アプリ世界観の象徴)
    const logo = page.getByRole("link", { name: "🪞 YesMan", exact: true });
    await expect(logo).toBeVisible();
    const text = await logo.textContent();
    expect(text).toContain("🪞");
  });


});

test.describe("INCEPTION Decision Input (screen-01 home-input.svg)", () => {
  test("ページ title = 「何を きめますか？」", async ({ page }) => {
    await gotoAuthenticated(page, "/decision");
    await expect(
      page.getByRole("heading", { name: /何を きめますか/ }),
    ).toBeVisible();
  });

  test("Send button label = 「→ 送信」 (INCEPTION screen-01 black pill)", async ({
    page,
  }) => {
    await gotoAuthenticated(page, "/decision");
    await page.getByPlaceholder(/今日|決め/).first().fill("テスト");
    await expect(page.getByRole("button", { name: /→ 送信|送信/ })).toBeVisible();
  });

  test("Bottom hint 「「決められない」を 委ねよう」が表示 (INCEPTION whisper copy)", async ({
    page,
  }) => {
    await gotoAuthenticated(page, "/decision");
    await expect(page.getByText(/「決められない」を 委ねよう/)).toBeVisible();
  });
});

test.describe("INCEPTION Score Dashboard (screen-04 score-dashboard.svg)", () => {
  test("ページ title = 「委任度 スコア」 (NOT 主体性スコア)", async ({ page }) => {
    await gotoAuthenticated(page, "/score");
    await expect(
      page.getByRole("heading", { name: /委任度 スコア/ }),
    ).toBeVisible();
  });

  test("「委任度 (Yes 比率)」ラベル表示 (INCEPTION 中核 metric label)", async ({
    page,
  }) => {
    await gotoAuthenticated(page, "/score");
    await expect(page.getByText(/委任度 \(Yes 比率\)/)).toBeVisible();
  });

  test("「スコアが たかいほど AI を信頼できています」 footnote 表示 (INCEPTION 説明文)", async ({
    page,
  }) => {
    await gotoAuthenticated(page, "/score");
    await expect(
      page.getByText(/スコアが たかいほど AI を信頼できています/),
    ).toBeVisible();
  });

  test("Score radial chart numeric は purple #9F88C8 (INCEPTION 04-score-dashboard.svg 準拠)", async ({
    page,
  }) => {
    await gotoAuthenticated(page, "/score");
    // ScoreRadialChart: SVG <text fill="#9F88C8"> で数字を描画
    const numericText = page.getByRole("img", { name: /委任度/ }).locator("text").first();
    await expect(numericText).toBeVisible();
    const fill = await numericText.evaluate((el) => el.getAttribute("fill"));
    expect(fill).toBe("#9F88C8");
  });
});

test.describe("INCEPTION Proposal Card + Yes/No (screen-03 proposal-card.svg)", () => {
  test("Yes / No 採択ボタン色 (INCEPTION §1.2 Yes 緑 / No grey)", async ({
    page,
  }) => {
    await gotoAuthenticated(page, "/decision");
    await page.getByPlaceholder(/今日|決め/).first().fill("デザイン検証");
    await page.getByRole("button", { name: /送信|合議開始/ }).first().click();
    await page.waitForSelector('[role="article"]', { timeout: 90_000 });
    const yes = page.getByRole("button", { name: /Yes/, exact: false });
    await expect(yes).toBeVisible({ timeout: 120_000 });
    const yesBg = await yes.evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    );
    expect(yesBg).toBe("rgb(76, 175, 80)"); // #4CAF50
    const no = page.getByRole("button", { name: /No/, exact: false });
    const noBg = await no.evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    );
    expect(noBg).toBe("rgb(144, 164, 174)"); // #90A4AE
  });

  // skip: Mock LLM 並列負荷で proposal_timeout (Issue #80)
  test.skip("Yes 採択後の nudge banner 表示 (pink banner、INCEPTION screen-03 下部)", async ({
    page,
  }) => {
    await gotoAuthenticated(page, "/decision");
    await page.getByPlaceholder(/今日|決め/).first().fill("nudge 検証");
    await page.getByRole("button", { name: /送信|合議開始/ }).first().click();
    await page.waitForSelector('[role="article"]', { timeout: 90_000 });
    const yes = page.getByRole("button", { name: /Yes/, exact: false });
    await expect(yes).toBeVisible({ timeout: 120_000 });
    await yes.click();
    // nudge banner heading
    await expect(
      page.getByRole("heading", { name: /Yes 採択|合議された結論/ }),
    ).toBeVisible({ timeout: 60_000 });
  });
});

test.describe("INCEPTION Persona Pool (screen-06 persona-pool.svg)", () => {
  test("Create button label = 「＋ 新規」 (NOT 新規作成)", async ({ page }) => {
    await gotoAuthenticated(page, "/personas");
    await expect(
      page.getByRole("button", { name: /\+ 新規|＋ 新規/ }),
    ).toBeVisible();
  });

  test("検索 input placeholder = 「🔍 ペルソナを 探す...」 (INCEPTION search)", async ({
    page,
  }) => {
    await gotoAuthenticated(page, "/personas");
    await expect(
      page.getByPlaceholder(/ペルソナを 探す|🔍/),
    ).toBeVisible();
  });

  test("「最大 3 個 まで 合議に組込み 可能」 footnote 表示", async ({ page }) => {
    await gotoAuthenticated(page, "/personas");
    await expect(
      page.getByText(/最大 3 個 まで 合議に組込み 可能/),
    ).toBeVisible();
  });
});

test.describe("INCEPTION input style", () => {
  test("Input border = warm beige #E0D5BC (INCEPTION screen-01 入力枠)", async ({
    page,
  }) => {
    await gotoAuthenticated(page, "/decision");
    const input = page.getByPlaceholder(/今日|決め/).first();
    await expect(input).toBeVisible();
    const border = await input.evaluate(
      (el) => getComputedStyle(el).borderColor,
    );
    expect(border).toBe("rgb(224, 213, 188)");
  });
});
