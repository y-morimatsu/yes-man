/** drill-down-real-llm-verify.spec.ts — 実 LLM (Azure gpt-5.4-nano) 経由の E2E 検証.
 *
 * 「映画見たい」 を Yes 連鎖し、最終的に Amazon Prime Video CTA に届くか確認する.
 *
 * **手動実行のみ** (CI / 通常 e2e では skip):
 *   - 実行には実 Azure API key + 実 LLM 経路で動作中の API server が必要
 *   - 起動例: LLM_PROVIDER=litellm LITELLM_BASE_URL=... LITELLM_API_KEY=... pnpm --filter @yesman/api start
 *   - 実行例: RUN_REAL_LLM_E2E=1 pnpm playwright test drill-down-real-llm-verify
 *
 * playwright.config の webServer は reuseExistingServer=true なので、起動済み API を流用.
 */
import { test } from "@playwright/test";
import { gotoAuthenticated } from "../fixtures/auth";

test.skip(
  !process.env.RUN_REAL_LLM_E2E,
  "real-LLM 経由の手動 E2E. 走らせるには RUN_REAL_LLM_E2E=1 を set",
);
test.setTimeout(300_000);

test("「映画見たい」: Yes 連鎖で Amazon Prime Video CTA まで届くか", async ({ page }) => {
  // SSE proposal events を集める
  const proposals: Array<{ depth: number; isFinal: boolean; serviceName: string | null; serviceUrl: string | null; text: string }> = [];

  page.on("response", async (res) => {
    if (!res.url().includes("/v1/decisions/request/stream")) return;
    if (!res.headers()["content-type"]?.includes("text/event-stream")) return;
    try {
      const body = await res.text();
      const lines = body.split("\n");
      let nextIsProposal = false;
      for (const line of lines) {
        if (line === "event: proposal") {
          nextIsProposal = true;
          continue;
        }
        if (nextIsProposal && line.startsWith("data: ")) {
          const json = JSON.parse(line.slice(6));
          proposals.push({
            depth: json.depth,
            isFinal: json.is_final,
            serviceName: json.service?.name ?? null,
            serviceUrl: json.service?.url ?? null,
            text: json.proposal_text,
          });
          nextIsProposal = false;
        } else if (line.startsWith("event:")) {
          nextIsProposal = false;
        }
      }
    } catch {
      /* ignore */
    }
  });

  await gotoAuthenticated(page, "/decision");
  await page.getByPlaceholder(/今日/).fill("映画見たい");
  await page.getByRole("button", { name: /送信/ }).click();

  // root proposal arrival を待つ
  await page.waitForSelector('[data-testid="proposal-result-card"]', { timeout: 120_000 });

  // Yes を最大 6 回連打 (depth=4 で final になるはず)
  const nudgeHeading = page.getByRole("heading", { name: /Yes 採択|素晴らしい従順さ/ });
  for (let i = 0; i < 6; i++) {
    if (await nudgeHeading.isVisible().catch(() => false)) break;
    const yes = page.getByRole("button", { name: /Yes/, exact: false }).first();
    if (!(await yes.isVisible().catch(() => false))) break;
    console.log(`[click ${i + 1}] Yes`);
    await yes.click();
    // 次の proposal-card か nudge を待つ (実 LLM 30-60 秒)
    await Promise.race([
      nudgeHeading.waitFor({ timeout: 120_000 }).catch(() => undefined),
      page.getByTestId("proposal-result-card").waitFor({ timeout: 120_000 }).catch(() => undefined),
    ]);
    await page.waitForTimeout(300);
  }

  // 結果 dump
  console.log("=== 集めた proposal events ===");
  for (const p of proposals) {
    console.log(`  depth=${p.depth} is_final=${p.isFinal} service=${p.serviceName ?? "null"} url=${p.serviceUrl ?? "null"}`);
    console.log(`    text: ${p.text}`);
  }

  // CTA 表示確認
  const cta = page.getByTestId("external-service-cta");
  const ctaVisible = await cta.isVisible().catch(() => false);
  const ctaText = ctaVisible ? await cta.innerText() : null;
  const ctaHref = ctaVisible ? await cta.getAttribute("href") : null;
  console.log(`[CTA visible] ${ctaVisible}`);
  console.log(`[CTA text] ${ctaText}`);
  console.log(`[CTA href] ${ctaHref}`);

  // chain breadcrumb 内容
  const chain = page.getByTestId("drill-down-chain");
  if (await chain.isVisible().catch(() => false)) {
    const chainText = await chain.innerText();
    console.log(`[chain breadcrumb]\n${chainText}`);
  }

  // 判定: Amazon Prime Video URL を含むか
  const finalProposal = proposals.filter((p) => p.isFinal).at(-1);
  if (finalProposal) {
    console.log(`\n>>> 最終 final proposal:\n    service=${finalProposal.serviceName} url=${finalProposal.serviceUrl}\n    届いた?: ${finalProposal.serviceUrl?.includes("amazon.co.jp/Amazon-Video") ? "✅ YES" : "❌ NO (別 service に着地)"}`);
  } else {
    console.log(`\n>>> 最終 final proposal: なし (Yes クリックが MAX_DRILL_DEPTH まで届かなかった)`);
  }
});
