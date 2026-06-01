import { describe, it, expect } from "vitest";
import { validateRow } from "../validate";

describe("validateRow", () => {
  const valid = {
    broker: "Webull",
    ticker: "AAPL",
    side: "buy",
    qty: "10",
    price: "185.23",
    fees: "0.5",
    executed_at: "2026-01-15 09:30:00",
  };

  it("accepts a fully valid row", () => {
    const result = validateRow(valid);
    expect(result.errors).toHaveLength(0);
    expect(result.row.brokerId).toBe("webull");
    expect(result.row.ticker).toBe("AAPL");
    expect(result.row.side).toBe("buy");
  });

  it("normalises broker case-insensitively", () => {
    const result = validateRow({ ...valid, broker: "WEBULL" });
    expect(result.errors).toHaveLength(0);
    expect(result.row.brokerId).toBe("webull");
  });

  it("rejects unknown broker", () => {
    const result = validateRow({ ...valid, broker: "SomeBroker" });
    expect(result.errors.some((e) => e.field === "broker")).toBe(true);
  });

  it("rejects zero qty", () => {
    const result = validateRow({ ...valid, qty: "0" });
    expect(result.errors.some((e) => e.field === "qty")).toBe(true);
  });

  it("rejects negative fees", () => {
    const result = validateRow({ ...valid, fees: "-1" });
    expect(result.errors.some((e) => e.field === "fees")).toBe(true);
  });

  it("rejects invalid date", () => {
    const result = validateRow({ ...valid, executed_at: "not-a-date" });
    expect(result.errors.some((e) => e.field === "executed_at")).toBe(true);
  });
});
