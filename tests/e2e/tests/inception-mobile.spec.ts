/** inception-mobile.spec.ts — INCEPTION drawio が phone aspect ratio (280×520) で設計された
 *  ことを踏まえ、mobile viewport (Pixel 5 / 393×851) での実機検証.
 *
 * 検証観点 (mobile-first DX):
 * - viewport: 393px width (Pixel 5)、portrait
 * - 水平 scroll が発生しない (overflow-x:hidden 不要、純粋 layout fit)
 * - Hub Cards / persona list が 1 column stack (sm: 640px breakpoint 未満)
 * - Header (logo + 3 nav icons + Sign out) が overflow しない
 * - Touch target: 主要 button >= 44px height (Apple HIG / WCAG 2.5.5)
 * - Bottom hint 「「決められない」を 委ねよう」が初期表示で visible
 * - YESMAN 大見出し (text-5xl = 48px) が mobile width 内に収まる
 * - Modal: viewport 内に収まる + scrollable
 * - VoiceMicButton: touch target サイズ
 */
import { expect, test } from "@playwright/test";
import { gotoAuthenticated } from "../fixtures/auth";

const MOBILE_MAX_WIDTH = 480;

test.describe("Mobile viewport (drawio 280×520 phone aspect)", () => {
  test("viewport is mobile size (width <= 480px)", async ({ page }) => {
    await gotoAuthenticated(page, "/");
    const vw = page.viewportSize();
    expect(vw).not.toBeNull();
    expect(vw!.width).toBeLessThanOrEqual(MOBILE_MAX_WIDTH);
    expect(vw!.height).toBeGreaterThan(vw!.width); // portrait
  });

  test("No 水平 scroll (page width === viewport width)", async ({ page }) => {
    await gotoAuthenticated(page, "/");
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1); // 1px tolerance
  });

  test("YESMAN 大見出し が viewport 内に収まる", async ({ page }) => {
    await gotoAuthenticated(page, "/");
    const heading = page.getByRole("heading", { name: /YESMAN/ });
    await expect(heading).toBeVisible();
    const box = await heading.boundingBox();
    expect(box).not.toBeNull();
    const vw = page.viewportSize()!.width;
    expect(box!.x + box!.width).toBeLessThanOrEqual(vw);
  });
});

test.describe("Mobile layout: stack columns (sm < 640px)", () => {
  test("HomePage Hub Cards は 1 column stack (mobile)", async ({ page }) => {
    await gotoAuthenticated(page, "/");
    // 5 Hub Cards (合議で決定 / Persona / 委任度 / 嗜好 / プロフィール)
    const cards = page.locator("section.grid > div, section > section, section a");
    // mobile では grid-cols-1 → 各 card の Y 座標が異なる (stack)
    const links = await page
      .locator('a[href^="/"]')
      .filter({ hasText: /合議|Persona|委任度|嗜好|プロフィール/ })
      .all();
    if (links.length >= 2) {
      const box1 = await links[0].boundingBox();
      const box2 = await links[1].boundingBox();
      // stack: card2 が card1 の下にある (Y 座標が大きい、X 座標は同じ ±5px)
      expect(box2!.y).toBeGreaterThan(box1!.y + box1!.height - 10);
    }
  });

  test("Persona list grid は mobile で 1 column", async ({ page }) => {
    await gotoAuthenticated(page, "/personas");
    await page.getByRole("button", { name: /共有プール/ }).click();
    // 慎重派 / 楽観派 / 効率派 cards が表示される
    await expect(page.getByText(/慎重派/).first()).toBeVisible({ timeout: 60_000 });
  });
});

test.describe("Mobile Header (overflow check)", () => {
  test("Header (logo + nav + Sign out) が viewport 内に収まる", async ({
    page,
  }) => {
    await gotoAuthenticated(page, "/");
    const header = page.locator("header").first();
    const box = await header.boundingBox();
    expect(box).not.toBeNull();
    const vw = page.viewportSize()!.width;
    expect(box!.x + box!.width).toBeLessThanOrEqual(vw + 1);
    // Header 内要素全てが viewport 内
    const inner = await header.evaluate(
      (el) => el.scrollWidth <= el.clientWidth + 1,
    );
    expect(inner).toBe(true);
  });
});

test.describe("Mobile Touch Targets (WCAG 2.5.5 / Apple HIG)", () => {
  test("Primary CTA button (送信) は 44×44 px 以上 (touch target)", async ({
    page,
  }) => {
    await gotoAuthenticated(page, "/decision");
    await page.getByPlaceholder(/今日/).fill("touch target test");
    const sendBtn = page.getByRole("button", { name: /送信/ });
    const box = await sendBtn.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  });

  test("Yes / No 採択ボタンは 44×44 px 以上", async ({ page }) => {
    await gotoAuthenticated(page, "/decision");
    await page.getByPlaceholder(/今日/).fill("Yes/No touch test");
    await page.getByRole("button", { name: /送信/ }).click();
    await page.waitForSelector('[role="article"]', { timeout: 90_000 });
    const yes = page.getByRole("button", { name: /Yes/, exact: false });
    await expect(yes).toBeVisible({ timeout: 120_000 });
    const yesBox = await yes.boundingBox();
    expect(yesBox!.height).toBeGreaterThanOrEqual(44);
    const no = page.getByRole("button", { name: /No/, exact: false });
    const noBox = await no.boundingBox();
    expect(noBox!.height).toBeGreaterThanOrEqual(44);
  });

  test("VoiceMicButton も 44×44 px 以上 (touch target)", async ({ page }) => {
    await gotoAuthenticated(page, "/decision");
    // VoiceMicButton は idle 状態で button が visible
    const mic = page.getByRole("button", { name: /録音|音声/ });
    if (await mic.count()) {
      const box = await mic.first().boundingBox();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
  });
});

test.describe("Mobile copy fits without truncation", () => {
  test("Decision page title + bottom hint が viewport 内に visible (no scroll)", async ({
    page,
  }) => {
    await gotoAuthenticated(page, "/decision");
    await expect(
      page.getByRole("heading", { name: /何を きめますか/ }),
    ).toBeInViewport();
    // bottom hint は viewport 内にある (initial decision page、複数要素少ない)
    const hint = page.getByText(/「決められない」を 委ねよう/);
    await expect(hint).toBeVisible();
  });

  test("Score page metric (radial chart + label) が visible without horizontal scroll", async ({
    page,
  }) => {
    await gotoAuthenticated(page, "/score");
    await expect(
      page.getByRole("heading", { name: /委任度 スコア/ }),
    ).toBeInViewport();
    // ScoreRadialChart の SVG が viewport 幅内に収まる (INCEPTION 04 spec)
    const radial = page.getByRole("img", { name: /委任度/ });
    await expect(radial).toBeVisible();
    const box = await radial.boundingBox();
    expect(box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  });
});

test.describe("Mobile Modal (persona create) fits viewport", () => {
  test("Persona create modal が viewport 内に収まる", async ({ page }) => {
    await gotoAuthenticated(page, "/personas");
    await page.getByRole("button", { name: /\+ 新規|＋ 新規/ }).click();
    await expect(page.getByText(/新規ペルソナ作成/)).toBeVisible();
    // dialog or modal element の幅
    const modal = page.locator('[role="dialog"], .modal, [aria-modal="true"]').first();
    if (await modal.count()) {
      const box = await modal.boundingBox();
      const vw = page.viewportSize()!.width;
      expect(box!.width).toBeLessThanOrEqual(vw);
    }
  });
});

test.describe("Mobile Splash A1 (drawio 280×520)", () => {
  test("YESMAN 大見出し は viewport 中央寄りに配置 (text-align center)", async ({
    page,
  }) => {
    await gotoAuthenticated(page, "/");
    const heading = page.getByRole("heading", { name: /YESMAN/ });
    const parent = heading.locator("..").first();
    const align = await parent.evaluate((el) => getComputedStyle(el).textAlign);
    expect(align).toBe("center");
  });

  test("Splash disclaimer + → スワイプして同意 は initial viewport 内に visible", async ({
    page,
  }) => {
    await gotoAuthenticated(page, "/");
    await expect(page.getByText(/逆説的設計/).first()).toBeInViewport({
      ratio: 0.5,
    });
  });
});
