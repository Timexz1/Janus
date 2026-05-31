import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:3000";
const OUT = "./.verify";
mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log("[config]", ...a);
const errors = [];

const browser = await chromium.launch();
const page = await browser
  .newContext({ viewport: { width: 1400, height: 900 } })
  .then((c) => c.newPage());
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

try {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /โหลดข้อมูลตัวอย่าง/ }).click().catch(() => {});
  await page.waitForTimeout(800);

  // THEME: toggle to light
  await page.getByRole("button", { name: "สลับธีมสว่าง/มืด" }).click();
  await page.waitForTimeout(500);
  const cls = await page.evaluate(() => document.documentElement.className);
  log("after theme toggle, <html> class:", cls, "→ light?", cls.includes("light"));
  await page.screenshot({ path: `${OUT}/18-theme-light.png`, fullPage: true });

  // back to dark
  await page.getByRole("button", { name: "สลับธีมสว่าง/มืด" }).click();
  await page.waitForTimeout(300);

  // LANGUAGE: toggle to EN
  await page.getByRole("button", { name: "สลับภาษา ไทย/อังกฤษ" }).click();
  await page.waitForTimeout(500);
  const hasEnglishNav = await page.getByRole("link", { name: /Dashboard/ }).count();
  log("after language toggle, English nav 'Dashboard' present?", hasEnglishNav > 0);
  await page.screenshot({ path: `${OUT}/19-language-en.png`, fullPage: true });
  // back to TH
  await page.getByRole("button", { name: "สลับภาษา ไทย/อังกฤษ" }).click();

  // TYPHOON: configure key in Settings
  await page.goto(`${BASE}/settings`, { waitUntil: "domcontentloaded" });
  await page.locator("#typhoon-key").waitFor({ timeout: 10000 });
  const inputType = await page.locator("#typhoon-key").getAttribute("type");
  log("typhoon key input type (should be password):", inputType);
  await page.locator("#typhoon-key").fill("sk-test-ABC123");
  await page.getByRole("button", { name: /บันทึก key/ }).click();
  await page.waitForTimeout(500);
  const status = await page.getByText(/ตั้งค่า key แล้ว|ยังไม่ได้ตั้งค่า key/).textContent();
  log("typhoon status after save:", status);
  const persisted = await page.evaluate(() => {
    const raw = localStorage.getItem("janus.taxSettings.v1");
    return raw ? JSON.parse(raw).typhoonApiKey : null;
  });
  log("persisted key in localStorage:", persisted);
  await page.screenshot({ path: `${OUT}/20-typhoon-settings.png`, fullPage: true });

  log("CONSOLE ERRORS:", errors.length ? errors : "none");
  log("DONE");
} catch (err) {
  console.error("[config] FAILED:", err.message);
  await page.screenshot({ path: `${OUT}/config-error.png`, fullPage: true }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
}
