import { Decimal } from "@/lib/money/decimal";
import type { RawRow } from "./parse";

export interface RowError {
  field: string;
  message: string;
}

export interface ValidatedRow {
  brokerId: string;
  ticker: string;
  exchange: "NYSE" | "NASDAQ" | "OTHER";
  side: "buy" | "sell";
  qty: string;
  price: string;
  stockValue: string | null;
  fees: string;
  couponsWaived: string | null;
  fxRate: string | null;
  thbCost: string | null;
  executedAt: string;
  executedTz: string | null;
}

export interface ValidationResult {
  row: ValidatedRow;
  errors: RowError[];
}

const BROKER_MAP: Record<string, string> = {
  webull: "webull",
  dime: "dime",
};

function isPosDecimal(v: string): boolean {
  if (!v?.trim()) return false;
  try {
    return new Decimal(v).gt(0);
  } catch {
    return false;
  }
}

function isNonNegDecimal(v: string): boolean {
  if (!v?.trim()) return false;
  try {
    return new Decimal(v).gte(0);
  } catch {
    return false;
  }
}

function toIso(raw: string): string | null {
  if (!raw?.trim()) return null;
  const d = new Date(raw.trim().replace(" ", "T"));
  return isNaN(d.getTime()) ? null : d.toISOString();
}

export function validateRow(raw: RawRow): ValidationResult {
  const errors: RowError[] = [];

  const brokerKey = (raw.broker ?? "").toLowerCase().trim();
  const brokerId = BROKER_MAP[brokerKey] ?? null;
  if (!brokerId)
    errors.push({
      field: "broker",
      message: `โบรกเกอร์ไม่รู้จัก: "${raw.broker}" (ต้องเป็น Webull หรือ Dime)`,
    });

  const ticker = (raw.ticker ?? "").trim().toUpperCase();
  if (!ticker) errors.push({ field: "ticker", message: "ต้องระบุ ticker" });

  const side = (raw.side ?? "").toLowerCase().trim();
  if (side !== "buy" && side !== "sell")
    errors.push({ field: "side", message: "side ต้องเป็น buy หรือ sell" });

  if (!isPosDecimal(raw.qty))
    errors.push({ field: "qty", message: "qty ต้องเป็นตัวเลข > 0" });
  if (!isPosDecimal(raw.price))
    errors.push({ field: "price", message: "price ต้องเป็นตัวเลข > 0" });
  if (!isNonNegDecimal(raw.fees ?? "0"))
    errors.push({ field: "fees", message: "fees ต้องเป็นตัวเลข ≥ 0" });

  const executedAt = toIso(raw.executed_at ?? "");
  if (!executedAt)
    errors.push({
      field: "executed_at",
      message: "วันเวลาไม่ถูกต้อง (ใช้รูปแบบ YYYY-MM-DD HH:mm:ss)",
    });

  const exchange = (
    ["NYSE", "NASDAQ", "OTHER"].includes((raw.exchange ?? "").toUpperCase())
      ? (raw.exchange ?? "").toUpperCase()
      : "OTHER"
  ) as "NYSE" | "NASDAQ" | "OTHER";

  return {
    errors,
    row: {
      brokerId: brokerId ?? "webull",
      ticker,
      exchange,
      side: side === "buy" || side === "sell" ? side : "buy",
      qty: raw.qty ?? "",
      price: raw.price ?? "",
      stockValue: raw.stock_value?.trim() || null,
      fees: raw.fees ?? "0",
      couponsWaived: raw.coupons_waived?.trim() || null,
      fxRate: raw.fx_rate?.trim() || null,
      thbCost: raw.thb_cost?.trim() || null,
      executedAt: executedAt ?? "",
      executedTz: raw.executed_tz?.trim() || null,
    },
  };
}
