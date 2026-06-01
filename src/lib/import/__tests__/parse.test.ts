import { describe, it, expect } from "vitest";
import { parseFile } from "../parse";

describe("parseFile CSV", () => {
  it("parses valid CSV rows", async () => {
    const csv = `broker,ticker,side,qty,price,fees,executed_at
Webull,AAPL,buy,10,185.23,0.5,2026-01-15 09:30:00`;
    const file = new File([csv], "test.csv", { type: "text/csv" });
    const rows = await parseFile(file);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      broker: "Webull",
      ticker: "AAPL",
      side: "buy",
      qty: "10",
      price: "185.23",
      fees: "0.5",
      executed_at: "2026-01-15 09:30:00",
    });
  });

  it("returns empty array for empty CSV", async () => {
    const file = new File(
      ["broker,ticker,side,qty,price,fees,executed_at\n"],
      "empty.csv",
      { type: "text/csv" },
    );
    const rows = await parseFile(file);
    expect(rows).toHaveLength(0);
  });
});
