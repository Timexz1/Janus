"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";
import { useStore } from "@/lib/store/hooks";
import { useT } from "@/lib/i18n/context";
import { buildPortfolio } from "@/lib/portfolio/portfolio";
import { ChartView, type TradeMarker } from "@/components/chart-view";
import { Card, Select, EmptyState, StatCard } from "@/components/ui";
import { ZERO } from "@/lib/money/decimal";
import type { Candle } from "@/lib/prices/types";
import { fmtUsd, fmtSignedUsd, fmtQty, fmtPrice, isoToNyDate, gainTone } from "@/lib/format";

const TIMEFRAMES = [
  { key: "3M", months: 3 },
  { key: "6M", months: 6 },
  { key: "1Y", months: 12 },
  { key: "ALL", months: 0 },
] as const;

function ChartsInner() {
  const urlTicker = useSearchParams().get("ticker");
  const { accounts, transactions, hydrated } = useStore();
  const portfolio = useMemo(
    () => buildPortfolio(accounts, transactions),
    [accounts, transactions],
  );

  const tickers = useMemo(
    () => Array.from(new Set(transactions.map((t) => t.ticker))).sort(),
    [transactions],
  );
  const [tickerOverride, setTickerOverride] = useState<string | null>(null);
  const [timeframe, setTimeframe] = useState<(typeof TIMEFRAMES)[number]["key"]>("1Y");
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ticker = tickerOverride ?? urlTicker?.toUpperCase() ?? tickers[0] ?? "";

  // prefer the ticker from the URL (?ticker=) — works even for a symbol the user
  // hasn't traded yet (future-proof: just shows its price chart) — else first held
  // the dropdown always includes the selected ticker, even if not yet traded
  const tickerOptions = useMemo(
    () => Array.from(new Set([...tickers, ticker].filter(Boolean))).sort(),
    [tickers, ticker],
  );

  // fetch real candles when the ticker changes
  useEffect(() => {
    if (!ticker) {
      queueMicrotask(() => {
        setCandles([]);
        setError(null);
        setLoading(false);
      });
      return;
    }
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) {
        setLoading(true);
        setError(null);
      }
    });
    fetch(`/api/prices?ticker=${encodeURIComponent(ticker)}`)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        if (j.error) setError(j.error);
        else setCandles(j.candles ?? []);
      })
      .catch((e) => !cancelled && setError(String(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [ticker]);

  // filter to the chosen timeframe, relative to the latest candle (robust to clock)
  const visible = useMemo(() => {
    if (candles.length === 0) return [];
    const tf = TIMEFRAMES.find((t) => t.key === timeframe)!;
    if (tf.months === 0) return candles;
    const last = candles[candles.length - 1].time;
    const cutoff = new Date(last);
    cutoff.setMonth(cutoff.getMonth() - tf.months);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    return candles.filter((c) => c.time >= cutoffStr);
  }, [candles, timeframe]);

  const tradesForTicker = useMemo(
    () => transactions.filter((t) => t.ticker === ticker),
    [transactions, ticker],
  );

  const markers: TradeMarker[] = useMemo(
    () =>
      tradesForTicker.map((t) => ({
        time: isoToNyDate(t.executedAt),
        side: t.side,
        text: `${t.side === "buy" ? "ซื้อ" : "ขาย"} ${fmtQty(t.qty)}`,
      })),
    [tradesForTicker],
  );

  // avg cost across all accounts for this ticker
  const avgCost = useMemo(() => {
    const hs = portfolio.holdings.filter((h) => h.ticker === ticker);
    if (hs.length === 0) return null;
    const qty = hs.reduce((s, h) => s.plus(h.qty), ZERO);
    const cost = hs.reduce((s, h) => s.plus(h.costValue), ZERO);
    return qty.gt(0) ? Number(cost.div(qty).toString()) : null;
  }, [portfolio.holdings, ticker]);

  const realized = useMemo(() => {
    return tradesForTicker
      .filter((t) => t.side === "sell")
      .reduce((s, t) => s.plus(portfolio.realizedByTxId.get(t.id) ?? ZERO), ZERO);
  }, [tradesForTicker, portfolio.realizedByTxId]);

  const heldQty = useMemo(() => {
    const hs = portfolio.holdings.filter((h) => h.ticker === ticker);
    return hs.reduce((s, h) => s.plus(h.qty), ZERO);
  }, [portfolio.holdings, ticker]);

  const lastClose = candles.length ? candles[candles.length - 1].close : null;
  const prevClose = candles.length > 1 ? candles[candles.length - 2].close : null;
  const changePct =
    lastClose != null && prevClose ? ((lastClose - prevClose) / prevClose) * 100 : null;
  const buys = tradesForTicker.filter((t) => t.side === "buy").length;
  const sells = tradesForTicker.filter((t) => t.side === "sell").length;

  // current position status (unrealized P/L) for the selected ticker
  const heldQtyNum = Number(heldQty.toString());
  const marketValue = lastClose != null ? heldQtyNum * lastClose : null;
  const costValue = avgCost != null ? heldQtyNum * avgCost : null;
  const unrealized =
    marketValue != null && costValue != null ? marketValue - costValue : null;
  const unrealizedPct =
    unrealized != null && costValue ? (unrealized / costValue) * 100 : null;

  if (!hydrated) return <Card className="h-64 animate-pulse" />;

  if (tickerOptions.length === 0) {
    return (
      <div className="space-y-5">
        <Header />
        <EmptyState
          title="ยังไม่มีหุ้นให้แสดงกราฟ"
          description="เพิ่มรายการเทรดก่อน แล้วกลับมาดูกราฟราคาจริงพร้อมจุดซื้อ/ขายของคุณ"
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Header />

      <div className="flex flex-wrap items-center gap-3">
        <div className="w-40">
          <Select value={ticker} onChange={(e) => setTickerOverride(e.target.value)}>
            {tickerOptions.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </Select>
        </div>
        <div className="flex items-center gap-1 rounded-md border border-slate-800 p-0.5">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf.key}
              onClick={() => setTimeframe(tf.key)}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                timeframe === tf.key
                  ? "bg-slate-800 text-slate-100"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {tf.key}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="ราคาล่าสุด"
          value={lastClose != null ? fmtPrice(lastClose) : "—"}
          hint={
            changePct != null
              ? `${changePct >= 0 ? "▲" : "▼"} ${Math.abs(changePct).toFixed(2)}% วันก่อนหน้า`
              : "Yahoo EOD"
          }
          tone={changePct == null ? "default" : changePct >= 0 ? "positive" : "negative"}
        />
        <StatCard
          label="ต้นทุนเฉลี่ย"
          value={avgCost != null ? fmtPrice(avgCost) : "—"}
          hint={`ถือ ${fmtQty(heldQty)} หุ้น`}
        />
        <StatCard
          label="กำไร/ขาดทุนปัจจุบัน"
          value={
            unrealized != null && heldQtyNum > 0 ? fmtSignedUsd(unrealized) : "—"
          }
          tone={
            unrealized == null || heldQtyNum <= 0
              ? "default"
              : unrealized >= 0
                ? "positive"
                : "negative"
          }
          hint={
            unrealized != null && heldQtyNum > 0 && unrealizedPct != null
              ? `${unrealizedPct >= 0 ? "+" : ""}${unrealizedPct.toFixed(2)}% · มูลค่า ${marketValue != null ? fmtUsd(marketValue) : "—"}`
              : "ยังไม่ถือหุ้นนี้"
          }
        />
        <StatCard
          label="กำไร realized"
          value={realized.isZero() ? "—" : fmtSignedUsd(realized)}
          tone={gainTone(realized)}
          hint={`ซื้อ ${buys} · ขาย ${sells} ครั้ง`}
        />
      </div>

      <Card>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-200">
            {ticker} · ราคาจริง (รายวัน)
          </h2>
          <div className="flex items-center gap-3 text-xs text-slate-400">
            <span className="flex items-center gap-1">
              <ArrowUpRight className="h-3.5 w-3.5 text-emerald-400" aria-hidden /> ซื้อ
            </span>
            <span className="flex items-center gap-1">
              <ArrowDownRight className="h-3.5 w-3.5 text-rose-400" aria-hidden /> ขาย
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-0 w-4 border-t border-dashed border-indigo-400" />
              ต้นทุนเฉลี่ย
            </span>
          </div>
        </div>
        {loading ? (
          <div className="h-[420px] animate-pulse rounded bg-slate-800/40" />
        ) : error ? (
          <div className="flex h-[420px] items-center justify-center text-sm text-rose-400">
            ดึงราคาไม่สำเร็จ: {error}
          </div>
        ) : visible.length === 0 ? (
          <div className="flex h-[420px] items-center justify-center text-sm text-slate-500">
            ไม่พบข้อมูลราคาของ {ticker} จาก Yahoo Finance
          </div>
        ) : (
          <ChartView candles={visible} markers={markers} avgCost={avgCost} height={420} />
        )}
      </Card>
    </div>
  );
}

function Header() {
  const { t } = useT();
  return (
    <header>
      <h1 className="text-lg font-semibold text-slate-100">{t("charts.title")}</h1>
      <p className="mt-1 text-sm text-slate-500">
        ราคาจริงรายวัน (Yahoo Finance) พร้อมจุดซื้อ/ขายของคุณและเส้นต้นทุนเฉลี่ย
      </p>
    </header>
  );
}

export default function ChartsPage() {
  return (
    <Suspense fallback={<Card className="h-64 animate-pulse" />}>
      <ChartsInner />
    </Suspense>
  );
}
