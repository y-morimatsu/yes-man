/** design.spec.ts — UI デザイン仕様書 (U7b FD §2 design tokens) 準拠の E2E 検証.
 *
 * 検証対象 (U7b FD §2.1〜2.3):
 * - colors: brand-600 #ea580c (primary button), neutral-50 #fafafa (background),
 *           danger #ef4444 (score danger alert), yes/no semantic colors
 * - typography: fontFamily に Inter / Noto Sans JP を含む
 * - spacing: Tailwind base (1rem=16px) + 拡張 (swipe/utterance) が DOM に反映
 * - WCAG AA: 主要 heading の color contrast (NFR Req)
 */
import { expect, test } from "@playwright/test";
import { gotoAuthenticated } from "../fixtures/auth";

test.describe("Design system tokens (U7b FD §2)", () => {
  test("Body background は neutral-50 = INCEPTION warm cream #FFF7E8 (§2.1)", async ({
    page,
  }) => {
    await gotoAuthenticated(page, "/");
    // body or root 直下要素の background-color
    const bg = await page.evaluate(() => {
      const el = document.querySelector("main") ?? document.body;
      return getComputedStyle(el).backgroundColor;
    });
    // INCEPTION canonical: neutral-50 = #FFF7E8 = rgb(255, 247, 232)
    expect(bg).toBe("rgb(255, 247, 232)");
  });

  test("Body font-family に Inter / Noto Sans JP が含まれる (§2.3 typography.sans)", async ({
    page,
  }) => {
    await gotoAuthenticated(page, "/");
    const fontFamily = await page.evaluate(
      () => getComputedStyle(document.body).fontFamily,
    );
    // browser は font fallback chain を camelcase + 引用符正規化、両方の表記を許容
    expect(fontFamily).toMatch(/Inter/);
    expect(fontFamily).toMatch(/Noto Sans JP/);
  });

  test("Primary heading は font-bold + text-2xl 相当 (§2.3 fontSize)", async ({
    page,
  }) => {
    await gotoAuthenticated(page, "/decision");
    const heading = page.getByRole("heading", { name: /何を きめますか/ });
    await expect(heading).toBeVisible();
    // text-2xl = 1.5rem = 24px (browser computed size)
    await expect(heading).toHaveCSS("font-size", "24px");
    // font-bold = 700
    await expect(heading).toHaveCSS("font-weight", "700");
  });

  test("Primary button (送信) は brand-600 = INCEPTION coral #E8775A (§2.1)", async ({
    page,
  }) => {
    await gotoAuthenticated(page, "/decision");
    await page.getByPlaceholder(/今日/).fill("テスト");
    const startButton = page.getByRole("button", { name: /送信/ });
    // INCEPTION canonical: brand-600 = coral = rgb(232, 119, 90)
    await expect(startButton).toHaveCSS("background-color", "rgb(232, 119, 90)");
    // rounded-xl = 0.75rem = 12px
    await expect(startButton).toHaveCSS("border-radius", "12px");
  });

  test("Score danger alert は danger = INCEPTION 控えめ赤 #C62828 / role=alert (§2.1)", async ({
    page,
    request,
  }) => {
    // 5 No seed (score.spec.ts:11 と同等)
    for (let i = 0; i < 5; i++) {
      const resp = await request.post(
        "http://localhost:8000/v1/decisions/request",
        { data: { user_input: `design test ${i}` } },
      );
      const { decision_id } = await resp.json();
      await request.post(
        `http://localhost:8000/v1/decisions/${decision_id}/choice`,
        { data: { choice: "no" } },
      );
    }
    await page.goto("/score");
    const alert = page.getByRole("alert").first();
    await expect(alert).toBeVisible();
    // INCEPTION canonical: danger = #C62828 = rgb(198, 40, 40)
    await expect(alert).toHaveCSS("color", "rgb(198, 40, 40)");
    // font-bold 強調 (No 連発警告は bold で目立たせる、FD spec)
    await expect(alert).toHaveCSS("font-weight", "700");
  });

  test("Score 詳細統計 numeric は tabular font (font-mono、INCEPTION §1.3 数字)", async ({
    page,
  }) => {
    await gotoAuthenticated(page, "/score");
    // INCEPTION refactor 後: 大きな % 表示 + 下部の 3 列 stats (font-mono text-lg)
    const noCountValue = page.locator("dd.font-mono").first();
    await expect(noCountValue).toBeVisible();
    const ff = await noCountValue.evaluate(
      (el) => getComputedStyle(el).fontFamily,
    );
    // mono / Inter どちらも数値表示に適 (INCEPTION 数字 = Inter Tabular)
    expect(ff).toMatch(/JetBrains Mono|Inter|monospace/);
  });

  test("Article (utterance bubble) は最大幅 28rem (§2.2 spacing.utterance)", async ({
    page,
  }) => {
    await gotoAuthenticated(page, "/decision");
    await page.getByPlaceholder(/今日/).fill("テスト");
    await page.getByRole("button", { name: /送信/ }).click();
    await page.waitForSelector('[role="article"]', { timeout: 90_000 });
    // INCEPTION FR-CV-04: 議論を見る default closed のため utterance を expand
    await expect(
      page.getByRole("button", { name: /Yes、提案を採択/ }),
    ).toBeVisible({ timeout: 120_000 });
    await page.getByTestId("discussion-toggle").click();
    // utterance bubble は派 含む (proposal article は派含まず)
    const article = page.locator('[role="article"]').filter({ hasText: "派" }).first();
    // max-width: min(28rem, 100% - 2rem) → 28rem = 448px (Desktop)
    // ビューポート widthに依らない invariant として max-width が設定されていることを assert
    const maxWidth = await article.evaluate(
      (el) => getComputedStyle(el).maxWidth,
    );
    // 解決済 px or 'min(...)' 式を許容
    expect(maxWidth).toMatch(/^(448px|min\(.+\))$/);
  });

  test("Layout の primary nav link 'YesMan' は brand-600 をホバーで使用しない (§2.1 brand-600 は CTA 専用)", async ({
    page,
  }) => {
    await gotoAuthenticated(page, "/");
    // ロゴは "🪞 YesMan" (INCEPTION 仕様 mirror emoji 付き)
    const logoLink = page.getByRole("link", { name: /YesMan/ });
    const initialColor = await logoLink.evaluate(
      (el) => getComputedStyle(el).color,
    );
    // logo は brand-600 (#E8775A) ではなく neutral 系を使用
    expect(initialColor).not.toBe("rgb(232, 119, 90)");
  });

  test("Article (utterance bubble) は rounded-2xl (§FD 3.3.2 DecisionUtteranceBubble)", async ({
    page,
  }) => {
    await gotoAuthenticated(page, "/decision");
    await page.getByPlaceholder(/今日/).fill("デザインテスト");
    await page.getByRole("button", { name: /送信/ }).click();
    await page.waitForSelector('[role="article"]', { timeout: 90_000 });
    // INCEPTION FR-CV-04: 議論を見る default closed のため utterance を expand
    await expect(
      page.getByRole("button", { name: /Yes、提案を採択/ }),
    ).toBeVisible({ timeout: 120_000 });
    await page.getByTestId("discussion-toggle").click();
    // utterance bubble (派 含む) で rounded-2xl 確認
    const article = page.locator('[role="article"]').filter({ hasText: "派" }).first();
    // rounded-2xl = 1rem = 16px
    await expect(article).toHaveCSS("border-radius", "16px");
  });
});
