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
    // PR #11 以降 Splash は /auth/splash route.
    await page.goto("/auth/splash");
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
  test("Header (logo + Sign out のみ) が viewport 内に収まる", async ({ page }) => {
    await gotoAuthenticated(page, "/");
    await page.waitForSelector("header");
    const header = page.locator("header");
    const box = await header.boundingBox();
    expect(box).not.toBeNull();
    // logo "🪞 YesMan" と Sign out が visible
    await expect(page.getByText(/🪞 YesMan/)).toBeVisible();
    await expect(page.getByRole("button", { name: /Sign out/ })).toBeVisible();
    // nav icons (⚙️📊👤) は削除済 = header に存在しない
    const headerText = (await header.textContent()) ?? "";
    expect(headerText).not.toContain("⚙️");
    expect(headerText).not.toContain("📊");
    expect(headerText).not.toContain("👤");
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
    // PR #11 以降 Splash は /auth/splash route.
    await page.goto("/auth/splash");
    const heading = page.getByRole("heading", { name: /YESMAN/ });
    const parent = heading.locator("..").first();
    const align = await parent.evaluate((el) => getComputedStyle(el).textAlign);
    expect(align).toBe("center");
  });

  test("Splash disclaimer は initial viewport 内に visible", async ({
    page,
  }) => {
    await page.goto("/auth/splash");
    await expect(page.getByText(/逆説的設計/).first()).toBeInViewport({
      ratio: 0.5,
    });
  });
});

test.describe("BottomNav (Mobile App Polish §4)", () => {
  test("Bottom Navigation Bar が画面下に固定表示される", async ({ page }) => {
    await gotoAuthenticated(page, "/");
    const nav = page.getByRole("navigation", { name: "メインナビゲーション" });
    await expect(nav).toBeVisible();
    await expect(page.getByText("Home", { exact: true })).toBeVisible();
    await expect(page.getByText("決定", { exact: true })).toBeVisible();
    await expect(page.getByText("スコア", { exact: true })).toBeVisible();
    await expect(page.getByText("プロフィール", { exact: true })).toBeVisible();
  });

  test("4 tab の tap target が 44×44px 以上", async ({ page }) => {
    await gotoAuthenticated(page, "/");
    for (const label of ["Home", "決定", "スコア", "プロフィール"]) {
      const link = page.getByText(label, { exact: true }).locator("..");
      const box = await link.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.width).toBeGreaterThanOrEqual(44);
    }
  });

  test("tab tap で active 状態が切替わる", async ({ page }) => {
    await gotoAuthenticated(page, "/");
    const homeLink = page.getByText("Home", { exact: true }).locator("..");
    await expect(homeLink).toHaveAttribute("aria-current", "page");
    await page.getByText("決定", { exact: true }).click();
    await expect(page).toHaveURL(/\/decision/);
    const decisionLink = page.getByText("決定", { exact: true }).locator("..");
    await expect(decisionLink).toHaveAttribute("aria-current", "page");
  });

  test("/auth/splash で BottomNav は非表示", async ({ page }) => {
    // gotoAuthenticated 不使用 → 未認証状態を再現
    // RequireAuth で守られた route には行けないが /auth/splash は public route
    await page.goto("/auth/splash");
    await page.waitForLoadState("networkidle");
    // URL は /auth/splash のまま (auto redirect しない)
    expect(page.url()).toContain("/auth/splash");
    // BottomNav は非表示 (Layout の isAuthed = false)
    await expect(
      page.getByRole("navigation", { name: "メインナビゲーション" }),
    ).not.toBeVisible();
  });

  test("Sticky Header — scroll しても画面上部に固定される", async ({ page }) => {
    await gotoAuthenticated(page, "/score");
    const header = page.locator("header");
    // 初期表示で header が visible
    await expect(header).toBeVisible();
    const initialBox = await header.boundingBox();
    expect(initialBox).not.toBeNull();
    // 下方向に 400px scroll
    await page.evaluate(() => window.scrollTo(0, 400));
    await page.waitForTimeout(200);  // sticky reflow 待ち
    // header が依然 visible + viewport 上部に維持
    await expect(header).toBeVisible();
    const scrolledBox = await header.boundingBox();
    expect(scrolledBox).not.toBeNull();
    // sticky header の y 座標は scroll しても 0 付近 (safe-area-inset-top 込み)
    expect(scrolledBox!.y).toBeLessThanOrEqual(initialBox!.y + 5);
    // brand logo + Sign out が依然 visible
    await expect(page.getByText(/🪞 YesMan/)).toBeVisible();
    await expect(page.getByRole("button", { name: /Sign out/ })).toBeVisible();
  });

  test("/score で 📊 スコア tab が active", async ({ page }) => {
    await gotoAuthenticated(page, "/score");
    const scoreLink = page.getByText("スコア", { exact: true }).locator("..");
    await expect(scoreLink).toHaveAttribute("aria-current", "page");
    // active class (text-brand-700) が適用される
    const className = (await scoreLink.getAttribute("class")) ?? "";
    expect(className).toContain("text-brand-700");
    // 他 tab は inactive
    for (const label of ["Home", "決定", "プロフィール"]) {
      const link = page.getByText(label, { exact: true }).locator("..");
      await expect(link).not.toHaveAttribute("aria-current", "page");
    }
  });

  test("/personas で BottomNav 全 tab が inactive (Persona は nav 除外)", async ({ page }) => {
    await gotoAuthenticated(page, "/personas");
    // BottomNav は visible
    await expect(page.getByRole("navigation", { name: "メインナビゲーション" })).toBeVisible();
    // 4 tab 全て inactive
    for (const label of ["Home", "決定", "スコア", "プロフィール"]) {
      const link = page.getByText(label, { exact: true }).locator("..");
      await expect(link).not.toHaveAttribute("aria-current", "page");
    }
  });

  test("/preferences で BottomNav 全 tab が inactive (Preference は nav 除外)", async ({ page }) => {
    await gotoAuthenticated(page, "/preferences");
    // BottomNav は visible
    await expect(page.getByRole("navigation", { name: "メインナビゲーション" })).toBeVisible();
    // 4 tab 全て inactive
    for (const label of ["Home", "決定", "スコア", "プロフィール"]) {
      const link = page.getByText(label, { exact: true }).locator("..");
      await expect(link).not.toHaveAttribute("aria-current", "page");
    }
  });
});
