import type { QuoteSnapshot } from "./types";

interface AlpacaTradeMessage {
  T: "t";
  S: string;
  p: number;
  t: string;
}

interface AlpacaQuoteMessage {
  T: "q";
  S: string;
  bp: number;
  ap: number;
  bs: number;
  as: number;
  t: string;
}

export type AlpacaStreamMessage = AlpacaTradeMessage | AlpacaQuoteMessage;

function finiteOrNull(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function quoteDisplayPrice(next: {
  last?: number | null;
  bid?: number | null;
  ask?: number | null;
}, fallbackPrice: number | null): number | null {
  const last = finiteOrNull(next.last);
  const bid = finiteOrNull(next.bid);
  const ask = finiteOrNull(next.ask);

  if (last != null) return last;
  if (bid != null && ask != null) return (bid + ask) / 2;
  if (bid != null) return bid;
  if (ask != null) return ask;
  return fallbackPrice;
}

export function applyAlpacaStreamMessage(
  current: QuoteSnapshot | undefined,
  message: AlpacaStreamMessage,
  feed: string,
): QuoteSnapshot {
  const source = `alpaca-${feed}`;
  if (message.T === "t") {
    const last = finiteOrNull(message.p);
    return {
      ticker: message.S,
      price: quoteDisplayPrice({ last, bid: current?.bid, ask: current?.ask }, current?.price ?? null) ?? last ?? 0,
      last,
      bid: current?.bid ?? null,
      ask: current?.ask ?? null,
      bidSize: current?.bidSize ?? null,
      askSize: current?.askSize ?? null,
      previousClose: current?.previousClose ?? null,
      currency: current?.currency ?? "USD",
      marketState: "streaming",
      asOf: message.t,
      source,
    };
  }

  const bid = finiteOrNull(message.bp);
  const ask = finiteOrNull(message.ap);
  return {
    ticker: message.S,
    price: quoteDisplayPrice({ last: current?.last, bid, ask }, current?.price ?? null) ?? current?.price ?? 0,
    last: current?.last ?? null,
    bid,
    ask,
    bidSize: finiteOrNull(message.bs),
    askSize: finiteOrNull(message.as),
    previousClose: current?.previousClose ?? null,
    currency: current?.currency ?? "USD",
    marketState: "streaming",
    asOf: message.t,
    source,
  };
}
