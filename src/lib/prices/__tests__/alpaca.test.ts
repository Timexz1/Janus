import { describe, expect, it } from "vitest";
import { applyAlpacaStreamMessage } from "../alpaca";
import type { QuoteSnapshot } from "../types";

const fallback: QuoteSnapshot = {
  ticker: "AMD",
  price: 100,
  last: 100,
  bid: null,
  ask: null,
  bidSize: null,
  askSize: null,
  previousClose: 99,
  currency: "USD",
  marketState: null,
  asOf: "2026-06-01T00:00:00.000Z",
  source: "yahoo",
};

describe("applyAlpacaStreamMessage", () => {
  it("updates last trade while preserving prior close", () => {
    expect(applyAlpacaStreamMessage(fallback, {
      T: "t",
      S: "AMD",
      p: 101.25,
      t: "2026-06-01T00:00:01.000Z",
    }, "iex")).toMatchObject({
      ticker: "AMD",
      price: 101.25,
      last: 101.25,
      previousClose: 99,
      source: "alpaca-iex",
    });
  });

  it("uses the mid price when only bid and ask are available", () => {
    const next = applyAlpacaStreamMessage(undefined, {
      T: "q",
      S: "AMD",
      bp: 99.9,
      ap: 100.1,
      bs: 3,
      as: 5,
      t: "2026-06-01T00:00:02.000Z",
    }, "iex");

    expect(next).toMatchObject({
      ticker: "AMD",
      price: 100,
      bid: 99.9,
      ask: 100.1,
      bidSize: 3,
      askSize: 5,
    });
  });

  it("keeps the last trade as the display price after a quote update", () => {
    const streamed = applyAlpacaStreamMessage(fallback, {
      T: "t",
      S: "AMD",
      p: 101.25,
      t: "2026-06-01T00:00:01.000Z",
    }, "iex");

    expect(applyAlpacaStreamMessage(streamed, {
      T: "q",
      S: "AMD",
      bp: 101.2,
      ap: 101.3,
      bs: 2,
      as: 4,
      t: "2026-06-01T00:00:03.000Z",
    }, "iex")).toMatchObject({
      price: 101.25,
      last: 101.25,
      bid: 101.2,
      ask: 101.3,
    });
  });
});
