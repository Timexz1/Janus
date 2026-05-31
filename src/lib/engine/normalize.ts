import { D, ZERO } from "@/lib/money/decimal";
import type { NormalizedTrade, RawTrade } from "./types";

/**
 * Normalize a raw trade into the single canonical shape (brief §4.3).
 *
 * Rules:
 *   gross    = stockValue if provided, else qty × price
 *   feesNet  = fees − couponsWaived
 *   buy:  net = gross + feesNet     (total cost, incl. fees)
 *   sell: net = gross − feesNet     (net proceeds, after fees, + waived coupons)
 *   costPerShare (buy only) = net / qty   — FULL precision, never pre-rounded.
 *
 * Verified against the §3.5 acceptance numbers:
 *   ASTS buy : 2718.9994 + 2.91            = 2721.91  → /37.04352 ≈ 73.4787
 *   RDW  buy : 180.86 + (0.27+0.02) − 0    = 181.15
 *   EOSE sell: 1426.93 − ((2.14+0.02)−2.14) = 1426.91
 */
export function normalizeTrade(input: RawTrade): NormalizedTrade {
  const qty = D(input.qty);
  const price = D(input.price);
  const gross = input.stockValue !== undefined ? D(input.stockValue) : qty.times(price);
  // fees and coupons are magnitudes — some brokers show them with a minus sign
  // (e.g. Dime "-1.44"); treat both as positive so coupons always REDUCE fees.
  const feesNet = D(input.fees).abs().minus(D(input.couponsWaived ?? ZERO).abs());

  const net = input.side === "buy" ? gross.plus(feesNet) : gross.minus(feesNet);
  const costPerShare = input.side === "buy" ? net.div(qty) : null;

  return { side: input.side, qty, price, gross, feesNet, net, costPerShare };
}
