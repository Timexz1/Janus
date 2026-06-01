import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

const HEADERS = [
  "broker", "ticker", "side", "qty", "price", "fees", "executed_at",
  "exchange", "stock_value", "coupons_waived", "fx_rate", "thb_cost", "executed_tz",
];

type TxRow = Record<string, unknown>;

function toCsvRow(r: TxRow, brokerMap: Record<string, string>): string {
  const broker = brokerMap[r.broker_id as string] ?? String(r.broker_id);
  const values = [
    broker,
    r.ticker,
    r.side,
    r.qty,
    r.price,
    r.fees ?? "0",
    (r.executed_at as string)?.replace("T", " ").replace(/\.\d+Z$/, ""),
    r.exchange ?? "",
    r.stock_value ?? "",
    r.coupons_waived ?? "",
    r.fx_rate ?? "",
    r.thb_cost ?? "",
    r.executed_tz ?? "",
  ].map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`);
  return values.join(",");
}

const TEMPLATE_ROW = `"Webull","AAPL","buy","10","185.23","0.50","2026-01-15 09:30:00","NASDAQ","","","",""`;

export async function GET() {
  const supabase = await createServerSupabase();

  if (!supabase) {
    const csv = [HEADERS.join(","), TEMPLATE_ROW].join("\n");
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="transactions-sample.csv"',
      },
    });
  }

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [{ data: txRows }, { data: brokers }] = await Promise.all([
    supabase.from("transactions").select("*").order("executed_at"),
    supabase.from("brokers").select("id, display_name"),
  ]);

  const brokerMap: Record<string, string> = {};
  for (const b of (brokers ?? [])) brokerMap[b.id] = b.display_name;

  const rows = (txRows ?? []) as TxRow[];
  const lines = [HEADERS.join(","), ...rows.map((r) => toCsvRow(r, brokerMap))];

  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="transactions-sample.csv"',
    },
  });
}
