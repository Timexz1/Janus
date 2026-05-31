import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:3000";
const OUT = "./.verify";
mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log("[ticker]", ...a);
const errors = [];

const browser = await chromium.launch();
const page = await browser
  .newContext({ viewport: { width: 1400, height: 900 } })
  .then((c) => c.newPage());
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

try {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.getByText("ยังไม่มีรายการเทรด").waitFor({ timeout: 20000 });
  await page.getByRole("button", { name: /โหลดข้อมูลตัวอย่าง/ }).click();
  await page.getByText("ต้นทุนพอร์ตที่ถือ").waitFor({ timeout: 10000 });

  // from Transactions, click the RDW ticker link → should open RDW chart
  await page.goto(`${BASE}/transactions`, { waitUntil: "domcontentloaded" });
  await page.getByRole("link", { name: "RDW", exact: true }).first().click();
  await page.waitForURL(/\/charts\?ticker=RDW/, { timeout: 10000 });
  await page.getByText("RDW · ราคาจริง").waitFor({ timeout: 15000 });
  await page.locator("canvas").first().waitFor({ timeout: 20000 });
  await page.waitForTimeout(1500);
  log("clicked RDW ticker → navigated to RDW chart OK, url:", page.url());
  await page.screenshot({ path: `${OUT}/17-ticker-link-rdw.png`, fullPage: true });

  log("CONSOLE ERRORS:", errors.length ? errors : "none");
  log("DONE");
} catch (err) {
  console.error("[ticker] FAILED:", err.message);
  await page.screenshot({ path: `${OUT}/ticker-error.png`, fullPage: true }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
}
