import { Decimal } from "@/lib/money/decimal";

/**
 * Duplicate-trade detection (a customer may screenshot the same trade twice).
 * Two trades are the "same" when account, ticker, side, qty, price, fees and
 * execution time match. Decimals are normalized so "10.90" == "10.9".
 */
export interface TradeKeyFields {
  accountId: string;
  ticker: string;
  side: string;
  qty: string;
  price: string;
  fees: string;
  executedAt: string;
}

function norm(v: string): string {
  try {
    return new Decimal(v).toString();
  } catch {
    return v.trim();
  }
}

export function tradeKey(t: TradeKeyFields): string {
  return [
    t.accountId,
    t.ticker.trim().toUpperCase(),
    t.side,
    norm(t.qty),
    norm(t.price),
    norm(t.fees),
    t.executedAt,
  ].join("|");
}

/**
 * Keep the first occurrence of each key; collect the rest as `removed`.
 * `existingKeys` pre-seeds the seen set (e.g. keys of already-saved trades).
 */
export function dedupe<T>(
  items: T[],
  keyOf: (t: T) => string,
  existingKeys?: Set<string>,
): { unique: T[]; removed: T[] } {
  const seen = new Set<string>(existingKeys ?? []);
  const unique: T[] = [];
  const removed: T[] = [];
  for (const item of items) {
    const k = keyOf(item);
    if (seen.has(k)) removed.push(item);
    else {
      seen.add(k);
      unique.push(item);
    }
  }
  return { unique, removed };
}
