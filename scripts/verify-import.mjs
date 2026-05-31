import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = "http://localhost:3000";
const OUT = "./.verify";
mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log("[import]", ...a);

// a tiny valid 1x1 PNG to exercise the multi-upload + OCR path
const PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const dummy = `${OUT}/dummy.png`;
writeFileSync(dummy, Buffer.from(PNG_B64, "base64"));

const errors = [];
const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1500, height: 950 } }).then((c) => c.newPage());
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

try {
  await page.goto(`${BASE}/transactions/new`, { waitUntil: "domcontentloaded" });
  await page.getByText("ลากรูป screenshot").waitFor({ timeout: 20000 });
  log("import page loaded");
  await page.screenshot({ path: `${OUT}/06-import-empty.png`, fullPage: true });

  // 1) manual row → fill a valid BUY
  await page.getByRole("button", { name: /เพิ่มแถวเอง/ }).click();
  const row = page.locator("tbody tr").first();
  await row.locator("select").nth(0).selectOption("acc_webull");
  await row.locator("select").nth(1).selectOption("buy");
  await row.locator("input").nth(0).fill("ASTS"); // ticker
  await row.locator("input").nth(1).fill("10"); // qty
  await row.locator("input").nth(2).fill("50"); // price
  await row.locator("input").nth(4).fill("1"); // fees
  await page.getByText("$501.00").first().waitFor({ timeout: 5000 });
  log("manual buy row net preview = $501.00 OK");
  await page.screenshot({ path: `${OUT}/07-import-manual-row.png`, fullPage: true });

  // 2) upload a dummy image → OCR (no key → graceful per-row error)
  await page.locator('input[type="file"]').setInputFiles(dummy);
  await page.getByRole("button", { name: /OCR ทั้งหมด/ }).click();
  await page.getByText(/ยังไม่ได้ตั้งค่า TYPHOON/).waitFor({ timeout: 20000 });
  log("OCR without key → row shows graceful 503 message OK");
  await page.screenshot({ path: `${OUT}/08-import-ocr-nokey.png`, fullPage: true });

  // 3) confirm with the empty image row present → validation blocks
  await page.getByRole("button", { name: /ยืนยันบันทึกทั้งหมด/ }).click();
  const blocked = await page
    .getByText(/ข้อมูลไม่ครบ|บันทึกไม่ได้/)
    .first()
    .textContent({ timeout: 5000 })
    .catch(() => null);
  log("confirm with invalid row blocked:", blocked);

  // 4) remove the image row, confirm → saves and navigates
  await page.locator("tbody tr").nth(1).getByRole("button", { name: /ลบแถว/ }).click();
  await page.getByRole("button", { name: /ยืนยันบันทึกทั้งหมด/ }).click();
  await page.waitForURL(/\/transactions$/, { timeout: 10000 });
  const tableText = await page.locator("table").innerText().catch(() => "");
  log("saved → transactions table:\n" + tableText.split("\n").slice(0, 4).join("\n"));
  await page.screenshot({ path: `${OUT}/09-import-saved.png`, fullPage: true });

  log("CONSOLE ERRORS:", errors.length ? errors : "none");
  log("DONE");
} catch (err) {
  console.error("[import] FAILED:", err.message);
  await page.screenshot({ path: `${OUT}/import-error.png`, fullPage: true }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
}
