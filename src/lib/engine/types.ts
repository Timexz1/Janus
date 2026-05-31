import type { Decimal } from "@/lib/money/decimal";

export type Side = "buy" | "sell";

/**
 * Raw trade input — mirrors the fee fields seen on Webull / Dime screenshots
 * BEFORE normalization (brief §4.2, §4.3). `fees` is the SUM of every fee line
 * item (commission + VAT + TAF + market fee …). `couponsWaived` is any portion
 * of those fees waived by a coupon (e.g. Dime "รายการฟรีของเดือน" waives the
 * commission).
 */
export interface RawTrade {
  side: Side;
  qty: Decimal; // shares (7 dp)
  price: Decimal; // executed price per share (USD)
  /**
   * Stock value (มูลค่าหุ้น). Optional: brokers like Dime report a stock value
   * that differs slightly from qty*price due to fractional fills, so when the
   * broker gives an explicit value we trust it over qty*price (brief §4.3).
   */
  stockValue?: Decimal;
  fees: Decimal; // sum of ALL fees (USD)
  couponsWaived?: Decimal; // fees waived by coupon (USD)
}

/**
 * Normalized trade — single, consistent shape used by the FIFO engine and the
 * DB layer (brief §4.3: "รวมค่าธรรมเนียมทุกชนิดเป็นตัวเลขเดียว").
 *   feesNet = fees − couponsWaived
 *   buy:  net = gross + feesNet  (total cost)
 *   sell: net = gross − feesNet  (net proceeds)
 */
export interface NormalizedTrade {
  side: Side;
  qty: Decimal;
  price: Decimal;
  gross: Decimal; // stock value
  feesNet: Decimal; // net fee effect after coupons
  net: Decimal; // signed: buy = total cost, sell = net proceeds
  costPerShare: Decimal | null; // buy only: net / qty (full precision)
}

/** A confirmed transaction fed into the FIFO replay (one account + ticker). */
export interface EngineTransaction {
  id: string;
  executedAt: string; // ISO 8601; replay is ordered by this then `seq`
  seq?: number; // tiebreaker for same-timestamp ordering
  side: Side;
  qty: Decimal;
  net: Decimal; // normalized net (buy total cost / sell net proceeds)
  costPerShare: Decimal | null; // buy only
}

/** An open lot remaining after replay (derived snapshot — brief §5 `lots`). */
export interface OpenLot {
  sourceTransactionId: string;
  qtyRemaining: Decimal;
  costPerShare: Decimal;
  openedAt: string;
}

/** How much of one buy lot a given sell consumed. */
export interface LotConsumption {
  lotTransactionId: string;
  qty: Decimal;
  costPerShare: Decimal;
}

/** Result of a single sell after FIFO matching. */
export interface SaleResult {
  transactionId: string;
  realizedGain: Decimal; // net proceeds − Σ(costPerShare × qty consumed)
  costBasis: Decimal; // Σ(costPerShare × qty consumed)
  consumed: LotConsumption[];
}

/** Full output of replaying one account+ticker's transactions. */
export interface ReplayResult {
  lots: OpenLot[];
  sales: SaleResult[];
}
