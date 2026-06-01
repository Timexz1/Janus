import { NextResponse } from "next/server";
import { fetchDailyCandles, fetchQuoteSnapshots } from "@/lib/prices/yahoo";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0, must-revalidate",
};

/** GET /api/prices?ticker=ASTS or /api/prices?tickers=ASTS,QQQ */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const ticker = url.searchParams.get("ticker");
  const tickers = url.searchParams.get("tickers");
  const range = url.searchParams.get("range") ?? "5y";

  if (tickers) {
    const list = tickers.split(",").map((value) => value.trim()).filter(Boolean);
    try {
      const quotes = await fetchQuoteSnapshots(list);
      return NextResponse.json({ provider: "yahoo", quotes }, { headers: NO_STORE_HEADERS });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Unable to fetch live prices" },
        { status: 502, headers: NO_STORE_HEADERS },
      );
    }
  }

  if (!ticker) {
    return NextResponse.json(
      { error: "ticker is required" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  try {
    const [candlesResult, quoteResult] = await Promise.allSettled([
      fetchDailyCandles(ticker, range),
      fetchQuoteSnapshots([ticker]),
    ]);

    if (candlesResult.status !== "fulfilled") throw candlesResult.reason;

    const quote = quoteResult.status === "fulfilled" ? (quoteResult.value[0] ?? null) : null;
    return NextResponse.json(
      { ticker, provider: "yahoo", candles: candlesResult.value, quote },
      { headers: NO_STORE_HEADERS },
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unable to fetch prices" },
      { status: 502, headers: NO_STORE_HEADERS },
    );
  }
}
