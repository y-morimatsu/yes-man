/** score.spec.ts — Story C1-C4 (U-Test FD §2.2.4 + ultrathink Imp1: API seed + UI verify hybrid). */
import { expect, test } from "@playwright/test";
import { gotoAuthenticated } from "../fixtures/auth";

test.describe("ScorePage", () => {
  test("ScorePage renders for initial state (no decisions)", async ({ page }) => {
    await gotoAuthenticated(page, "/score");
    await expect(page.getByRole("heading", { name: /YesMan スコア/ })).toBeVisible();
  });

  // skip: Mock storage backend の workers 間共有で HTTP 500 が出る (Issue #80)
  test.skip("No 5 連発 → danger UI (API seed hybrid)", async ({ page, request }) => {
    // ultrathink Imp1: API 経由で 5 件 seed (~2s)
    for (let i = 0; i < 5; i++) {
      const decisionResp = await request.post(
        "http://localhost:8000/v1/decisions/request",
        { data: { user_input: `テスト ${i}` } },
      );
      const { decision_id } = await decisionResp.json();
      await request.post(
        `http://localhost:8000/v1/decisions/${decision_id}/choice`,
        { data: { choice: "no" } },
      );
    }
    // UI で danger 表示 verify (gotoAuthenticated で localStorage seed して認証 state)
    await gotoAuthenticated(page, "/score");
    await expect(page.getByRole("alert")).toBeVisible({ timeout: 5_000 });
  });
});
