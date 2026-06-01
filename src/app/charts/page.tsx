"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { useStore } from "@/lib/store/hooks";
import { useT } from "@/lib/i18n/context";
import { buildPortfolio } from "@/lib/portfolio/portfolio";
import { ChartView, type TradeMarker } from "@/components/chart-view";
import { Card, EmptyState, Select, StatCard } from "@/components/ui";
import { ZERO } from "@/lib/money/decimal";
import type { Candle } from "@/lib/prices/types";
import {
  fmtPrice,
  fmtQty,
  fmtSignedUsd,
  fmtUsd,
  gainTone,
  isoToNyDate,
} from "@/lib/format";
import {
  DEFAULT_CHART_INDICATORS,
  getChartState,
  saveChartState,
} from "@/lib/store/local-store";
import type {
  ChartDrawing,
  ChartIndicators,
  ChartPeriod,
  ChartTimeframe,
  ChartVisibleRange,
} from "@/lib/store/types";

const PERIODS: Array<{ key: ChartPeriod; months: number }> = [
  { key: "1M", months: 1 },
  { key: "3M", months: 3 },
  { key: "6M", months: 6 },
  { key: "YTD", months: -1 },
  { key: "1Y", months: 12 },
  { key: "5Y", months: 60 },
  { key: "ALL", months: 0 },
];

const TIMEFRAMES: Array<{ key: ChartTimeframe; label: string }> = [
  { key: "D", label: "D" },
  { key: "W", label: "W" },
  { key: "M", label: "M" },
];

function candleBucketKey(time: string, timeframe: ChartTimeframe) {
  if (timeframe === "M") return time.slice(0, 7);
  if (timeframe === "W") {
    const d = new Date(`${time}T00:00:00Z`);
    const day = d.getUTCDay();
    d.setUTCDate(d.getUTCDate() - ((day + 6) % 7));
    return d.toISOString().slice(0, 10);
  }
  return time;
}

function aggregateCandles(candles: Candle[], timeframe: ChartTimeframe): Candle[] {
  if (timeframe === "D") return candles;
  const grouped = new Map<string, Candle>();
  for (const candle of candles) {
    const key = candleBucketKey(candle.time, timeframe);
    const current = grouped.get(key);
    if (!current) {
      grouped.set(key, { ...candle });
      continue;
    }
    current.high = Math.max(current.high, candle.high);
    current.low = Math.min(current.low, candle.low);
    current.close = candle.close;
    current.time = candle.time;
    current.volume = (current.volume ?? 0) + (candle.volume ?? 0);
  }
  return [...grouped.values()];
}

function markerTimeMap(candles: Candle[], timeframe: ChartTimeframe) {
  const bucketCloseTime = new Map<string, string>();
  for (const candle of candles) {
    bucketCloseTime.set(candleBucketKey(candle.time, timeframe), candle.time);
  }
  const mapped = new Map<string, string>();
  for (const candle of candles) {
    const closeTime = bucketCloseTime.get(candleBucketKey(candle.time, timeframe));
    if (closeTime) mapped.set(candle.time, closeTime);
  }
  return mapped;
}

function filterByPeriod(candles: Candle[], period: ChartPeriod) {
  if (candles.length === 0) return [];
  const setting = PERIODS.find((p) => p.key === period) ?? PERIODS[4];
  const last = candles[candles.length - 1].time;
  if (setting.months === 0) return candles;
  if (setting.months === -1) return candles.filter((c) => c.time >= `${last.slice(0, 4)}-01-01`);
  const cutoff = new Date(last);
  cutoff.setMonth(cutoff.getMonth() - setting.months);
  return candles.filter((c) => c.time >= cutoff.toISOString().slice(0, 10));
}

function ChartsInner() {
  const urlTicker = useSearchParams().get("ticker");
  const { transactions, hydrated } = useStore();
  const portfolio = useMemo(
    () => buildPortfolio(transactions),
    [transactions],
  );

  const tickers = useMemo(
    () => Array.from(new Set(transactions.map((t) => t.ticker))).sort(),
    [transactions],
  );
  const [tickerOverride, setTickerOverride] = useState<string | null>(null);
  const [period, setPeriod] = useState<ChartPeriod>("1Y");
  const [timeframe, setTimeframe] = useState<ChartTimeframe>("D");
  const [indicators, setIndicators] = useState<ChartIndicators>(DEFAULT_CHART_INDICATORS);
  const [visibleRange, setVisibleRange] = useState<ChartVisibleRange | null>(null);
  const [drawings, setDrawings] = useState<ChartDrawing[]>([]);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadedTickerRef = useRef<string | null>(null);
  const chartStateRef = useRef<{
    ticker: string;
    period: ChartPeriod;
    timeframe: ChartTimeframe;
    indicators: ChartIndicators;
    visibleRange: ChartVisibleRange | null;
    drawings: ChartDrawing[];
    ready: boolean;
  }>({
    ticker: "",
    period: "1Y",
    timeframe: "D",
    indicators: DEFAULT_CHART_INDICATORS,
    visibleRange: null,
    drawings: [],
    ready: false,
  });

  const ticker = tickerOverride ?? urlTicker?.toUpperCase() ?? tickers[0] ?? "";

  const tickerOptions = useMemo(
    () => Array.from(new Set([...tickers, ticker].filter(Boolean))).sort(),
    [tickers, ticker],
  );

  useEffect(() => {
    if (!hydrated || !ticker) return;
    queueMicrotask(() => {
      const saved = getChartState(ticker);
      setPeriod(saved?.period ?? "1Y");
      setTimeframe(saved?.timeframe ?? "D");
      setIndicators(saved?.indicators ?? DEFAULT_CHART_INDICATORS);
      setVisibleRange(saved?.visibleRange ?? null);
      setDrawings(saved?.drawings ?? []);
      loadedTickerRef.current = ticker;
    });
  }, [hydrated, ticker]);

  useEffect(() => {
    const ready = hydrated && Boolean(ticker) && loadedTickerRef.current === ticker;
    chartStateRef.current = { ticker, period, timeframe, indicators, visibleRange, drawings, ready };
    if (!ready) return;
    const timer = window.setTimeout(() => {
      saveChartState(ticker, { period, timeframe, indicators, visibleRange, drawings });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [drawings, hydrated, indicators, period, ticker, timeframe, visibleRange]);

  useEffect(() => {
    const flushChartState = () => {
      const state = chartStateRef.current;
      if (!state.ready) return;
      saveChartState(state.ticker, {
        period: state.period,
        timeframe: state.timeframe,
        indicators: state.indicators,
        visibleRange: state.visibleRange,
        drawings: state.drawings,
      });
    };
    window.addEventListener("pagehide", flushChartState);
    return () => {
      flushChartState();
      window.removeEventListener("pagehide", flushChartState);
    };
  }, []);

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
    const range = period === "ALL" ? "max" : "5y";
    queueMicrotask(() => {
      if (!cancelled) {
        setLoading(true);
        setError(null);
      }
    });
    fetch(`/api/prices?ticker=${encodeURIComponent(ticker)}&range=${range}`)
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
  }, [period, ticker]);

  const dailyVisible = useMemo(
    () => filterByPeriod(candles, period),
    [candles, period],
  );

  const visible = useMemo(
    () => aggregateCandles(dailyVisible, timeframe),
    [dailyVisible, timeframe],
  );

  const markerTimes = useMemo(
    () => markerTimeMap(dailyVisible, timeframe),
    [dailyVisible, timeframe],
  );

  const tradesForTicker = useMemo(
    () => transactions.filter((t) => t.ticker === ticker),
    [transactions, ticker],
  );

  const markers: TradeMarker[] = useMemo(
    () =>
      tradesForTicker.flatMap((t) => {
        const tradeDay = isoToNyDate(t.executedAt);
        const time = markerTimes.get(tradeDay);
        if (!time) return [];
        return [{
          time,
          side: t.side,
          text: `${t.side === "buy" ? "ซื้อ" : "ขาย"} ${fmtQty(t.qty)}`,
        }];
      }),
    [markerTimes, tradesForTicker],
  );

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

  const heldQtyNum = Number(heldQty.toString());
  const marketValue = lastClose != null ? heldQtyNum * lastClose : null;
  const costValue = avgCost != null ? heldQtyNum * avgCost : null;
  const unrealized =
    marketValue != null && costValue != null ? marketValue - costValue : null;
  const unrealizedPct =
    unrealized != null && costValue ? (unrealized / costValue) * 100 : null;
  const handleVisibleRangeChange = useCallback((range: ChartVisibleRange | null) => {
    setVisibleRange(range);
  }, [setVisibleRange]);

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
        <Segmented label="Period">
          {PERIODS.map((p) => (
            <SegmentButton
              key={p.key}
              active={period === p.key}
              onClick={() => {
                setVisibleRange(null);
                setPeriod(p.key);
              }}
            >
              {p.key}
            </SegmentButton>
          ))}
        </Segmented>
        <Segmented label="Timeframe">
          {TIMEFRAMES.map((tf) => (
            <SegmentButton
              key={tf.key}
              active={timeframe === tf.key}
              onClick={() => {
                setVisibleRange(null);
                setTimeframe(tf.key);
              }}
            >
              {tf.label}
            </SegmentButton>
          ))}
        </Segmented>
        <Segmented label="Indicators">
          <SegmentButton
            active={indicators.volume}
            onClick={() => setIndicators((value) => ({ ...value, volume: !value.volume }))}
          >
            VOL
          </SegmentButton>
          <SegmentButton
            active={indicators.ma20}
            onClick={() => setIndicators((value) => ({ ...value, ma20: !value.ma20 }))}
          >
            MA20
          </SegmentButton>
          <SegmentButton
            active={indicators.ma50}
            onClick={() => setIndicators((value) => ({ ...value, ma50: !value.ma50 }))}
          >
            MA50
          </SegmentButton>
          <SegmentButton
            active={indicators.ma200}
            onClick={() => setIndicators((value) => ({ ...value, ma200: !value.ma200 }))}
          >
            MA200
          </SegmentButton>
        </Segmented>
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
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-200">
            {ticker} · ราคาจริง ({timeframe})
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
          <ChartView
            candles={visible}
            markers={markers}
            avgCost={avgCost}
            drawings={drawings}
            indicators={indicators}
            visibleRange={visibleRange}
            onDrawingsChange={setDrawings}
            onVisibleRangeChange={handleVisibleRangeChange}
            height={420}
            drawingKey={`${ticker}:${period}:${timeframe}`}
          />
        )}
      </Card>
    </div>
  );
}

function Segmented({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-slate-500">{label}</span>
      <div className="flex items-center gap-1 rounded-md border border-slate-800 p-0.5">
        {children}
      </div>
    </div>
  );
}

function SegmentButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
        active
          ? "bg-slate-800 text-slate-100"
          : "text-slate-400 hover:text-slate-200"
      }`}
    >
      {children}
    </button>
  );
}

function Header() {
  const { t } = useT();
  return (
    <header>
      <h1 className="text-lg font-semibold text-slate-100">{t("charts.title")}</h1>
      <p className="mt-1 text-sm text-slate-500">
        ราคาจริงจาก Yahoo Finance พร้อมจุดซื้อ/ขาย ต้นทุนเฉลี่ย และเครื่องมือวาดที่บันทึกไว้ต่อหุ้น
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
