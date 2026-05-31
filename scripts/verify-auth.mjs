import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:3000";
const OUT = "./.verify";
mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log("[auth]", ...a);
const errors = [];
const email = `e2e_${Date.now()}@example.com`;
const password = "password123";

const browser = await chromium.launch();
const page = await browser
  .newContext({ viewport: { width: 1400, height: 900 } })
  .then((c) => c.newPage());
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
  if (m.text().includes("[cloud]")) console.log("  >>", m.text());
});
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

try {
  // 1) unauthenticated → redirected to /login by middleware
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.waitForURL(/\/login/, { timeout: 15000 });
  log("unauthenticated / → redirected to", page.url());

  // 2) sign up (local Supabase auto-confirms)
  await page.getByRole("button", { name: /ยังไม่มีบัญชี\? สมัคร/ }).click();
  await page.locator("#email").fill(email);
  await page.locator("#pw").fill(password);
  await page.getByRole("button", { name: /^สมัคร$/ }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 });
  log("signed up + redirected to", page.url(), "as", email);

  // 3) seed accounts from DB trigger present on the add page
  await page.goto(`${BASE}/transactions/new`, { waitUntil: "domcontentloaded" });
  await page.getByText("ลากรูป screenshot").waitFor({ timeout: 15000 });
  await page.getByRole("button", { name: /เพิ่มแถวเอง/ }).click();
  const row = page.locator("tbody tr").first();
  const accts = await row.locator("select").first().locator("option").allTextContents();
  log("seed accounts in select:", accts);

  // 4) add a manual buy → mirrors to Supabase
  await row.locator("select").nth(1).selectOption("buy");
  await row.locator("input").nth(0).fill("TEST");
  await row.locator("input").nth(1).fill("5");
  await row.locator("input").nth(2).fill("10");
  await row.locator("input").nth(4).fill("1");
  await page.getByRole("button", { name: /ยืนยันบันทึกทั้งหมด/ }).click();
  await page.waitForURL(/\/transactions$/, { timeout: 10000 });
  await page.getByRole("cell", { name: "TEST" }).first().waitFor({ timeout: 8000 });
  log("added transaction TEST, now on", page.url());
  await page.waitForTimeout(6000); // let cloud mirror flush
  log("console after add:", errors.length ? errors : "none");
  await page.screenshot({ path: `${OUT}/27-auth-loggedin.png`, fullPage: true });

  // 5) logout → back to /login
  await page.getByRole("button", { name: "ออกจากระบบ" }).click();
  await page.waitForURL(/\/login/, { timeout: 10000 });
  log("logged out → redirected to", page.url());

  log("EMAIL_FOR_DB_CHECK=" + email);
  log("CONSOLE ERRORS:", errors.length ? errors : "none");
  log("DONE");
} catch (err) {
  console.error("[auth] FAILED:", err.message);
  console.error("[auth] console errors:", errors.length ? errors : "none");
  await page.screenshot({ path: `${OUT}/auth-error.png`, fullPage: true }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
}
