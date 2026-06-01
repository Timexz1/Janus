import { describe, it, expect } from "vitest";
import { tradeKey, dedupe, type TradeKeyFields } from "@/lib/import/dedupe";

const row = (over: Partial<TradeKeyFields> = {}): TradeKeyFields => ({
  brokerId: "dime",
  ticker: "RDW",
  side: "buy",
  qty: "87.75",
  price: "10.9",
  fees: "1.44",
  executedAt: "2025-10-08T01:24",
  ...over,
});

describe("tradeKey", () => {
  it("treats numerically-equal decimals as the same key (10.90 == 10.9)", () => {
    expect(tradeKey(row({ price: "10.90" }))).toBe(tradeKey(row({ price: "10.9" })));
  });
  it("is case-insensitive on ticker", () => {
    expect(tradeKey(row({ ticker: "rdw" }))).toBe(tradeKey(row({ ticker: "RDW" })));
  });
  it("differs when a meaningful field differs", () => {
    expect(tradeKey(row({ qty: "87.75" }))).not.toBe(tradeKey(row({ qty: "16.59" })));
  });
});

describe("dedupe", () => {
  it("keeps one of duplicate screenshots and reports the rest", () => {
    const items = [row(), row(), row({ ticker: "EOSE" })];
    const { unique, removed } = dedupe(items, tradeKey);
    expect(unique).toHaveLength(2);
    expect(removed).toHaveLength(1);
  });

  it("drops items whose key already exists (against stored)", () => {
    const existingKeys = new Set([tradeKey(row())]);
    const items = [row(), row({ ticker: "EOSE" })];
    const { unique, removed } = dedupe(items, tradeKey, existingKeys);
    expect(unique.map((i) => i.ticker)).toEqual(["EOSE"]);
    expect(removed).toHaveLength(1);
  });

  it("returns everything when there are no duplicates", () => {
    const items = [row(), row({ ticker: "EOSE" }), row({ ticker: "ASTS" })];
    const { unique, removed } = dedupe(items, tradeKey);
    expect(unique).toHaveLength(3);
    expect(removed).toHaveLength(0);
  });
});
