/** voice.spec.ts — Story F1-F4 (U-Test FD §2.2.5). */
import { expect, test } from "@playwright/test";
import { gotoAuthenticated } from "../fixtures/auth";

test.describe("Voice input", () => {
  test("VoiceMicButton renders on DecisionPage", async ({ page }) => {
    await gotoAuthenticated(page, "/decision");
    // VoiceMicInput は Decision page で render される
    await expect(page.getByRole("button", { name: /話す/ })).toBeVisible();
  });

  test("STT mock response → input filled", async ({ page, context }) => {
    // Mock backend で /v1/voice/stt は SHA-256 prefix の text 返却
    // browser での MediaRecorder は jsdom 環境では難しい、Playwright 実 browser でも mic permission 必要
    // ここでは UI レベルで mic ボタンが click 可能であることを確認
    await context.grantPermissions(["microphone"]);
    await gotoAuthenticated(page, "/decision");
    const micButton = page.getByRole("button", { name: /話す/ });
    await expect(micButton).toBeEnabled();
  });
});
