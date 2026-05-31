import { describe, it, expect } from "vitest";
import { Decimal, D } from "@/lib/money/decimal";
import { normalizeTrade } from "@/lib/engine/normalize";
import {
  replayTransactions,
  totalRealizedGain,
  InsufficientSharesError,
} from "@/lib/engine/fifo";
import type { EngineTransaction, RawTrade } from "@/lib/engine/types";

/** Assert a Decimal is within `tol` USD/shares of an expected number. */
function close(actual: Decimal, expected: number, tol = 0.01): void {
  const diff = Math.abs(Number(actual.toString()) - expected);
  expect(diff, `expected ${actual.toString()} ≈ ${expected} (±${tol})`).toBeLessThanOrEqual(tol);
}

/** Normalize a raw trade and wrap it as an engine transaction. */
function tx(id: string, executedAt: string, raw: RawTrade): EngineTransaction {
  const n = normalizeTrade(raw);
  return {
    id,
    executedAt,
    side: n.side,
    qty: n.qty,
    net: n.net,
    costPerShare: n.costPerShare,
  };
}

// ---------------------------------------------------------------------------
// §3.5 acceptance — normalization
// ---------------------------------------------------------------------------
describe("normalizeTrade — §3.5 real screenshots", () => {
  it("Webull ASTS buy: cost/share ≈ 73.4787, total cost = 2721.91", () => {
    const n = normalizeTrade({
      side: "buy",
      qty: D("37.04352"),
      price: D("73.400135"),
      fees: D("2.91"),
    });
    close(n.gross, 2719.0, 0.01); // จำนวนเงิน US$2,719.00
    close(n.net, 2721.91, 0.01); // 2719.00 + 2.91
    expect(n.costPerShare).not.toBeNull();
    close(n.costPerShare!, 73.4787, 0.001);
  });

  it("Dime RDW buy: total cost = 181.15 (uses broker stock value)", () => {
    const n = normalizeTrade({
      side: "buy",
      qty: D("16.5977167"),
      price: D("10.89"),
      stockValue: D("180.86"), // มูลค่าหุ้น (differs from qty*price on fractional fills)
      fees: D("0.29"), // คอม 0.27 + VAT 0.02
    });
    close(n.net, 181.15, 0.01);
  });

  it("Dime RDW buy: coupon waives commission even when OCR gives it as -1.44", () => {
    const n = normalizeTrade({
      side: "buy",
      qty: D("87.7504410"),
      price: D("10.94"),
      stockValue: D("960.00"),
      fees: D("1.44"), // ค่าคอมมิชชัน
      couponsWaived: D("-1.44"), // "แทนคำขอโทษ" shown with a minus sign
    });
    close(n.feesNet, 0, 0.0001); // 1.44 waived → no net fee
    close(n.net, 960.0, 0.01); // total cost = stock value, coupon cancelled the fee
  });

  it("Dime EOSE sell: net proceeds = 1426.91 (coupon waives commission)", () => {
    const n = normalizeTrade({
      side: "sell",
      qty: D("75.1806439"),
      price: D("18.98"),
      stockValue: D("1426.93"),
      fees: D("2.16"), // คอม 2.14 + TAF 0.02
      couponsWaived: D("2.14"), // รายการฟรีของเดือน waives the commission
    });
    close(n.net, 1426.91, 0.01);
    close(n.feesNet, 0.02, 0.001);
  });
});

// ---------------------------------------------------------------------------
// §3.5 acceptance — FIFO realized gain
// ---------------------------------------------------------------------------
describe("replayTransactions — §3.5 FIFO realized gain", () => {
  it("ASTS: buy 37.04352 then sell 19 → realized gain ≈ 1053.16", () => {
    const txs: EngineTransaction[] = [
      tx("buy1", "2026-05-08T14:33:52Z", {
        side: "buy",
        qty: D("37.04352"),
        price: D("73.400135"),
        fees: D("2.91"),
      }),
      tx("sell1", "2026-05-27T14:16:56Z", {
        side: "sell",
        qty: D("19"),
        price: D("129.0501"),
        fees: D("2.69"),
      }),
    ];

    const result = replayTransactions(txs);

    // net proceeds = 19 × 129.0501 − 2.69 = 2449.26
    expect(result.sales).toHaveLength(1);
    close(result.sales[0].realizedGain, 1053.16, 0.01);

    // one open lot remains with 37.04352 − 19 = 18.04352 shares
    expect(result.lots).toHaveLength(1);
    close(result.lots[0].qtyRemaining, 18.04352, 1e-7);
    close(totalRealizedGain(result), 1053.16, 0.01);
  });
});

// ---------------------------------------------------------------------------
// FIFO edge cases
// ---------------------------------------------------------------------------
describe("replayTransactions — edge cases", () => {
  it("consumes the OLDEST lot first across multiple buys", () => {
    const txs: EngineTransaction[] = [
      tx("b1", "2026-01-01T00:00:00Z", { side: "buy", qty: D("10"), price: D("100"), fees: D("0") }),
      tx("b2", "2026-02-01T00:00:00Z", { side: "buy", qty: D("10"), price: D("200"), fees: D("0") }),
      // sell 15: 10 @100 (cost 1000) + 5 @200 (cost 1000) = basis 2000; proceeds 15×300 = 4500
      tx("s1", "2026-03-01T00:00:00Z", { side: "sell", qty: D("15"), price: D("300"), fees: D("0") }),
    ];
    const result = replayTransactions(txs);
    close(result.sales[0].costBasis, 2000, 0.0000001);
    close(result.sales[0].realizedGain, 2500, 0.0000001);
    // remaining: 5 shares from the @200 lot
    expect(result.lots).toHaveLength(1);
    close(result.lots[0].qtyRemaining, 5, 1e-7);
    expect(result.lots[0].sourceTransactionId).toBe("b2");
  });

  it("orders by executedAt regardless of input order", () => {
    const txs: EngineTransaction[] = [
      tx("s1", "2026-03-01T00:00:00Z", { side: "sell", qty: D("5"), price: D("300"), fees: D("0") }),
      tx("b1", "2026-01-01T00:00:00Z", { side: "buy", qty: D("10"), price: D("100"), fees: D("0") }),
    ];
    const result = replayTransactions(txs);
    close(result.sales[0].realizedGain, 1000, 1e-7); // 5×300 − 5×100
    close(result.lots[0].qtyRemaining, 5, 1e-7);
  });

  it("throws InsufficientSharesError when selling more than held", () => {
    const txs: EngineTransaction[] = [
      tx("b1", "2026-01-01T00:00:00Z", { side: "buy", qty: D("5"), price: D("100"), fees: D("0") }),
      tx("s1", "2026-02-01T00:00:00Z", { side: "sell", qty: D("6"), price: D("100"), fees: D("0") }),
    ];
    expect(() => replayTransactions(txs)).toThrow(InsufficientSharesError);
  });

  it("supports fractional-share consumption", () => {
    const txs: EngineTransaction[] = [
      tx("b1", "2026-01-01T00:00:00Z", { side: "buy", qty: D("1.2345678"), price: D("10"), fees: D("0") }),
      tx("s1", "2026-02-01T00:00:00Z", { side: "sell", qty: D("0.2345678"), price: D("20"), fees: D("0") }),
    ];
    const result = replayTransactions(txs);
    close(result.lots[0].qtyRemaining, 1, 1e-7);
    close(result.sales[0].realizedGain, 0.2345678 * 10, 1e-6); // proceeds 0.2345678×20 − basis ×10
  });
});
