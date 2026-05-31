import { describe, it, expect } from "vitest";
import {
  winRate,
  maxDrawdown,
  xirr,
  monthlyRealized,
  allocation,
} from "@/lib/metrics/metrics";

describe("winRate", () => {
  it("is the fraction of sales with positive gain", () => {
    expect(winRate([100, -50, 200, 0])).toBeCloseTo(0.5, 10);
  });
  it("is 0 for no sales", () => {
    expect(winRate([])).toBe(0);
  });
});

describe("maxDrawdown", () => {
  it("finds the largest peak-to-trough drop fraction", () => {
    expect(maxDrawdown([100, 120, 90, 130, 80])).toBeCloseTo(0.3846, 4);
  });
  it("is 0 for a monotonically rising series", () => {
    expect(maxDrawdown([100, 110, 120])).toBe(0);
  });
});

describe("xirr", () => {
  it("solves a simple 10% annual return", () => {
    const r = xirr([
      { date: "2026-01-01", amount: -1000 },
      { date: "2027-01-01", amount: 1100 },
    ]);
    expect(r).not.toBeNull();
    expect(r as number).toBeCloseTo(0.1, 3);
  });
  it("returns null without both inflow and outflow", () => {
    expect(xirr([{ date: "2026-01-01", amount: -1000 }])).toBeNull();
  });
});

describe("monthlyRealized", () => {
  it("buckets gains by YYYY-MM, sorted ascending", () => {
    const out = monthlyRealized([
      { date: "2026-05-27T10:00:00Z", gain: 1000 },
      { date: "2026-05-01T10:00:00Z", gain: 500 },
      { date: "2026-06-10T10:00:00Z", gain: -200 },
    ]);
    expect(out).toEqual([
      { month: "2026-05", gain: 1500 },
      { month: "2026-06", gain: -200 },
    ]);
  });
});

describe("allocation", () => {
  it("computes percentage shares", () => {
    const out = allocation([
      { key: "A", value: 30 },
      { key: "B", value: 10 },
    ]);
    expect(out[0]).toMatchObject({ key: "A", value: 30, pct: 75 });
    expect(out[1]).toMatchObject({ key: "B", value: 10, pct: 25 });
  });
  it("is empty for no items", () => {
    expect(allocation([])).toEqual([]);
  });
});
