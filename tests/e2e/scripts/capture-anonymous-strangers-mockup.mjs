/**
 * capture-anonymous-strangers-mockup.mjs — mockup HTML を Playwright で screenshot.
 *
 * 出力先:
 *   - aidlc-docs/inception/anonymous-strangers/screens/00-full-mockup.png  (全景)
 *   - aidlc-docs/inception/anonymous-strangers/screens/{01..NN}-{label}.png (各画面)
 *
 * 実行:
 *   cd tests/e2e && node scripts/capture-anonymous-strangers-mockup.mjs
 */
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MOCKUP_PATH = path.resolve(
  __dirname,
  "../../../docs/superpowers/idea/mockup-anonymous-strangers.html",
);
const OUT_DIR = path.resolve(
  __dirname,
  "../../../aidlc-docs/inception/anonymous-strangers/screens",
);

const slugify = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9一-龥ぁ-ゔァ-ヴー\s\-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 40);

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  await page.goto(pathToFileURL(MOCKUP_PATH).toString(), {
    waitUntil: "networkidle",
  });

  // 全景: full page screenshot (lengthy)
  const fullPath = path.join(OUT_DIR, "00-full-mockup.png");
  await page.screenshot({ path: fullPath, fullPage: true });
  console.log(`✅ ${fullPath}`);

  // 各 .screen-block を順番に capture
  const screenBlocks = await page.locator(".screen-block").all();
  console.log(`Found ${screenBlocks.length} screen-block elements`);

  let idx = 1;
  for (const block of screenBlocks) {
    const labelText = await block.locator(".screen-label").first().innerText();
    // ラベル例: "画面 5 5a — 1 人目 が話す" → "05-screen-5"
    const cleanLabel =
      slugify(labelText.replace(/\n/g, " ").replace(/\s+/g, " ").trim()) ||
      `screen-${idx}`;
    const filename = `${String(idx).padStart(2, "0")}-${cleanLabel}.png`;
    const out = path.join(OUT_DIR, filename);
    await block.screenshot({ path: out });
    console.log(`✅ ${out}  (${labelText.split("\n")[0].slice(0, 60)})`);
    idx++;
  }

  await context.close();
  await browser.close();
  console.log(`\n📸 完了: ${idx - 1} 画面 + 全景 1 枚 = 計 ${idx} 枚`);
  console.log(`📁 出力先: ${OUT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
