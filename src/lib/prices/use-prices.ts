"use client";

import { useEffect, useMemo, useState } from "react";
import { getSecret, subscribeVault } from "@/lib/store/secret-vault";
import { applyAlpacaStreamMessage, type AlpacaStreamMessage } from "./alpaca";
import type { QuoteSnapshot } from "./types";

const PRICE_REFRESH_MS = 30_000;
const ALPACA_STREAM_FEED = (process.env.NEXT_PUBLIC_ALPACA_STREAM_FEED ?? "iex").trim().toLowerCase();

function quoteMapToPrices(quotes: Record<string, QuoteSnapshot>) {
  return Object.fromEntries(
    Object.values(quotes)
      .filter((quote) => Number.isFinite(quote.price))
      .map((quote) => [quote.ticker, quote.price]),
  );
}

function readAlpacaCredentials() {
  return {
    key: getSecret("alpaca_key"),
    secret: getSecret("alpaca_secret"),
  };
}

function mergeFallbackQuote(current: QuoteSnapshot | undefined, fallback: QuoteSnapshot): QuoteSnapshot {
  if (!current) return fallback;
  const isStreaming = current.source.startsWith("alpaca-");
  if (!isStreaming) return fallback;

  return {
    ...fallback,
    price: current.price,
    last: current.last,
    bid: current.bid,
    ask: current.ask,
    bidSize: current.bidSize,
    askSize: current.askSize,
    marketState: current.marketState,
    asOf: current.asOf,
    source: current.source,
  };
}

/** Snapshot fallback + Alpaca WebSocket streaming quotes keyed by ticker. */
export function useLastPrices(tickers: string[]): {
  prices: Record<string, number>;
  quotes: Record<string, QuoteSnapshot>;
  loading: boolean;
} {
  const [quotes, setQuotes] = useState<Record<string, QuoteSnapshot>>({});
  const [loading, setLoading] = useState(false);
  const [vaultVersion, setVaultVersion] = useState(0);
  const key = [...new Set(tickers)].sort().join(",");

  useEffect(() => subscribeVault(() => setVaultVersion((value) => value + 1)), []);

  useEffect(() => {
    const list = key ? key.split(",") : [];
    if (list.length === 0) {
      queueMicrotask(() => {
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

        setQuotes((current) =>
          Object.fromEntries(
            Object.entries(nextQuotes).map(([ticker, fallback]) => [ticker, mergeFallbackQuote(current[ticker], fallback)]),
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

  useEffect(() => {
    const list = key ? key.split(",") : [];
    const { key: alpacaKey, secret } = readAlpacaCredentials();
    if (list.length === 0 || !alpacaKey || !secret) return;

    let ws: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let closedByHook = false;

    const connect = () => {
      ws = new WebSocket(`wss://stream.data.alpaca.markets/v2/${ALPACA_STREAM_FEED}`);

      ws.addEventListener("open", () => {
        ws?.send(JSON.stringify({ action: "auth", key: alpacaKey, secret }));
      });

      ws.addEventListener("message", (event) => {
        let payload: unknown;
        try {
          payload = JSON.parse(String(event.data));
        } catch {
          return;
        }
        if (!Array.isArray(payload)) return;

        const messages = payload as Array<Record<string, unknown>>;
        for (const message of messages) {
          if (message.T === "success" && message.msg === "authenticated") {
            ws?.send(JSON.stringify({ action: "subscribe", trades: list, quotes: list }));
            continue;
          }
          if (message.T !== "t" && message.T !== "q") continue;
          const streamMessage = message as unknown as AlpacaStreamMessage;
          setQuotes((current) => ({
            ...current,
            [streamMessage.S]: applyAlpacaStreamMessage(current[streamMessage.S], streamMessage, ALPACA_STREAM_FEED),
          }));
        }
      });

      ws.addEventListener("close", () => {
        if (closedByHook) return;
        reconnectTimer = window.setTimeout(connect, 3_000);
      });
    };

    connect();

    return () => {
      closedByHook = true;
      if (reconnectTimer != null) window.clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, [key, vaultVersion]);

  const prices = useMemo(() => quoteMapToPrices(quotes), [quotes]);
  return { prices, quotes, loading };
}
