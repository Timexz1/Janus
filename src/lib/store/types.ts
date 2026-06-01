import type { Side } from "@/lib/engine/types";
import type { ApportionmentMethod } from "@/lib/tax/config";
import type { RemittanceDirection } from "@/lib/tax/remittance";

export type Exchange = "NYSE" | "NASDAQ" | "OTHER";
export type OcrProvider = "gemini" | "typhoon" | "claude";

/**
 * A persisted transaction. Decimal values are stored as STRINGS to avoid any
 * float drift through JSON (brief §0: never use float for money/shares). These
 * raw input fields are the source of truth; lots / realized gain are derived
 * by the FIFO engine on read (Approach A).
 */
export interface StoredTransaction {
  id: string;
  brokerId: string;
  ticker: string;
  exchange: Exchange | null;
  side: Side;
  qty: string;
  price: string;
  stockValue: string | null;
  fees: string;
  couponsWaived: string | null;
  /**
   * THB-funded buys (e.g. Dime! Fast): the broker converts THB→USD at the moment
   * of the trade, so the buy IS a money-out-of-Thailand event. fxRate = THB per
   * USD shown on the slip; thbCost = total THB actually paid (= principal sent
   * abroad). null for USD-funded trades (e.g. Webull, where USD was exchanged
   * ahead of time and recorded as a separate outbound transfer). Gain is still
   * computed in USD (per design); these only feed the outbound-principal
   * cash-flow and the audit display.
   */
  fxRate: string | null; // THB per USD at the trade
  thbCost: string | null; // total THB paid (principal exported)
  /** Supabase Storage object path of the OCR screenshot, if imported from one. */
  imagePath: string | null;
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

export type ChartPeriod = "1M" | "3M" | "6M" | "YTD" | "1Y" | "5Y" | "ALL";
export type ChartTimeframe = "D" | "W" | "M";
export type ChartLineStyle = "solid" | "dashed" | "dotted";
export type ChartTrendlineMode = "segment" | "ray" | "extended";

export interface ChartIndicators {
  volume: boolean;
  ma20: boolean;
  ma50: boolean;
  ma200: boolean;
}

export interface ChartVisibleRange {
  from: number;
  to: number;
}

export interface ChartAnchorPoint {
  time: string;
  price: number;
  logical?: number;
}

export type ChartDrawing =
  | {
      id: string;
      type: "trendline";
      from: ChartAnchorPoint;
      to: ChartAnchorPoint;
      mode?: ChartTrendlineMode;
      width?: number;
      color?: string;
      style?: ChartLineStyle;
    }
  | {
      id: string;
      type: "fibonacci";
      from: ChartAnchorPoint;
      to: ChartAnchorPoint;
      levels?: number[];
      width?: number;
      color?: string;
      style?: ChartLineStyle;
    }
  | {
      id: string;
      type: "horizontal";
      price: number;
      time?: string;
      logical?: number;
      width?: number;
      color?: string;
      style?: ChartLineStyle;
    }
  | {
      id: string;
      type: "vertical";
      time: string;
      logical?: number;
      width?: number;
      color?: string;
      style?: ChartLineStyle;
    };

export interface ChartState {
  ticker: string;
  period: ChartPeriod;
  timeframe: ChartTimeframe;
  indicators: ChartIndicators;
  visibleRange: ChartVisibleRange | null;
  drawings: ChartDrawing[];
  updatedAt: string;
}
