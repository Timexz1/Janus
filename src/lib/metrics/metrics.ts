/**
 * Portfolio metrics (brief §7). Pure number helpers — display metrics, not
 * money-critical accounting, so plain JS numbers are fine here (the tax/FIFO
 * engines use Decimal). Each function is unit-tested.
 */

/** Fraction of sales that were profitable (gain > 0). 0 when there are none. */
export function winRate(gains: number[]): number {
  if (gains.length === 0) return 0;
  return gains.filter((g) => g > 0).length / gains.length;
}

/** Largest peak-to-trough decline as a fraction (0..1) of the running peak. */
export function maxDrawdown(series: number[]): number {
  let peak = -Infinity;
  let maxDd = 0;
  for (const v of series) {
    if (v > peak) peak = v;
    if (peak > 0) {
      const dd = (peak - v) / peak;
      if (dd > maxDd) maxDd = dd;
    }
  }
  return maxDd;
}

interface Flow {
  date: string;
  amount: number;
}

function npv(rate: number, flows: Flow[], t0: number): number {
  return flows.reduce((sum, f) => {
    const years = (Date.parse(f.date) - t0) / (365 * 24 * 3600 * 1000);
    return sum + f.amount / Math.pow(1 + rate, years);
  }, 0);
}

/**
 * XIRR — money-weighted annual return from dated cashflows (outflows negative,
 * inflows positive). Solved by bisection. Returns null when there isn't both an
 * inflow and an outflow, or no root in range.
 */
export function xirr(flows: Flow[]): number | null {
  if (flows.length < 2) return null;
  if (!flows.some((f) => f.amount < 0) || !flows.some((f) => f.amount > 0)) {
    return null;
  }
  const t0 = Math.min(...flows.map((f) => Date.parse(f.date)));

  // wide upper bound: short holding periods with gains annualize to huge IRRs
  let lo = -0.9999;
  let hi = 1000;
  let flo = npv(lo, flows, t0);
  let fhi = npv(hi, flows, t0);
  if (flo * fhi > 0) return null;

  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fm = npv(mid, flows, t0);
    if (Math.abs(fm) < 1e-7) return mid;
    if (flo * fm < 0) {
      hi = mid;
      fhi = fm;
    } else {
      lo = mid;
      flo = fm;
    }
  }
  return (lo + hi) / 2;
}

/** Realized gain bucketed by calendar month (YYYY-MM), sorted ascending. */
export function monthlyRealized(
  sales: { date: string; gain: number }[],
): { month: string; gain: number }[] {
  const byMonth = new Map<string, number>();
  for (const s of sales) {
    const month = s.date.slice(0, 7);
    byMonth.set(month, (byMonth.get(month) ?? 0) + s.gain);
  }
  return [...byMonth.entries()]
    .map(([month, gain]) => ({ month, gain }))
    .sort((a, b) => (a.month < b.month ? -1 : 1));
}

/** Percentage allocation of each item by value (descending). */
export function allocation(
  items: { key: string; value: number }[],
): { key: string; value: number; pct: number }[] {
  const total = items.reduce((s, i) => s + i.value, 0);
  if (total <= 0) return [];
  return items
    .map((i) => ({ key: i.key, value: i.value, pct: (i.value / total) * 100 }))
    .sort((a, b) => b.value - a.value);
}
