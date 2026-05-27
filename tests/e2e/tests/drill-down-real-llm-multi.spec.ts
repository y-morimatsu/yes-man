/** drill-down-real-llm-multi.spec.ts — 実 LLM 経由で複数お題 × Amazon 系到達率測定.
 *
 * 5 お題 (映画 / 洋服 / 本 / 音楽 / ゲーム) × 3 試行 = 計 15 試行 (~5 分).
 *
 * **手動実行のみ** (CI / 通常 e2e では skip):
 *   RUN_REAL_LLM_E2E=1 pnpm playwright test drill-down-real-llm-multi
 */
import { test } from "@playwright/test";
import { gotoAuthenticated } from "../fixtures/auth";

test.skip(
  !process.env.RUN_REAL_LLM_E2E,
  "real-LLM 経由の手動 E2E. 走らせるには RUN_REAL_LLM_E2E=1 を set",
);

const SCENARIOS = [
  { prompt: "映画見たい", expectedDomain: "amazon.co.jp/gp/video/storefront", label: "Amazon Prime Video" },
  { prompt: "洋服欲しい", expectedDomain: "amazon.co.jp/fashion", label: "Amazon Fashion" },
  { prompt: "本を読みたい", expectedDomain: "amazon.co.jp/kindlestore", label: "Kindle" },
  { prompt: "音楽聴きたい", expectedDomain: "music.amazon.co.jp", label: "Amazon Music" },
  { prompt: "ゲームしたい", expectedDomain: "gaming.amazon.com", label: "Amazon Prime Gaming" },
];
const TRIALS_PER_SCENARIO = 3;

test.setTimeout(1_800_000);

test("複数お題 × Amazon 系 CTA 到達率", async ({ page }) => {
  const allResults: Array<{ scenario: string; trial: number; finalService: string | null; finalUrl: string | null; depthReached: number; chainTexts: string[] }> = [];

  for (const sc of SCENARIOS) {
    for (let trial = 1; trial <= TRIALS_PER_SCENARIO; trial++) {
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
      await page.getByPlaceholder(/今日/).fill(sc.prompt);
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
      allResults.push({
        scenario: sc.prompt,
        trial,
        finalService: finalProposal?.serviceName ?? null,
        finalUrl: finalProposal?.serviceUrl ?? null,
        depthReached: proposals.at(-1)?.depth ?? 0,
        chainTexts: proposals.map((p) => `d${p.depth}: ${p.text}`),
      });
      const hit = finalProposal?.serviceUrl?.includes(sc.expectedDomain);
      console.log(`[${sc.prompt}] trial ${trial}: ${finalProposal?.serviceName ?? "なし"} ${hit ? "✅" : "❌"}`);
      page.off("response", handler);
    }
  }

  console.log("\n========= 集計 =========");
  for (const sc of SCENARIOS) {
    const trials = allResults.filter((r) => r.scenario === sc.prompt);
    const hits = trials.filter((r) => r.finalUrl?.includes(sc.expectedDomain)).length;
    const services = trials.map((r) => r.finalService ?? "(未到達)").join(" / ");
    console.log(`「${sc.prompt}」→ 期待:${sc.label}  到達 ${hits}/${TRIALS_PER_SCENARIO}  内訳: ${services}`);
  }

  console.log("\n========= 不一致 trial の chain dump =========");
  for (const sc of SCENARIOS) {
    const fails = allResults.filter((r) => r.scenario === sc.prompt && !r.finalUrl?.includes(sc.expectedDomain));
    for (const f of fails) {
      console.log(`\n--- 「${f.scenario}」trial ${f.trial} (final=${f.finalService}) ---`);
      for (const c of f.chainTexts) console.log(`  ${c}`);
    }
  }
});
