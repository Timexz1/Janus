import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:3000";
const OUT = "./.verify";
mkdirSync(OUT, { recursive: true });

const log = (...a) => console.log("[verify]", ...a);
const consoleErrors = [];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(m.text());
});
page.on("pageerror", (e) => consoleErrors.push("pageerror: " + e.message));

try {
  // 1) Dashboard empty → seed sample data
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.getByText("ยังไม่มีรายการเทรด").waitFor({ timeout: 20000 });
  log("dashboard empty state shown");
  await page.getByRole("button", { name: /โหลดข้อมูลตัวอย่าง/ }).click();
  await page.getByText("ต้นทุนพอร์ตที่ถือ").waitFor({ timeout: 10000 });

  // capture the realized-gain stat
  const realized = await page
    .locator("text=กำไรที่เกิดขึ้นจริง")
    .locator("xpath=following-sibling::p[1]")
    .first()
    .textContent()
    .catch(() => null);
  log("dashboard realized gain card:", realized);
  await page.screenshot({ path: `${OUT}/01-dashboard.png`, fullPage: true });

  // 2) Add Transaction page (empty)
  await page.goto(`${BASE}/transactions/new`, { waitUntil: "domcontentloaded" });
  await page.locator("#accountId").waitFor({ timeout: 15000 });
  log("add-transaction form loaded");
  await page.screenshot({ path: `${OUT}/02-add-empty.png`, fullPage: true });

  // 3) Fill a valid SELL of ASTS (10 of 18.04 held) → live preview
  await page.locator("#side").selectOption("sell");
  await page.locator("#accountId").selectOption("acc_webull");
  await page.locator("#ticker").fill("ASTS");
  await page.locator("#exchange").selectOption("NASDAQ");
  await page.locator("#qty").fill("10");
  await page.locator("#price").fill("130");
  await page.locator("#fees").fill("1");
  await page.getByText("เงินที่ได้รับสุทธิ").waitFor({ timeout: 8000 });
  const netPreview = await page
    .getByText("เงินที่ได้รับสุทธิ")
    .locator("xpath=following-sibling::dd[1]")
    .textContent()
    .catch(() => null);
  log("preview net (sell 10 @130 fee1):", netPreview, "(expect $1,299.00)");
  await page.screenshot({ path: `${OUT}/03-add-sell-preview.png`, fullPage: true });

  // 4) PROBE: oversell guardrail — qty 100 > 18.04 held
  await page.locator("#qty").fill("100");
  await page.getByRole("button", { name: /ยืนยันบันทึก/ }).click();
  const guardErr = await page
    .getByText(/ขายได้ไม่เกิน/)
    .first()
    .textContent({ timeout: 8000 })
    .catch(() => null);
  log("guardrail error:", guardErr);
  await page.screenshot({ path: `${OUT}/04-guardrail-oversell.png`, fullPage: true });
  log("still on add page?", page.url().includes("/transactions/new"));

  // 5) Fix to valid qty 10 and confirm → should navigate to /transactions
  await page.locator("#qty").fill("10");
  await page.getByRole("button", { name: /ยืนยันบันทึก/ }).click();
  await page.waitForURL(/\/transactions$/, { timeout: 10000 });
  await page.getByText("รายการเทรด").first().waitFor();
  log("navigated to transactions after valid sell");
  await page.screenshot({ path: `${OUT}/05-transactions-after-sell.png`, fullPage: true });

  // capture realized gains shown in the table
  const tableText = await page.locator("table").innerText().catch(() => "");
  log("transactions table snippet:\n" + tableText.split("\n").slice(0, 8).join("\n"));

  log("CONSOLE ERRORS:", consoleErrors.length ? consoleErrors : "none");
  log("DONE");
} catch (err) {
  console.error("[verify] FAILED:", err.message);
  await page.screenshot({ path: `${OUT}/error.png`, fullPage: true }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
}
