"use client";

import { useEffect, useState } from "react";

/** Last close price keyed by ticker, fetched from /api/prices (Yahoo). */
export function useLastPrices(tickers: string[]): {
  prices: Record<string, number>;
  loading: boolean;
} {
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const key = [...new Set(tickers)].sort().join(",");

  useEffect(() => {
    const list = key ? key.split(",") : [];
    if (list.length === 0) {
      queueMicrotask(() => setPrices({}));
      return;
    }
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setLoading(true);
    });
    Promise.all(
      list.map((t) =>
        fetch(`/api/prices?ticker=${encodeURIComponent(t)}`)
          .then((r) => r.json())
          .then((j) => {
            const c = j?.candles;
            const last = c?.length ? c[c.length - 1].close : NaN;
            return [t, last] as const;
          })
          .catch(() => [t, NaN] as const),
      ),
    )
      .then((entries) => {
        if (cancelled) return;
        setPrices(Object.fromEntries(entries.filter(([, v]) => Number.isFinite(v))));
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [key]);

  return { prices, loading };
}
