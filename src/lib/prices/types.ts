/** One daily OHLC candle. `time` is a YYYY-MM-DD business day. */
export interface Candle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface QuoteSnapshot {
  ticker: string;
  price: number;
  last: number | null;
  bid: number | null;
  ask: number | null;
  bidSize: number | null;
  askSize: number | null;
  previousClose: number | null;
  currency: string | null;
  marketState: string | null;
  asOf: string | null;
  source: string;
}
