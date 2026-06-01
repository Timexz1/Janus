"use client";

import { useEffect, useState } from "react";
import type { QuoteSnapshot } from "./types";

const PRICE_REFRESH_MS = 30_000;

/** Live Yahoo quote price keyed by ticker, refreshed periodically from /api/prices. */
export function useLastPrices(tickers: string[]): {
  prices: Record<string, number>;
  quotes: Record<string, QuoteSnapshot>;
  loading: boolean;
} {
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [quotes, setQuotes] = useState<Record<string, QuoteSnapshot>>({});
  const [loading, setLoading] = useState(false);
  const key = [...new Set(tickers)].sort().join(",");

  useEffect(() => {
    const list = key ? key.split(",") : [];
    if (list.length === 0) {
      queueMicrotask(() => {
        setPrices({});
        setQuotes({});
        setLoading(false);
      });
      return;
    }

    let cancelled = false;
    let activeController: AbortController | null = null;

    const loadQuotes = async (showSpinner: boolean) => {
      activeController?.abort();
      const controller = new AbortController();
      activeController = controller;
      if (showSpinner && !cancelled) setLoading(true);

      try {
        const response = await fetch(
          `/api/prices?tickers=${encodeURIComponent(list.join(","))}`,
          { cache: "no-store", signal: controller.signal },
        );
        if (!response.ok) throw new Error(`Price HTTP ${response.status}`);
        const json = await response.json();
        if (cancelled) return;

        const nextQuotes = Object.fromEntries(
          ((json?.quotes ?? []) as QuoteSnapshot[])
            .filter((quote) => quote && Number.isFinite(quote.price))
            .map((quote) => [quote.ticker, quote]),
        );
        setQuotes(nextQuotes);
        setPrices(
          Object.fromEntries(
            Object.values(nextQuotes).map((quote) => [quote.ticker, quote.price]),
          ),
        );
      } catch (error) {
        if (!cancelled && !(error instanceof DOMException && error.name === "AbortError")) {
          // Keep the last good quote set to avoid flashing empty prices during transient failures.
        }
      } finally {
        if (!cancelled && activeController === controller) setLoading(false);
      }
    };

    queueMicrotask(() => {
      void loadQuotes(true);
    });

    const onVisibilityChange = () => {
      if (!document.hidden) void loadQuotes(false);
    };

    const intervalId = window.setInterval(() => {
      if (!document.hidden) void loadQuotes(false);
    }, PRICE_REFRESH_MS);

    window.addEventListener("focus", onVisibilityChange);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      activeController?.abort();
      window.clearInterval(intervalId);
      window.removeEventListener("focus", onVisibilityChange);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [key]);

  return { prices, quotes, loading };
}
