import type { StoredTransaction } from "@/lib/store/types";
import { replaceAllTransactions } from "@/lib/store/local-store";

/**
 * Sample data drawn from the real screenshots in the brief (§3.5). Only the
 * internally-consistent trades are seeded (a buy must precede its sell), so no
 * numbers are fabricated:
 *   - Webull ASTS: buy 37.04352 then sell 19  → realized gain ≈ 1053.16
 *   - Dime   RDW : buy 16.5977167             → open position
 */
const SAMPLE: StoredTransaction[] = [
  {
    id: "tx_sample_asts_buy",
    accountId: "acc_webull",
    ticker: "ASTS",
    exchange: "NASDAQ",
    side: "buy",
    qty: "37.04352",
    price: "73.400135",
    stockValue: "2719.00",
    fees: "2.91",
    couponsWaived: null,
    executedAt: "2026-05-08T18:33:52Z", // 08/05/2026 14:33:52 EDT
    executedTz: "America/New_York",
    createdAt: "2026-05-08T18:33:52Z",
  },
  {
    id: "tx_sample_asts_sell",
    accountId: "acc_webull",
    ticker: "ASTS",
    exchange: "NASDAQ",
    side: "sell",
    qty: "19",
    price: "129.0501",
    stockValue: "2451.9519",
    fees: "2.69",
    couponsWaived: null,
    executedAt: "2026-05-27T18:16:56Z", // 27/05/2026 14:16:56 EDT
    executedTz: "America/New_York",
    createdAt: "2026-05-27T18:16:56Z",
  },
  {
    id: "tx_sample_rdw_buy",
    accountId: "acc_dime",
    ticker: "RDW",
    exchange: "NYSE",
    side: "buy",
    qty: "16.5977167",
    price: "10.89",
    stockValue: "180.86",
    fees: "0.29", // commission 0.27 + VAT 0.02
    couponsWaived: null,
    executedAt: "2025-10-07T18:38:00Z", // 8 ต.ค. 68 - 01:38 น. (Asia/Bangkok)
    executedTz: "Asia/Bangkok",
    createdAt: "2025-10-07T18:38:00Z",
  },
];

export function seedSampleData(): void {
  replaceAllTransactions(SAMPLE.map((t) => ({ ...t })));
}
