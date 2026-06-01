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
  previousClose: number | null;
  currency: string | null;
  marketState: string | null;
  asOf: string | null;
}
