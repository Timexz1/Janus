import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:3000";
const OUT = "./.verify";
mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log("[remit]", ...a);
const errors = [];

const browser = await chromium.launch();
const page = await browser
  .newContext({ viewport: { width: 1500, height: 950 } })
  .then((c) => c.newPage());
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

const valueOf = (label) =>
  page.getByText(label, { exact: false }).first()
    .locator("xpath=following-sibling::p[1]").textContent().catch(() => null);

try {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /โหลดข้อมูลตัวอย่าง/ }).click().catch(() => {});
  await page.waitForTimeout(600);

  await page.goto(`${BASE}/remittances`, { waitUntil: "domcontentloaded" });
  await page.locator("#r-dir").waitFor({ timeout: 10000 });

  // outbound (funding) 5000
  await page.locator("#r-dir").selectOption("outbound");
  await page.locator("#r-amt").fill("5000");
  await page.locator("#r-fx").fill("36.5");
  await page.getByRole("button", { name: /บันทึก/ }).click();
  await page.waitForTimeout(400);

  // inbound (to Thailand) 2000
  await page.locator("#r-dir").selectOption("inbound");
  await page.locator("#r-amt").fill("2000");
  await page.locator("#r-fx").fill("36.5");
  await page.getByRole("button", { name: /บันทึก/ }).click();
  await page.waitForTimeout(500);

  log("outbound total:", await valueOf("โอนออกไปลงทุนสะสม"));
  log("inbound total:", await valueOf("นำกลับเข้าไทยสะสม"));
  log("taxable matched gain:", await valueOf("กำไรที่เข้าฐานภาษี"));
  const tbl = await page.locator("table").innerText().catch(() => "");
  log("table:\n" + tbl.split("\n").slice(0, 4).join("\n"));
  await page.screenshot({ path: `${OUT}/24-remittances-inout.png`, fullPage: true });

  // tax page should only count inbound (2000 → gain 1053.17 → ฿38,440.58)
  await page.goto(`${BASE}/tax`, { waitUntil: "domcontentloaded" });
  await page.locator("#inc").waitFor({ timeout: 10000 });
  await page.locator("#inc").fill("500000");
  await page.waitForTimeout(500);
  log("tax: taxable remitted THB =", await valueOf("กำไรโอนกลับ"), "| tax =", await valueOf("ภาษีโดยประมาณ"));
  await page.screenshot({ path: `${OUT}/25-tax-inbound-only.png`, fullPage: true });

  log("CONSOLE ERRORS:", errors.length ? errors : "none");
  log("DONE");
} catch (err) {
  console.error("[remit] FAILED:", err.message);
  await page.screenshot({ path: `${OUT}/remit-error.png`, fullPage: true }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
}
