/** One daily OHLC candle. `time` is a YYYY-MM-DD business day. */
export interface Candle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}
