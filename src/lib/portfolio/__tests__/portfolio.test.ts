import { describe, it, expect } from "vitest";
import { Decimal } from "@/lib/money/decimal";
import { buildPortfolio, extractSaleEvents } from "@/lib/portfolio/portfolio";
import type { Account, StoredTransaction } from "@/lib/store/types";

const close = (a: Decimal, expected: number, tol = 0.01) =>
  expect(Math.abs(Number(a.toString()) - expected)).toBeLessThanOrEqual(tol);

const accounts: Account[] = [
  { id: "acc_webull", broker: "Webull", accountLabel: "Webull", currency: "USD" },
];

function tx(p: Partial<StoredTransaction> & Pick<StoredTransaction, "id" | "side" | "qty" | "price">): StoredTransaction {
  return {
    accountId: "acc_webull",
    ticker: "ASTS",
    exchange: "NASDAQ",
    stockValue: null,
    fees: "0",
    couponsWaived: null,
    executedAt: "2026-05-08T18:33:52Z",
    executedTz: "America/New_York",
    createdAt: "2026-05-08T18:33:52Z",
    ...p,
  };
}

const ASTS_BUY = tx({
  id: "b1",
  side: "buy",
  qty: "37.04352",
  price: "73.400135",
  stockValue: "2719.00",
  fees: "2.91",
});
const ASTS_SELL = tx({
  id: "s1",
  side: "sell",
  qty: "19",
  price: "129.0501",
  fees: "2.69",
  executedAt: "2026-05-27T18:16:56Z",
});

describe("buildPortfolio", () => {
  it("derives holding, avg cost and realized gain (FIFO §3.5)", () => {
    const p = buildPortfolio(accounts, [ASTS_BUY, ASTS_SELL]);
    expect(p.holdings).toHaveLength(1);
    close(p.holdings[0].qty, 18.04352, 1e-7);
    close(p.holdings[0].avgCost, 73.4787, 0.001);
    close(p.totalRealizedGain, 1053.16, 0.01);
    expect(p.openPositions).toBe(1);
    expect(p.realizedByTxId.get("s1")).toBeDefined();
  });

  it("reports a sell with no matching buy as a group error (no crash)", () => {
    const p = buildPortfolio(accounts, [ASTS_SELL]);
    expect(p.errors).toHaveLength(1);
    expect(p.holdings).toHaveLength(0);
  });
});

describe("extractSaleEvents", () => {
  it("returns one SaleEvent with gain + cost basis for the §3.5 sell", () => {
    const events = extractSaleEvents([ASTS_BUY, ASTS_SELL]);
    expect(events).toHaveLength(1);
    expect(events[0].date).toBe("2026-05-27T18:16:56Z");
    close(events[0].gainUsd, 1053.16, 0.01);
    close(events[0].principalUsd, 1396.09, 0.01); // 19 × ~73.4787
  });

  it("is sorted by date across groups", () => {
    const later = tx({ id: "b2", side: "buy", qty: "5", price: "10", executedAt: "2026-06-01T00:00:00Z" });
    const sellLater = tx({ id: "s2", side: "sell", qty: "5", price: "20", executedAt: "2026-06-02T00:00:00Z" });
    const events = extractSaleEvents([ASTS_BUY, ASTS_SELL, later, sellLater]);
    expect(events.map((e) => e.date)).toEqual([
      "2026-05-27T18:16:56Z",
      "2026-06-02T00:00:00Z",
    ]);
  });
});
