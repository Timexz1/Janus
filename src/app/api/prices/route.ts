import { NextResponse } from "next/server";
import { fetchDailyCandles } from "@/lib/prices/yahoo";

/** GET /api/prices?ticker=ASTS → real daily candles via Stooq (server-side). */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const ticker = url.searchParams.get("ticker");
  const range = url.searchParams.get("range") ?? "5y";
  if (!ticker) {
    return NextResponse.json({ error: "ต้องระบุ ticker" }, { status: 400 });
  }
  try {
    const candles = await fetchDailyCandles(ticker, range);
    return NextResponse.json({ ticker, provider: "yahoo", candles });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "ดึงราคาไม่สำเร็จ" },
      { status: 502 },
    );
  }
}
