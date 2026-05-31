import Decimal from "decimal.js";

/**
 * Central decimal.js configuration for all money/share math.
 *
 * Guardrail (brief §0, §3.2, §4.3): money and share quantities must NEVER be
 * computed with JS floats. Every monetary/qty value flows through Decimal.
 * We carry FULL precision through intermediate steps and round ONLY at the
 * display/storage boundary — rounding cost_per_share early shifts realized
 * gains (e.g. 1053.16 vs 1053.17 in the ASTS acceptance test, §3.5).
 */
Decimal.set({
  precision: 40, // generous significant digits for chained buy/sell math
  rounding: Decimal.ROUND_HALF_UP,
});

export { Decimal };

/** Decimal places kept for share quantities (brief §3.2: fractional shares, 7 dp). */
export const QTY_DP = 7;
/** Decimal places for USD display/storage at the boundary. */
export const USD_DP = 2;

export type DecimalInput = Decimal | number | string;

/** Construct a Decimal from a number/string/Decimal. Use everywhere instead of `new Decimal(...)`. */
export function D(value: DecimalInput): Decimal {
  return value instanceof Decimal ? value : new Decimal(value);
}

/** Zero constant. */
export const ZERO = new Decimal(0);

/** Round a USD amount to cents (display/storage boundary only). */
export function roundUsd(value: DecimalInput): Decimal {
  return D(value).toDecimalPlaces(USD_DP, Decimal.ROUND_HALF_UP);
}

/** Round a share quantity to 7 dp (display/storage boundary only). */
export function roundQty(value: DecimalInput): Decimal {
  return D(value).toDecimalPlaces(QTY_DP, Decimal.ROUND_HALF_UP);
}

/** Format a USD amount as a fixed-2dp string for UI. */
export function formatUsd(value: DecimalInput): string {
  return roundUsd(value).toFixed(USD_DP);
}

/** Min of two decimals. */
export function minDecimal(a: Decimal, b: Decimal): Decimal {
  return a.lte(b) ? a : b;
}
