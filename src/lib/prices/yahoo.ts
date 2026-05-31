import type { Candle } from "./types";

/**
 * Yahoo Finance chart provider (brief §7) — free, no API key, JSON daily OHLC.
 * Fetched server-side (see /api/prices) to avoid CORS and to send a browser
 * User-Agent (Yahoo rejects the default fetch UA). Same surface as the Stooq
 * provider, so sources stay swappable.
 */
export async function fetchDailyCandles(ticker: string, range = "5y"): Promise<Candle[]> {
  const symbol = encodeURIComponent(ticker.trim().toUpperCase());
  const safeRange = ["1y", "5y", "max"].includes(range) ? range : "5y";
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=${safeRange}&interval=1d`;

  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
    next: { revalidate: 3600 },
  });
  if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}`);

  const json = (await res.json()) as {
    chart?: {
      result?: {
        timestamp?: number[];
        indicators?: {
          quote?: {
            open?: (number | null)[];
            high?: (number | null)[];
            low?: (number | null)[];
            close?: (number | null)[];
          }[];
        };
      }[];
    };
  };

  const result = json.chart?.result?.[0];
  const ts = result?.timestamp;
  const q = result?.indicators?.quote?.[0];
  if (!ts || !q) return [];

  // De-dupe by date (insertion order stays ascending) to satisfy the chart lib.
  const byDate = new Map<string, Candle>();
  for (let i = 0; i < ts.length; i++) {
    const open = q.open?.[i];
    const high = q.high?.[i];
    const low = q.low?.[i];
    const close = q.close?.[i];
    if ([open, high, low, close].some((n) => n == null || !Number.isFinite(n))) continue;
    const time = new Date(ts[i] * 1000).toISOString().slice(0, 10);
    byDate.set(time, { time, open: open!, high: high!, low: low!, close: close! });
  }
  return [...byDate.values()];
}
