import { describe, it, expect } from "vitest";
import { Decimal, D } from "@/lib/money/decimal";
import { calcProgressiveTax } from "@/lib/tax/brackets";
import { matchRemittances, toTaxableInputs, outboundFromTrades, type SaleEvent } from "@/lib/tax/remittance";
import { computeTax, whatIfRemittance } from "@/lib/tax/engine";

const eq = (a: Decimal, expected: number, tol = 0.01) =>
  expect(Math.abs(Number(a.toString()) - expected)).toBeLessThanOrEqual(tol);

// ---------------------------------------------------------------------------
// Progressive brackets (Thai PIT — verify rates §3.4)
// ---------------------------------------------------------------------------
describe("calcProgressiveTax", () => {
  const cases: [number, number][] = [
    [0, 0],
    [150_000, 0],
    [300_000, 7_500], // 150k @ 5%
    [500_000, 27_500], // +200k @ 10%
    [750_000, 65_000], // +250k @ 15%
    [1_000_000, 115_000], // +250k @ 20%
    [6_000_000, 1_615_000], // 25%/30%/35% tiers
  ];
  it.each(cases)("net %d THB → tax %d", (net, expected) => {
    eq(calcProgressiveTax(D(net)).total, expected);
  });

  it("returns a per-bracket breakdown that sums to the total", () => {
    const r = calcProgressiveTax(D(500_000));
    const summed = r.lines.reduce((s, l) => s.plus(l.taxInBracket), new Decimal(0));
    eq(summed, Number(r.total.toString()));
  });
});

// ---------------------------------------------------------------------------
// Remittance → gain matching (§3.3)
// ---------------------------------------------------------------------------
const sale = (date: string, gain: number, principal: number): SaleEvent => ({
  date,
  gainUsd: D(gain),
  principalUsd: D(principal),
});
const rem = (id: string, date: string, amountUsd: number, fxRate: number) => ({
  id,
  date,
  amountUsd: D(amountUsd),
  fxRate: D(fxRate),
});

describe("toTaxableInputs", () => {
  it("keeps only inbound (to-Thailand) remittances; outbound funding is excluded", () => {
    const out = toTaxableInputs([
      { id: "a", date: "2026-06-01", amountUsd: "1000", fxRate: "35", direction: "inbound" },
      { id: "b", date: "2026-06-02", amountUsd: "5000", fxRate: "35", direction: "outbound" },
      { id: "c", date: "2026-06-03", amountUsd: "500", fxRate: "35" }, // legacy → inbound
    ]);
    expect(out.map((r) => r.id)).toEqual(["a", "c"]);
    expect(out[0].amountUsd.toString()).toBe("1000");
    expect(out[0].fxRate.toString()).toBe("35");
  });
});

describe("matchRemittances", () => {
  it("gain_first: remitted money is gain until the pool is empty", () => {
    const lines = matchRemittances(
      [sale("2026-05-27", 1000, 2000)],
      [rem("r1", "2026-06-01", 1500, 35)],
      "gain_first",
    );
    eq(lines[0].gainUsdMatched, 1000);
    eq(lines[0].taxableThb, 35_000); // 1000 × 35
  });

  it("principal_first: principal consumed first, only the excess is gain", () => {
    const lines = matchRemittances(
      [sale("2026-05-27", 1000, 2000)],
      [rem("r1", "2026-06-01", 2500, 35)],
      "principal_first",
    );
    eq(lines[0].gainUsdMatched, 500); // 2500 − 2000 principal
    eq(lines[0].taxableThb, 17_500);
  });

  it("pro_rata: split by gain:principal ratio of the proceeds pool", () => {
    const lines = matchRemittances(
      [sale("2026-05-27", 1000, 2000)],
      [rem("r1", "2026-06-01", 1500, 35)],
      "pro_rata",
    );
    eq(lines[0].gainUsdMatched, 500); // 1500 × (1000/3000)
    eq(lines[0].taxableThb, 17_500);
  });

  it("depletes the gain pool across multiple remittances (gain_first)", () => {
    const lines = matchRemittances(
      [sale("2026-05-27", 1000, 5000)],
      [rem("r1", "2026-06-01", 600, 30), rem("r2", "2026-06-10", 600, 30)],
      "gain_first",
    );
    eq(lines[0].gainUsdMatched, 600);
    eq(lines[1].gainUsdMatched, 400); // only 400 gain left
  });

  it("ignores gains realized AFTER the remittance date", () => {
    const lines = matchRemittances(
      [sale("2026-05-27", 1000, 2000)],
      [rem("r1", "2026-05-01", 1000, 35)], // before the sale
      "gain_first",
    );
    eq(lines[0].gainUsdMatched, 0);
    eq(lines[0].taxableThb, 0);
  });
});

// ---------------------------------------------------------------------------
// Full computation + what-if (§3.4)
// ---------------------------------------------------------------------------
describe("computeTax", () => {
  const base = {
    saleEvents: [sale("2026-05-27", 1000, 2000)],
    remittances: [rem("r1", "2026-06-01", 1500, 35)],
    otherIncomeThb: D(500_000),
    personalAllowance: D(60_000),
    method: "gain_first" as const,
    taxYear: 2026,
  };

  it("rolls remitted gain into progressive tax", () => {
    const r = computeTax(base);
    eq(r.taxableRemittedThb, 35_000);
    eq(r.netIncomeThb, 475_000); // 500000 + 35000 − 60000
    eq(r.tax.total, 25_000); // 7500 + 175000×10%
    eq(r.unremittedGainUsd, 0);
  });

  it("only counts remittances within the tax year", () => {
    const r = computeTax({ ...base, taxYear: 2027 });
    eq(r.taxableRemittedThb, 0);
    eq(r.netIncomeThb, 440_000); // 500000 − 60000
  });
});

describe("whatIfRemittance — marginal tax of remitting more", () => {
  it("computes the extra tax of an additional remittance", () => {
    const r = whatIfRemittance(
      {
        saleEvents: [sale("2026-05-27", 1000, 2000)],
        remittances: [],
        otherIncomeThb: D(500_000),
        personalAllowance: D(60_000),
        method: "gain_first",
        taxYear: 2026,
      },
      rem("whatif", "2026-06-01", 1000, 35),
    );
    eq(r.extraTaxableThb, 35_000);
    eq(r.marginalTax, 3_500); // (475000 vs 440000) crosses 10% band
  });
});

// ---------------------------------------------------------------------------
// outboundFromTrades — THB-funded buys as money sent abroad
// ---------------------------------------------------------------------------
describe("outboundFromTrades", () => {
  const t = (side: string, fxRate: string | null, thbCost: string | null) => ({ side, fxRate, thbCost });

  it("sums THB-funded buys in THB and USD-equivalent", () => {
    const out = outboundFromTrades([
      t("buy", "33.80", "2000.28"), // ≈ 59.18 USD
      t("buy", "35.00", "3500.00"), // = 100 USD
    ]);
    eq(out.thb, 5500.28);
    eq(out.usd, 159.18, 0.02);
  });

  it("ignores USD trades, sells, and zero/blank THB", () => {
    const out = outboundFromTrades([
      t("buy", null, null), // Webull USD buy
      t("sell", "33.80", "1000"), // a sell is not money-out
      t("buy", "33.80", "0"), // zero
      t("buy", "33.80", "338"), // = 10 USD
    ]);
    eq(out.thb, 338);
    eq(out.usd, 10, 0.001);
  });

  it("counts THB even when fxRate is missing (USD-equiv skipped)", () => {
    const out = outboundFromTrades([t("buy", null, "1000")]);
    eq(out.thb, 1000);
    eq(out.usd, 0);
  });
});
