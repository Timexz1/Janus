import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:3000";
const OUT = "./.verify";
mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log("[chart]", ...a);

const errors = [];
const browser = await chromium.launch();
const page = await browser
  .newContext({ viewport: { width: 1500, height: 950 } })
  .then((c) => c.newPage());
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

try {
  // seed sample data (ASTS buy+sell, RDW buy)
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.getByText("ยังไม่มีรายการเทรด").waitFor({ timeout: 20000 });
  await page.getByRole("button", { name: /โหลดข้อมูลตัวอย่าง/ }).click();
  await page.getByText("ต้นทุนพอร์ตที่ถือ").waitFor({ timeout: 10000 });

  // go to charts
  await page.goto(`${BASE}/charts`, { waitUntil: "domcontentloaded" });
  await page.getByText("ราคาจริงรายวัน").waitFor({ timeout: 15000 });
  // wait for the candlestick canvas to render
  await page.locator("canvas").first().waitFor({ timeout: 20000 });
  await page.waitForTimeout(2000); // let fitContent + markers draw

  const lastPrice = await page
    .getByText("ราคาล่าสุด")
    .locator("xpath=following-sibling::p[1]")
    .textContent()
    .catch(() => null);
  const avgCost = await page
    .getByText("ต้นทุนเฉลี่ย")
    .first()
    .locator("xpath=following-sibling::p[1]")
    .textContent()
    .catch(() => null);
  const buysSells = await page
    .getByText("จุดซื้อ / ขาย")
    .locator("xpath=following-sibling::p[1]")
    .textContent()
    .catch(() => null);
  log("ASTS — last:", lastPrice, "| avgCost:", avgCost, "| buys/sells:", buysSells);
  await page.screenshot({ path: `${OUT}/10-charts-asts.png`, fullPage: true });

  // switch to RDW
  await page.locator("select").first().selectOption("RDW");
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/11-charts-rdw.png`, fullPage: true });
  log("switched to RDW, captured");

  log("CONSOLE ERRORS:", errors.length ? errors : "none");
  log("DONE");
} catch (err) {
  console.error("[chart] FAILED:", err.message);
  await page.screenshot({ path: `${OUT}/chart-error.png`, fullPage: true }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
}
