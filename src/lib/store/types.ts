import type { Side } from "@/lib/engine/types";
import type { ApportionmentMethod } from "@/lib/tax/config";
import type { RemittanceDirection } from "@/lib/tax/remittance";

export type Exchange = "NYSE" | "NASDAQ" | "OTHER";
export type OcrProvider = "gemini" | "typhoon" | "claude";

export interface Account {
  id: string;
  broker: string;
  accountLabel: string;
  currency: string;
}

/**
 * A persisted transaction. Decimal values are stored as STRINGS to avoid any
 * float drift through JSON (brief §0: never use float for money/shares). These
 * raw input fields are the source of truth; lots / realized gain are derived
 * by the FIFO engine on read (Approach A).
 */
export interface StoredTransaction {
  id: string;
  accountId: string;
  ticker: string;
  exchange: Exchange | null;
  side: Side;
  qty: string;
  price: string;
  stockValue: string | null;
  fees: string;
  couponsWaived: string | null;
  executedAt: string; // ISO 8601 (UTC)
  executedTz: string | null; // original market tz, for audit
  createdAt: string;
}

export type TransactionInput = Omit<StoredTransaction, "id" | "createdAt">;

/** A remittance of money back into Thailand (brief §3.3). Decimals as strings. */
export interface Remittance {
  id: string;
  date: string; // YYYY-MM-DD
  direction: RemittanceDirection; // inbound = นำเข้าไทย (taxable), outbound = ออกไปลงทุน
  amountUsd: string;
  fxRate: string; // THB per USD (BoT reference on the transfer date)
  note: string | null;
  createdAt: string;
}

export type RemittanceInputData = Omit<Remittance, "id" | "createdAt">;

/** App-wide tax settings (brief §5 tax_settings + §6 Settings). */
export interface TaxSettings {
  apportionmentMethod: ApportionmentMethod;
  personalAllowance: string;
  taxYear: number; // Gregorian
  showMetrics: boolean;
  ocrEnabled: boolean;
  /** OCR provider used by the screenshot import flow. */
  ocrProvider: OcrProvider;
  /** Gemini API key entered in-app (stored in this browser only). */
  geminiApiKey: string;
  /** Typhoon OCR API key entered in-app (stored in this browser only). */
  typhoonApiKey: string;
  /** Anthropic (Claude) API key entered in-app (stored in this browser only). */
  claudeApiKey: string;
  /** Claude model id used for OCR. */
  claudeModel: string;
}

/** Other (non-foreign) income per tax year (brief §5 income_inputs). */
export type IncomeByYear = Record<number, string>; // taxYear → otherIncomeThb
