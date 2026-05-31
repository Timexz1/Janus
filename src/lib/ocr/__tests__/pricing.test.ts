import { describe, it, expect } from "vitest";
import {
  estimateCostUsd,
  usdToThb,
  perImageThb,
  CLAUDE_MODELS,
} from "@/lib/ocr/pricing";

describe("estimateCostUsd", () => {
  it("computes input+output cost from per-million pricing", () => {
    // Opus: $5/1M in, $25/1M out. 1000 in + 200 out.
    const cost = estimateCostUsd(1000, 200, CLAUDE_MODELS["claude-opus-4-8"].pricing);
    // 1000/1e6*5 + 200/1e6*25 = 0.005 + 0.005 = 0.01
    expect(cost).toBeCloseTo(0.01, 10);
  });
  it("is zero for zero tokens", () => {
    expect(estimateCostUsd(0, 0, CLAUDE_MODELS["claude-haiku-4-5"].pricing)).toBe(0);
  });
});

describe("usdToThb", () => {
  it("multiplies by the fx rate", () => {
    expect(usdToThb(2, 36.5)).toBeCloseTo(73, 10);
  });
});

describe("perImageThb", () => {
  it("combines cost + fx into a THB figure", () => {
    // Sonnet $3/$15. 1000 in + 200 out = 0.003 + 0.003 = 0.006 USD × 36.5 = 0.219
    const thb = perImageThb(1000, 200, CLAUDE_MODELS["claude-sonnet-4-6"].pricing, 36.5);
    expect(thb).toBeCloseTo(0.219, 6);
  });
});
