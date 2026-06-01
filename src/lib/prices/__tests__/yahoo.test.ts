import { describe, expect, it } from "vitest";
import { pickYahooQuotePrice } from "../yahoo";

describe("pickYahooQuotePrice", () => {
  it("prefers pre-market price when market state is PRE", () => {
    expect(pickYahooQuotePrice({
      marketState: "PRE",
      regularMarketPrice: 10,
      preMarketPrice: 10.75,
      regularMarketTime: 100,
      preMarketTime: 200,
    })).toEqual({
      price: 10.75,
      asOf: new Date(200_000).toISOString(),
    });
  });

  it("prefers post-market price when market state is POST", () => {
    expect(pickYahooQuotePrice({
      marketState: "POST",
      regularMarketPrice: 10,
      postMarketPrice: 9.9,
      regularMarketTime: 100,
      postMarketTime: 300,
    })).toEqual({
      price: 9.9,
      asOf: new Date(300_000).toISOString(),
    });
  });

  it("falls back to the regular market price during normal sessions", () => {
    expect(pickYahooQuotePrice({
      marketState: "REGULAR",
      regularMarketPrice: 12.34,
      regularMarketTime: 400,
    })).toEqual({
      price: 12.34,
      asOf: new Date(400_000).toISOString(),
    });
  });
});
