"use client";

import { useEffect, useState } from "react";

const REFRESH_MS = 60_000;

export interface FxRate {
  rate: number | null; // THB per 1 USD
  asOf: string | null;
}

/** Polls Yahoo Finance for the live USDTHB=X spot rate (refreshes every 60 s). */
export function useUsdThbRate(): FxRate {
  const [rate, setRate] = useState<number | null>(null);
  const [asOf, setAsOf] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    async function fetch_() {
      try {
        const res = await fetch("/api/prices?tickers=USDTHB%3DX", { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as {
          quotes?: { ticker: string; price: number; asOf?: string | null }[];
        };
        const q = json.quotes?.find((q) => q.ticker === "USDTHB=X");
        if (q && Number.isFinite(q.price) && q.price > 0) {
          if (alive) {
            setRate(q.price);
            setAsOf(q.asOf ?? null);
          }
        }
      } catch {
        /* network error — keep previous value */
      }
    }

    fetch_();
    const id = setInterval(fetch_, REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  return { rate, asOf };
}
