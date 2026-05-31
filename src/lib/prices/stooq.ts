/**
 * Stooq price provider (brief §7) — alternative source. NOTE: Stooq's CSV
 * download endpoint now requires an apikey, so the default provider is Yahoo
 * (see yahoo.ts). Kept for the provider abstraction / future use with a key.
 */
import type { Candle } from "./types";

/** US tickers map to "<symbol>.us" on Stooq, e.g. ASTS → asts.us */
function toStooqSymbol(ticker: string): string {
  return `${ticker.trim().toLowerCase()}.us`;
}

export async function fetchDailyCandles(ticker: string): Promise<Candle[]> {
  const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(toStooqSymbol(ticker))}&i=d`;
  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (!res.ok) throw new Error(`Stooq HTTP ${res.status}`);
  const csv = (await res.text()).trim();

  const lines = csv.split(/\r?\n/);
  // Header: Date,Open,High,Low,Close,Volume ; "No data" when symbol unknown.
  if (lines.length < 2 || !/^date/i.test(lines[0])) return [];

  const candles: Candle[] = [];
  for (let i = 1; i < lines.length; i++) {
    const [date, o, h, l, c] = lines[i].split(",");
    const open = Number(o);
    const high = Number(h);
    const low = Number(l);
    const close = Number(c);
    if (!date || [open, high, low, close].some((n) => !Number.isFinite(n))) continue;
    candles.push({ time: date, open, high, low, close });
  }
  return candles;
}
