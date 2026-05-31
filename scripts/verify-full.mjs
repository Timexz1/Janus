import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:3000";
const OUT = "./.verify";
mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log("[full]", ...a);
const errors = [];

const browser = await chromium.launch();
const page = await browser
  .newContext({ viewport: { width: 1500, height: 1000 } })
  .then((c) => c.newPage());
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

const valueOf = (label) =>
  page
    .getByText(label, { exact: false })
    .first()
    .locator("xpath=following-sibling::p[1]")
    .textContent()
    .catch(() => null);

try {
  // seed
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.getByText("ยังไม่มีรายการเทรด").waitFor({ timeout: 20000 });
  await page.getByRole("button", { name: /โหลดข้อมูลตัวอย่าง/ }).click();
  await page.getByText("ต้นทุนพอร์ตที่ถือ").waitFor({ timeout: 10000 });
  // wait for metrics charts + prices
  await page.locator("svg.recharts-surface").first().waitFor({ timeout: 15000 });
  await page.waitForTimeout(2500);
  log("dashboard unrealized:", await valueOf("กำไรที่ยังไม่เกิด"), "| tax card present");
  log("dashboard winRate:", await valueOf("Win rate"), "| XIRR:", await valueOf("XIRR (ต่อปี)"));
  await page.screenshot({ path: `${OUT}/12-dashboard.png`, fullPage: true });

  // TAX page (before remittance) + what-if
  await page.goto(`${BASE}/tax`, { waitUntil: "domcontentloaded" });
  await page.locator("#inc").waitFor({ timeout: 10000 });
  await page.locator("#inc").fill("500000");
  await page.locator("#wf-amt").fill("1000");
  await page.locator("#wf-fx").fill("36.5");
  await page.waitForTimeout(800);
  log("tax total:", await valueOf("ภาษีโดยประมาณ"));
  const marginal = await page.getByText("ภาษีส่วนเพิ่ม").locator("xpath=following-sibling::dd[1]").textContent().catch(() => null);
  log("what-if marginal:", marginal);
  await page.screenshot({ path: `${OUT}/13-tax.png`, fullPage: true });

  // REMITTANCES — add one and check matched taxable THB
  await page.goto(`${BASE}/remittances`, { waitUntil: "domcontentloaded" });
  await page.locator("#r-amt").waitFor({ timeout: 10000 });
  await page.locator("#r-amt").fill("2000");
  await page.locator("#r-fx").fill("36.5");
  await page.getByRole("button", { name: /บันทึก/ }).click();
  await page.waitForTimeout(800);
  const remTable = await page.locator("table").innerText().catch(() => "");
  log("remittance row:\n" + remTable.split("\n").slice(0, 3).join("\n"));
  await page.screenshot({ path: `${OUT}/14-remittances.png`, fullPage: true });

  // CHARTS — current asset gain/loss status
  await page.goto(`${BASE}/charts`, { waitUntil: "domcontentloaded" });
  await page.locator("canvas").first().waitFor({ timeout: 20000 });
  await page.waitForTimeout(2000);
  log("charts current P/L:", await valueOf("กำไร/ขาดทุนปัจจุบัน"));
  await page.screenshot({ path: `${OUT}/15-charts-status.png`, fullPage: true });

  // SETTINGS
  await page.goto(`${BASE}/settings`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "บัญชีโบรกเกอร์" }).waitFor({ timeout: 10000 });
  await page.screenshot({ path: `${OUT}/16-settings.png`, fullPage: true });
  log("settings rendered");

  log("CONSOLE ERRORS:", errors.length ? errors : "none");
  log("DONE");
} catch (err) {
  console.error("[full] FAILED:", err.message);
  await page.screenshot({ path: `${OUT}/full-error.png`, fullPage: true }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
}
