export type Lang = "th" | "en";

/**
 * UI string dictionary. Thai is the source language; English is provided for
 * the chrome and page headers. Missing keys fall back to Thai (see useT), so
 * coverage can grow incrementally without breaking the UI. Tickers/numbers stay
 * as-is per the brief.
 */
export const dict: Record<Lang, Record<string, string>> = {
  th: {
    "nav.dashboard": "แดชบอร์ด",
    "nav.holdings": "พอร์ต",
    "nav.transactions": "รายการ",
    "nav.charts": "กราฟ",
    "nav.remittances": "การโอน",
    "nav.tax": "ภาษี",
    "nav.settings": "ตั้งค่า",
    "nav.add": "เพิ่มรายการ",

    "common.save": "บันทึก",
    "common.cancel": "ยกเลิก",
    "common.delete": "ลบ",
    "common.confirm": "ยืนยันบันทึก",
    "common.addFirst": "เพิ่มรายการแรก",
    "common.loadSample": "โหลดข้อมูลตัวอย่าง",
    "common.viewAll": "ดูทั้งหมด",

    "footer.disclaimerLabel": "ข้อจำกัดความรับผิด:",
    "footer.disclaimer":
      "แอปนี้เป็นเครื่องมือประมาณการ ไม่ใช่คำแนะนำทางภาษีหรือกฎหมาย โปรดตรวจสอบกับกรมสรรพากร (สายด่วน 1161) หรือนักบัญชีก่อนยื่นจริง หลักเกณฑ์ภาษีเงินได้จากต่างประเทศอาจเปลี่ยนแปลงได้",

    "dashboard.title": "แดชบอร์ด",
    "dashboard.subtitle": "ภาพรวมพอร์ตหุ้นสหรัฐฯ กำไร และภาษีประมาณการ",
    "dashboard.openCost": "ต้นทุนพอร์ตที่ถือ",
    "dashboard.marketValue": "มูลค่าตลาด",
    "dashboard.unrealized": "กำไรที่ยังไม่เกิด",
    "dashboard.realized": "กำไรที่เกิดขึ้นจริง",
    "dashboard.recent": "รายการล่าสุด",
    "dashboard.taxEstimate": "ภาษีโดยประมาณปีนี้",

    "holdings.title": "พอร์ตถือครอง",
    "transactions.title": "รายการเทรด",
    "charts.title": "กราฟราคา",
    "remittances.title": "การโอนเงิน (เข้า/ออก)",
    "tax.title": "ภาษีเงินได้ (ประมาณการ)",
    "settings.title": "ตั้งค่า",
    "settings.subtitle": "ค่าเริ่มต้นของการคำนวณภาษี การแสดงผล และบัญชีโบรกเกอร์",
    "settings.display": "การแสดงผล",
    "settings.theme": "ธีม",
    "settings.language": "ภาษา",
    "settings.themeDark": "มืด",
    "settings.themeLight": "สว่าง",
    "settings.langTh": "ไทย",
    "settings.langEn": "อังกฤษ",
  },
  en: {
    "nav.dashboard": "Dashboard",
    "nav.holdings": "Holdings",
    "nav.transactions": "Trades",
    "nav.charts": "Charts",
    "nav.remittances": "Remittances",
    "nav.tax": "Tax",
    "nav.settings": "Settings",
    "nav.add": "Add",

    "common.save": "Save",
    "common.cancel": "Cancel",
    "common.delete": "Delete",
    "common.confirm": "Confirm & save",
    "common.addFirst": "Add first trade",
    "common.loadSample": "Load sample data",
    "common.viewAll": "View all",

    "footer.disclaimerLabel": "Disclaimer:",
    "footer.disclaimer":
      "This app is an estimation tool, not tax or legal advice. Please verify with the Revenue Department (1161) or an accountant before filing. Foreign-income tax rules may change.",

    "dashboard.title": "Dashboard",
    "dashboard.subtitle": "Overview of your US-stock portfolio, gains and estimated tax",
    "dashboard.openCost": "Open cost basis",
    "dashboard.marketValue": "Market value",
    "dashboard.unrealized": "Unrealized P/L",
    "dashboard.realized": "Realized gain",
    "dashboard.recent": "Recent trades",
    "dashboard.taxEstimate": "Estimated tax this year",

    "holdings.title": "Holdings",
    "transactions.title": "Trades",
    "charts.title": "Price charts",
    "remittances.title": "Money transfers (in/out)",
    "tax.title": "Income tax (estimate)",
    "settings.title": "Settings",
    "settings.subtitle": "Defaults for tax calculation, display and broker accounts",
    "settings.display": "Display",
    "settings.theme": "Theme",
    "settings.language": "Language",
    "settings.themeDark": "Dark",
    "settings.themeLight": "Light",
    "settings.langTh": "Thai",
    "settings.langEn": "English",
  },
};
