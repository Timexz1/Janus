import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = "http://localhost:3000";
const OUT = "./.verify";
mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log("[batch2]", ...a);
const errors = [];

const PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const d1 = `${OUT}/dup1.png`;
const d2 = `${OUT}/dup2.png`;
writeFileSync(d1, Buffer.from(PNG_B64, "base64"));
writeFileSync(d2, Buffer.from(PNG_B64, "base64"));

const browser = await chromium.launch();
const page = await browser
  .newContext({ viewport: { width: 1500, height: 950 } })
  .then((c) => c.newPage());
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

try {
  // seed + dashboard holdings table
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /โหลดข้อมูลตัวอย่าง/ }).click().catch(() => {});
  await page.getByText("ทรัพย์สินที่ถืออยู่").waitFor({ timeout: 15000 });
  await page.waitForTimeout(2000);
  log("dashboard holdings table rendered");
  await page.screenshot({ path: `${OUT}/21-dashboard-holdings.png`, fullPage: true });

  // settings → Claude provider + model selector
  await page.goto(`${BASE}/settings`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /Claude \(แม่นสุด\)/ }).click();
  await page.locator("#claude-model").waitFor({ timeout: 8000 });
  const opts = await page.locator("#claude-model option").allTextContents();
  log("claude model options:", opts);
  await page.screenshot({ path: `${OUT}/22-settings-claude.png`, fullPage: true });

  // import → upload duplicate images → dedupe badge + lightbox
  await page.goto(`${BASE}/transactions/new`, { waitUntil: "domcontentloaded" });
  await page.getByText("ลากรูป screenshot").waitFor({ timeout: 15000 });
  await page.locator('input[type="file"]').setInputFiles([d1, d2]);
  await page.waitForTimeout(800);
  const rowCount = await page.locator("tbody tr").count();
  const dupBadge = await page.getByText("ซ้ำ", { exact: true }).count();
  log("uploaded 2 identical images → rows:", rowCount, "| 'ซ้ำ' badges:", dupBadge);
  // open lightbox
  await page.getByRole("button", { name: "ขยายรูป" }).first().click();
  await page.getByRole("dialog").waitFor({ timeout: 5000 });
  log("lightbox opened on thumbnail click");
  await page.screenshot({ path: `${OUT}/23-import-lightbox.png`, fullPage: true });

  log("CONSOLE ERRORS:", errors.length ? errors : "none");
  log("DONE");
} catch (err) {
  console.error("[batch2] FAILED:", err.message);
  await page.screenshot({ path: `${OUT}/batch2-error.png`, fullPage: true }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
}
