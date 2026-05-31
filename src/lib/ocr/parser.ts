import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import customParseFormat from "dayjs/plugin/customParseFormat";
import { Decimal } from "@/lib/money/decimal";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(customParseFormat);

/**
 * Parser for OCR'd broker screenshots (brief §4.2 / §4.3).
 *
 * Input is the Markdown/plain text returned by Typhoon OCR. Output is a partial
 * trade — best effort, NEVER auto-saved. The Import table lets the user review
 * and fix every field before committing (brief §0: confirm before save).
 *
 * Two profiles are auto-selected from the layout/keywords:
 *   - Webull Thailand: ค่าธรรมเนียมการทำรายการ (single fee), DD/MM/YYYY EDT
 *   - Dime!: ค่าคอมมิชชัน + VAT + TAF Fee, คูปอง, Thai พ.ศ. date
 */

export type Broker = "Webull" | "Dime";

export interface ParsedTrade {
  broker: Broker | null;
  accountId: string | null;
  side: "buy" | "sell" | null;
  ticker: string | null;
  exchange: "NYSE" | "NASDAQ" | "OTHER" | null;
  qty: string | null;
  price: string | null;
  stockValue: string | null;
  fees: string | null; // summed (commission + VAT + TAF + market fee)
  couponsWaived: string | null;
  executedAt: string | null; // ISO
  executedTz: string | null;
  rawText: string;
}

type StructuredOcr = Record<string, unknown>;

const THAI_MONTHS: Record<string, number> = {
  "ม.ค.": 1, "ก.พ.": 2, "มี.ค.": 3, "เม.ย.": 4, "พ.ค.": 5, "มิ.ย.": 6,
  "ก.ค.": 7, "ส.ค.": 8, "ก.ย.": 9, "ต.ค.": 10, "พ.ย.": 11, "ธ.ค.": 12,
};

const RESERVED_TOKENS = new Set([
  "US", "USD", "VAT", "TAF", "EDT", "EST", "NYSE", "NASDAQ", "CTH", "INC",
]);

/** Strip US$, commas, "หุ้น", spaces → a clean decimal string (or null). */
function cleanNum(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const cleaned = raw
    .replace(/US\$?/gi, "")
    .replace(/[,\s]/g, "")
    .replace(/หุ้น/g, "")
    .trim();
  if (cleaned === "") return null;
  try {
    const d = new Decimal(cleaned);
    return d.isFinite() ? cleaned : null;
  } catch {
    return null;
  }
}

function cleanStructuredNum(raw: unknown): string | null {
  if (raw == null) return null;
  return cleanNum(String(raw));
}

function cleanStructuredText(raw: unknown): string | null {
  if (raw == null) return null;
  const text = String(raw).trim();
  if (!text || text.toLowerCase() === "null") return null;
  return text;
}

function extractJsonObject(text: string): StructuredOcr | null {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1)) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as StructuredOcr)
      : null;
  } catch {
    return null;
  }
}

function field(obj: StructuredOcr, ...keys: string[]): unknown {
  for (const key of keys) {
    if (key in obj) return obj[key];
  }
  return undefined;
}

function hasField(obj: StructuredOcr, ...keys: string[]): boolean {
  return keys.some((key) => key in obj);
}

function structuredNumOrFallback(
  obj: StructuredOcr,
  keys: string[],
  fallback: string | null,
): string | null {
  if (!hasField(obj, ...keys)) return fallback;
  return cleanStructuredNum(field(obj, ...keys));
}

function normalizeBroker(raw: unknown): Broker | null {
  const text = cleanStructuredText(raw);
  if (!text) return null;
  if (/webull/i.test(text)) return "Webull";
  if (/dime/i.test(text)) return "Dime";
  return null;
}

function normalizeSide(raw: unknown): "buy" | "sell" | null {
  const text = cleanStructuredText(raw);
  if (!text) return null;
  if (/^buy$|ซื้อ/i.test(text)) return "buy";
  if (/^sell$|ขาย/i.test(text)) return "sell";
  return null;
}

function normalizeExchange(raw: unknown): "NYSE" | "NASDAQ" | "OTHER" | null {
  const text = cleanStructuredText(raw)?.toUpperCase();
  if (!text) return null;
  if (text === "NYSE" || text === "NASDAQ" || text === "OTHER") return text;
  return null;
}

function normalizeTicker(raw: unknown): string | null {
  const text = cleanStructuredText(raw)?.toUpperCase().replace(/[^A-Z.]/g, "");
  if (!text || text.length > 8) return null;
  if (RESERVED_TOKENS.has(text)) return null;
  return text;
}

function normalizeIso(raw: unknown): string | null {
  const text = cleanStructuredText(raw);
  if (!text) return null;
  const d = dayjs(text);
  return d.isValid() ? d.toISOString() : null;
}

function grossMismatch(p: Pick<ParsedTrade, "qty" | "price" | "stockValue">): boolean {
  if (!p.qty || !p.price || !p.stockValue) return false;
  try {
    const gross = new Decimal(p.qty).mul(p.price);
    const reported = new Decimal(p.stockValue);
    const tolerance = Decimal.max(new Decimal("0.05"), reported.abs().mul("0.01"));
    return gross.minus(reported).abs().gt(tolerance);
  } catch {
    return false;
  }
}

function grossMatches(qty: string, price: string | null, stockValue: string | null): boolean {
  if (!price || !stockValue) return false;
  return !grossMismatch({ qty, price, stockValue });
}

function sameNum(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  try {
    return new Decimal(a).eq(b);
  } catch {
    return false;
  }
}

function calculatedFromTotal(qty: string | null, price: string | null, stockValue: string | null): boolean {
  if (!qty || !price || !stockValue) return false;
  try {
    const expected = new Decimal(stockValue).div(price);
    return new Decimal(qty).minus(expected).abs().lte("0.0000005");
  } catch {
    return false;
  }
}

function copiedPriceAsQty(p: Pick<ParsedTrade, "qty" | "price" | "stockValue">): boolean {
  if (!p.qty || !p.price) return false;
  try {
    return grossMismatch(p) && new Decimal(p.qty).eq(p.price);
  } catch {
    return false;
  }
}

function parsedFromStructured(text: string): ParsedTrade | null {
  const json = extractJsonObject(text);
  if (!json) return null;

  const maybeParsed = field(json, "parsed");
  const parsed =
    maybeParsed && typeof maybeParsed === "object" && !Array.isArray(maybeParsed)
      ? (maybeParsed as StructuredOcr)
      : json;
  const rawText = cleanStructuredText(field(json, "rawText", "raw_text")) ?? text;
  const fallback = parseOcrText(rawText);
  const broker = normalizeBroker(field(parsed, "broker")) ?? fallback.broker;
  const accountFromBroker =
    broker === "Webull" ? "acc_webull" : broker === "Dime" ? "acc_dime" : null;

  const result: ParsedTrade = {
    broker,
    accountId:
      cleanStructuredText(field(parsed, "accountId", "account_id")) ??
      fallback.accountId ??
      accountFromBroker,
    side: normalizeSide(field(parsed, "side")) ?? fallback.side,
    ticker: normalizeTicker(field(parsed, "ticker", "symbol")) ?? fallback.ticker,
    exchange: normalizeExchange(field(parsed, "exchange", "market")) ?? fallback.exchange,
    qty: structuredNumOrFallback(parsed, ["qty", "quantity", "shares"], fallback.qty),
    price: cleanStructuredNum(field(parsed, "price", "avgPrice", "averagePrice")) ?? fallback.price,
    stockValue:
      cleanStructuredNum(field(parsed, "stockValue", "stock_value", "gross", "amount")) ??
      fallback.stockValue,
    fees: cleanStructuredNum(field(parsed, "fees", "fee", "commission")) ?? fallback.fees,
    couponsWaived:
      cleanStructuredNum(field(parsed, "couponsWaived", "coupons_waived", "coupon", "discount")) ??
      fallback.couponsWaived,
    executedAt:
      normalizeIso(field(parsed, "executedAt", "executed_at", "dateTime", "datetime")) ??
      fallback.executedAt,
    executedTz:
      cleanStructuredText(field(parsed, "executedTz", "executed_tz", "timezone")) ??
      fallback.executedTz,
    rawText,
  };

  if (
    fallback.qty &&
    result.qty &&
    sameNum(fallback.price, result.price) &&
    sameNum(fallback.stockValue, result.stockValue) &&
    calculatedFromTotal(result.qty, result.price, result.stockValue) &&
    !sameNum(fallback.qty, result.qty)
  ) {
    result.qty = fallback.qty;
  }

  if (fallback.broker === "Webull") {
    result.side = fallback.side ?? result.side;
    result.ticker = fallback.ticker ?? result.ticker;
    result.qty = fallback.qty ?? result.qty;
    result.price = fallback.price ?? result.price;
    result.stockValue = fallback.stockValue ?? result.stockValue;
    result.fees = fallback.fees ?? result.fees;
    result.executedAt = fallback.executedAt ?? result.executedAt;
    result.executedTz = fallback.executedTz ?? result.executedTz;
  }

  if (copiedPriceAsQty(result)) result.qty = null;
  return result;
}

/** Find the first number that appears after `label` (within a small window). */
function numberAfter(text: string, label: string): string | null {
  const re = new RegExp(
    label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "[\\s:.\\-]*?(US\\$?\\s?[\\d,]+\\.?\\d*)",
  );
  const m = text.match(re);
  if (m) return cleanNum(m[1]);
  // fallback: any number (with optional US$) shortly after the label
  const re2 = new RegExp(
    label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "[\\s\\S]{0,24}?([\\d,]+\\.\\d+|[\\d,]+)",
  );
  const m2 = text.match(re2);
  return m2 ? cleanNum(m2[1]) : null;
}

/** Sum fee line items using ABSOLUTE values (Dime shows deductions as -2.14). */
function sumNums(...vals: (string | null)[]): string | null {
  const present = vals.filter((v): v is string => v !== null);
  if (present.length === 0) return null;
  return present
    .reduce((sum, v) => sum.plus(new Decimal(v).abs()), new Decimal(0))
    .toString();
}

/**
 * Webull qty: the label "จำนวนที่จับคู่แล้ว" appears twice — once as a money
 * amount (US$2,719.00) and once as the share count (37.04352). Pick the
 * occurrence whose value has NO "US$" prefix.
 */
function webullQty(text: string): string | null {
  const re = /จำนวนที่จับคู่แล้ว\s*(US\$)?\s*([\d,]+\.?\d*)/g;
  let m: RegExpExecArray | null;
  let bare: string | null = null;
  while ((m = re.exec(text)) !== null) {
    if (!m[1]) bare = cleanNum(m[2]); // no US$ → this is the share count
  }
  return bare;
}

/** Dime sell shows qty as a bare "75.1806439 หุ้น" with no field label. */
function qtyBeforeSharesWord(text: string): string | null {
  const m = text.match(/([\d,]+\.\d+|\d+)\s*หุ้น/);
  return m ? cleanNum(m[1]) : null;
}

interface NumberCandidate {
  value: string;
  hasCurrency: boolean;
}

function numberCandidatesAfter(
  text: string,
  label: string,
  windowChars = 96,
): NumberCandidate[] {
  const start = text.indexOf(label);
  if (start === -1) return [];
  const chunk = text.slice(start + label.length, start + label.length + windowChars);
  const matches = chunk.matchAll(/(?:US\$|USD)?\s*(-?[\d,]+(?:\.\d+)?)(?:\s*(US\$|USD))?/gi);
  return Array.from(matches)
    .map((m) => ({
      value: cleanNum(m[1]),
      hasCurrency: Boolean(m[0].match(/US\$|USD/i)),
    }))
    .filter((c): c is NumberCandidate => c.value !== null);
}

function dimeQty(text: string, price: string | null, stockValue: string | null): string | null {
  const candidates = numberCandidatesAfter(text, "จำนวนหุ้น")
    .filter((c) => !c.hasCurrency)
    .map((c) => c.value);
  const matchingGross = candidates.find((qty) => grossMatches(qty, price, stockValue));
  if (matchingGross) return matchingGross;
  const notPrice = candidates.find((qty) => !sameNum(qty, price));
  return notPrice ?? candidates[0] ?? qtyBeforeSharesWord(text);
}

function detectBroker(text: string): Broker | null {
  if (/Webull|จำนวนที่จับคู่|ค่าธรรมเนียมการทำรายการ/i.test(text)) return "Webull";
  if (/Dime|ราคาที่ได้จริง|TAF\s*Fee|ค่าคอมมิชชัน/i.test(text)) return "Dime";
  return null;
}

function detectSide(text: string, _broker: Broker | null): "buy" | "sell" | null {
  void _broker;
  // Dime shows "ซื้อ RDW" / "ขาย EOSE" as a heading; Webull shows คำสั่ง = ซื้อ/ขาย.
  const buy = /ซื้อ/.test(text);
  const sell = /ขาย/.test(text);
  if (buy && !sell) return "buy";
  if (sell && !buy) return "sell";
  // both present → take whichever appears first
  const bi = text.indexOf("ซื้อ");
  const si = text.indexOf("ขาย");
  if (bi === -1) return sell ? "sell" : null;
  if (si === -1) return "buy";
  return bi < si ? "buy" : "sell";
}

function detectTicker(text: string, _side: "buy" | "sell" | null): string | null {
  void _side;
  // Dime: ticker right after the side heading
  const afterSide = text.match(/(?:ซื้อ|ขาย)\s+([A-Z]{1,5})\b/);
  if (afterSide) return afterSide[1];
  // otherwise: first standalone uppercase 2–5 token that isn't reserved
  const tokens = text.match(/\b[A-Z]{2,5}\b/g) ?? [];
  for (const t of tokens) {
    if (!RESERVED_TOKENS.has(t)) return t;
  }
  return null;
}

function detectExchange(text: string): "NYSE" | "NASDAQ" | "OTHER" | null {
  if (/NASDAQ/i.test(text)) return "NASDAQ";
  if (/NYSE/i.test(text)) return "NYSE";
  return null;
}

/** Webull: DD/MM/YYYY HH:mm:ss (EDT). */
function parseWebullDate(text: string): { iso: string; tz: string } | null {
  const executedLabel = "คำสั่งถูกจับคู่สำเร็จ";
  const m =
    text.match(
      new RegExp(
        executedLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
          "[\\s\\S]{0,80}?(\\d{2})\\/(\\d{2})\\/(\\d{4})\\s+(\\d{2}):(\\d{2}):(\\d{2})",
      ),
    ) ?? text.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  const [, dd, mm, yyyy, hh, mi, ss] = m;
  const tz = "America/New_York";
  const d = dayjs.tz(
    `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`,
    "YYYY-MM-DD HH:mm:ss",
    tz,
  );
  return d.isValid() ? { iso: d.toISOString(), tz } : null;
}

/** Dime: "8 ต.ค. 68 - 01:38 น." (Thai month, 2-digit พ.ศ.). */
function parseDimeDate(text: string): { iso: string; tz: string } | null {
  const m = text.match(
    /(\d{1,2})\s*(ม\.ค\.|ก\.พ\.|มี\.ค\.|เม\.ย\.|พ\.ค\.|มิ\.ย\.|ก\.ค\.|ส\.ค\.|ก\.ย\.|ต\.ค\.|พ\.ย\.|ธ\.ค\.)\s*(\d{2})\s*-\s*(\d{1,2}):(\d{2})/,
  );
  if (!m) return null;
  const [, dd, thMonth, buddhistYY, hh, mi] = m;
  const month = THAI_MONTHS[thMonth];
  if (!month) return null;
  const gregorianYear = 2500 + parseInt(buddhistYY, 10) - 543; // พ.ศ. → ค.ศ.
  const tz = "Asia/Bangkok";
  const d = dayjs.tz(
    `${gregorianYear}-${String(month).padStart(2, "0")}-${dd.padStart(2, "0")} ${hh.padStart(2, "0")}:${mi}:00`,
    "YYYY-MM-DD HH:mm:ss",
    tz,
  );
  return d.isValid() ? { iso: d.toISOString(), tz } : null;
}

function parseWebull(text: string): ParsedTrade {
  const side = detectSide(text, "Webull");
  const date = parseWebullDate(text);
  return {
    broker: "Webull",
    accountId: "acc_webull",
    side,
    ticker: detectTicker(text, side),
    exchange: detectExchange(text),
    qty: webullQty(text),
    price: numberAfter(text, "ราคาเฉลี่ย"),
    stockValue:
      numberAfter(text, "จำนวนเงินที่สมัคร") ?? numberAfter(text, "จำนวนเงิน"),
    fees: numberAfter(text, "ค่าธรรมเนียมการทำรายการ"),
    couponsWaived: null,
    executedAt: date?.iso ?? null,
    executedTz: date?.tz ?? null,
    rawText: text,
  };
}

function parseDime(text: string): ParsedTrade {
  const side = detectSide(text, "Dime");
  const date = parseDimeDate(text);
  const price = numberAfter(text, "ราคาที่ได้จริง");
  const stockValue = numberAfter(text, "มูลค่าหุ้น");
  const commission = numberAfter(text, "ค่าคอมมิชชัน");
  const vat = numberAfter(text, "VAT") ?? numberAfter(text, "ภาษีมูลค่าเพิ่ม");
  const taf = numberAfter(text, "TAF") ?? numberAfter(text, "ค่าธรรมเนียมการขาย");
  const coupon =
    numberAfter(text, "รายการฟรีของเดือน") ??
    numberAfter(text, "คูปอง") ??
    numberAfter(text, "ส่วนลด");
  return {
    broker: "Dime",
    accountId: "acc_dime",
    side,
    ticker: detectTicker(text, side),
    exchange: detectExchange(text),
    qty: dimeQty(text, price, stockValue),
    price,
    stockValue,
    fees: sumNums(commission, vat, taf),
    couponsWaived: coupon,
    executedAt: date?.iso ?? null,
    executedTz: date?.tz ?? null,
    rawText: text,
  };
}

/** Parse OCR text into a partial trade, auto-selecting the broker profile. */
export function parseOcrText(text: string): ParsedTrade {
  const broker = detectBroker(text);
  if (broker === "Webull") return parseWebull(text);
  if (broker === "Dime") return parseDime(text);
  // Unknown layout — return what little we can detect for manual completion.
  const side = detectSide(text, null);
  return {
    broker: null,
    accountId: null,
    side,
    ticker: detectTicker(text, side),
    exchange: detectExchange(text),
    qty: null,
    price: null,
    stockValue: null,
    fees: null,
    couponsWaived: null,
    executedAt: null,
    executedTz: null,
    rawText: text,
  };
}

/** Parse structured JSON OCR responses first, falling back to text heuristics. */
export function parseOcrResponse(text: string): ParsedTrade {
  return parsedFromStructured(text) ?? parseOcrText(text);
}

/** Count of successfully extracted core fields (for a rough confidence hint). */
export function parsedFieldCount(p: ParsedTrade): number {
  return [p.side, p.ticker, p.qty, p.price, p.stockValue, p.fees, p.executedAt].filter(
    Boolean,
  ).length;
}
