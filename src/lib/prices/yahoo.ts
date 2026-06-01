import type { Candle, QuoteSnapshot } from "./types";

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
    next: { revalidate: 60 },
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
            volume?: (number | null)[];
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
    const volume = q.volume?.[i];
    if ([open, high, low, close].some((n) => n == null || !Number.isFinite(n))) continue;
    const time = new Date(ts[i] * 1000).toISOString().slice(0, 10);
    byDate.set(time, {
      time,
      open: open as number,
      high: high as number,
      low: low as number,
      close: close as number,
      volume: volume != null && Number.isFinite(volume) ? volume : undefined,
    });
  }
  return [...byDate.values()];
}

interface YahooQuoteResult {
  symbol?: string;
  currency?: string;
  marketState?: string;
  regularMarketPrice?: number;
  regularMarketPreviousClose?: number;
  preMarketPrice?: number;
  postMarketPrice?: number;
  regularMarketTime?: number;
  preMarketTime?: number;
  postMarketTime?: number;
}

interface YahooChartMeta {
  chartPreviousClose?: number;
  currency?: string;
  regularMarketPrice?: number;
  regularMarketTime?: number;
  symbol?: string;
}

function finiteOrNull(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function pickYahooQuotePrice(quote: YahooQuoteResult): {
  price: number | null;
  asOf: string | null;
} {
  const state = quote.marketState?.toUpperCase() ?? "";
  const regularPrice = finiteOrNull(quote.regularMarketPrice);
  const prePrice = finiteOrNull(quote.preMarketPrice);
  const postPrice = finiteOrNull(quote.postMarketPrice);

  let price = regularPrice;
  let timestamp = quote.regularMarketTime;

  if ((state === "PRE" || state === "PREPRE") && prePrice != null) {
    price = prePrice;
    timestamp = quote.preMarketTime ?? quote.regularMarketTime;
  } else if ((state === "POST" || state === "POSTPOST") && postPrice != null) {
    price = postPrice;
    timestamp = quote.postMarketTime ?? quote.regularMarketTime;
  } else if (regularPrice == null) {
    price = postPrice ?? prePrice ?? null;
    timestamp = quote.postMarketTime ?? quote.preMarketTime ?? quote.regularMarketTime;
  }

  return {
    price,
    asOf:
      typeof timestamp === "number" && Number.isFinite(timestamp)
        ? new Date(timestamp * 1000).toISOString()
        : null,
  };
}

function snapshotFromChartMeta(meta: YahooChartMeta | undefined, requestedTicker: string): QuoteSnapshot | null {
  const ticker = meta?.symbol?.trim().toUpperCase() ?? requestedTicker;
  const price = finiteOrNull(meta?.regularMarketPrice);
  if (!ticker || price == null) return null;

  return {
    ticker,
    price,
    last: price,
    bid: null,
    ask: null,
    bidSize: null,
    askSize: null,
    previousClose: finiteOrNull(meta?.chartPreviousClose),
    currency: meta?.currency ?? null,
    marketState: null,
    asOf:
      typeof meta?.regularMarketTime === "number" && Number.isFinite(meta.regularMarketTime)
        ? new Date(meta.regularMarketTime * 1000).toISOString()
        : null,
    source: "yahoo",
  };
}

export async function fetchQuoteSnapshots(tickers: string[]): Promise<QuoteSnapshot[]> {
  const symbols = [
    ...new Set(
      tickers
        .map((ticker) => ticker.trim().toUpperCase())
        .filter(Boolean),
    ),
  ];
  if (symbols.length === 0) return [];

  const snapshots = await Promise.all(
    symbols.map(async (ticker) => {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=5d&interval=1d&includePrePost=true`;
      const res = await fetch(url, {
        cache: "no-store",
        headers: { "User-Agent": "Mozilla/5.0" },
      });
      if (!res.ok) throw new Error(`Yahoo quote HTTP ${res.status}`);

      const json = (await res.json()) as {
        chart?: {
          result?: Array<{
            meta?: YahooChartMeta;
          }>;
        };
      };

      return snapshotFromChartMeta(json.chart?.result?.[0]?.meta, ticker);
    }),
  );

  return snapshots.filter((snapshot): snapshot is QuoteSnapshot => snapshot != null);
}
