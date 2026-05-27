/** drill-down-real-llm-stats.spec.ts — 実 LLM 経由で同一お題を N 試行し到達率測定.
 *
 * 「映画見たい」 を N 試行して、Amazon Prime Video CTA への到達率を集計.
 *
 * **手動実行のみ** (CI / 通常 e2e では skip):
 *   RUN_REAL_LLM_E2E=1 pnpm playwright test drill-down-real-llm-stats
 */
import { test } from "@playwright/test";
import { gotoAuthenticated } from "../fixtures/auth";

const TRIALS = 5;
const PROMPT = "映画見たい";

test.skip(
  !process.env.RUN_REAL_LLM_E2E,
  "real-LLM 経由の手動 E2E. 走らせるには RUN_REAL_LLM_E2E=1 を set",
);
test.setTimeout(900_000);

test(`「${PROMPT}」: ${TRIALS} 試行で Amazon Prime Video 到達率`, async ({ page }) => {
  const results: Array<{ trial: number; finalService: string | null; finalUrl: string | null; chainTexts: string[]; depthReached: number }> = [];

  for (let trial = 1; trial <= TRIALS; trial++) {
    const proposals: Array<{ depth: number; isFinal: boolean; serviceName: string | null; serviceUrl: string | null; text: string }> = [];
    const handler = async (res: any) => {
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
      } catch {/* ignore */}
    };
    page.on("response", handler);

    await gotoAuthenticated(page, "/decision");
    await page.getByPlaceholder(/今日/).fill(PROMPT);
    await page.getByRole("button", { name: /送信/ }).click();
    await page.waitForSelector('[data-testid="proposal-result-card"]', { timeout: 120_000 });

    const nudgeHeading = page.getByRole("heading", { name: /Yes 採択|素晴らしい従順さ/ });
    for (let i = 0; i < 6; i++) {
      if (await nudgeHeading.isVisible().catch(() => false)) break;
      const yes = page.getByRole("button", { name: /Yes/, exact: false }).first();
      if (!(await yes.isVisible().catch(() => false))) break;
      await yes.click();
      await Promise.race([
        nudgeHeading.waitFor({ timeout: 120_000 }).catch(() => undefined),
        page.getByTestId("proposal-result-card").waitFor({ timeout: 120_000 }).catch(() => undefined),
      ]);
      await page.waitForTimeout(300);
    }

    const finalProposal = proposals.filter((p) => p.isFinal).at(-1);
    const chainTexts = proposals.map((p) => `d${p.depth}: ${p.text}`);
    results.push({
      trial,
      finalService: finalProposal?.serviceName ?? null,
      finalUrl: finalProposal?.serviceUrl ?? null,
      chainTexts,
      depthReached: proposals.at(-1)?.depth ?? 0,
    });
    console.log(`[trial ${trial}] final=${finalProposal?.serviceName ?? "なし"} depth=${proposals.at(-1)?.depth ?? "?"}`);

    page.off("response", handler);
  }

  console.log("\n========= 試行別 chain =========");
  for (const r of results) {
    console.log(`\n--- trial ${r.trial} (depth=${r.depthReached}, final=${r.finalService ?? "なし"}) ---`);
    for (const c of r.chainTexts) console.log(`  ${c}`);
  }

  console.log("\n========= 集計 =========");
  const reachedAmazonPrime = results.filter((r) => r.finalUrl?.includes("amazon.co.jp/gp/video/storefront")).length;
  const reachedAnyAmazon = results.filter((r) => r.finalUrl?.includes("amazon.co.jp")).length;
  const reachedFinal = results.filter((r) => r.finalUrl !== null).length;
  console.log(`Amazon Prime Video 到達: ${reachedAmazonPrime}/${TRIALS}`);
  console.log(`Amazon 系 到達        : ${reachedAnyAmazon}/${TRIALS}`);
  console.log(`final 到達 (どこか)   : ${reachedFinal}/${TRIALS}`);
  console.log(`final 内訳:`);
  const breakdown: Record<string, number> = {};
  for (const r of results) {
    const key = r.finalService ?? "(未到達)";
    breakdown[key] = (breakdown[key] ?? 0) + 1;
  }
  for (const [k, v] of Object.entries(breakdown)) {
    console.log(`  ${k}: ${v}`);
  }
});
