"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Database, Plus, TrendingUp } from "lucide-react";
import { useStore } from "@/lib/store/hooks";
import { useT } from "@/lib/i18n/context";
import { buildPortfolio, extractSaleEvents, normalizeStored } from "@/lib/portfolio/portfolio";
import { computeTax } from "@/lib/tax/engine";
import { toTaxableInputs } from "@/lib/tax/remittance";
import { winRate, maxDrawdown, xirr, monthlyRealized, allocation } from "@/lib/metrics/metrics";
import { useLastPrices } from "@/lib/prices/use-prices";
import { useUsdThbRate } from "@/lib/prices/use-fx-rate";
import { seedSampleData } from "@/lib/sample-data";
import { MetricsSection } from "@/components/metrics-section";
import { StockLogo } from "@/components/stock-logo";
import { TickerLink } from "@/components/ticker-link";
import { Badge, Button, Card, EmptyState, Select, StatCard } from "@/components/ui";
import { D, ZERO } from "@/lib/money/decimal";
import { fmtUsd, fmtSignedUsd, fmtThb, fmtQty, fmtPrice, fmtDateTimeBangkok, gainTone } from "@/lib/format";

const BROKER_LABELS: Record<string, string> = { webull: "Webull", dime: "Dime" };

function fmtPct(n: number | null | undefined, decimals = 2) {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(decimals)}%`;
}

export default function DashboardPage() {
  const { transactions, remittances, taxSettings, incomeByYear, cashBalances, hydrated } = useStore();
  const { t } = useT();
  const [brokerFilter, setBrokerFilter] = useState("all");

  const filteredTransactions = useMemo(
    () => transactions.filter((tx) => brokerFilter === "all" || tx.brokerId === brokerFilter),
    [transactions, brokerFilter],
  );
  const portfolio = useMemo(() => buildPortfolio(filteredTransactions), [filteredTransactions]);
  const saleEvents = useMemo(() => extractSaleEvents(filteredTransactions), [filteredTransactions]);
  const heldTickers = useMemo(() => portfolio.holdings.map((h) => h.ticker), [portfolio.holdings]);
  const { prices, quotes } = useLastPrices(heldTickers);
  const { rate: fxRate, asOf: fxAsOf } = useUsdThbRate();

  const { marketValue, pricedCost, todayChangeUsd } = useMemo(() => {
    let mv = ZERO;
    let pc = ZERO;
    let todayChange = ZERO;
    for (const h of portfolio.holdings) {
      const px = prices[h.ticker];
      const q = quotes[h.ticker];
      if (px != null && Number.isFinite(px)) {
        mv = mv.plus(h.qty.times(px));
        pc = pc.plus(h.costValue);
      }
      if (q?.last != null && q?.previousClose != null) {
        todayChange = todayChange.plus(h.qty.times(q.last - q.previousClose));
      }
    }
    return { marketValue: mv, pricedCost: pc, todayChangeUsd: todayChange };
  }, [portfolio.holdings, prices, quotes]);

  const filteredCashBalances = useMemo(
    () => Object.values(cashBalances).filter((balance) => brokerFilter === "all" || balance.brokerId === brokerFilter),
    [cashBalances, brokerFilter],
  );
  const totalCashUsd = useMemo(
    () => filteredCashBalances.reduce((s, b) => s.plus(D(b.amountUsd)), ZERO),
    [filteredCashBalances],
  );

  const unrealized = marketValue.minus(pricedCost);
  const unrealizedPct = pricedCost.gt(0) ? unrealized.div(pricedCost).times(100).toNumber() : null;

  const taxTotal = useMemo(() => {
    if (!taxSettings) return ZERO;
    try {
      return computeTax({
        saleEvents,
        remittances: toTaxableInputs(remittances),
        otherIncomeThb: D(incomeByYear[taxSettings.taxYear] ?? "0"),
        personalAllowance: D(taxSettings.personalAllowance),
        method: taxSettings.apportionmentMethod,
        taxYear: taxSettings.taxYear,
      }).tax.total;
    } catch {
      return ZERO;
    }
  }, [saleEvents, remittances, incomeByYear, taxSettings]);

  const metrics = useMemo(() => {
    const gains = saleEvents.map((e) => Number(e.gainUsd.toString()));
    const monthly = monthlyRealized(
      saleEvents.map((e) => ({ date: e.date, gain: Number(e.gainUsd.toString()) })),
    );
    const curve = monthly.reduce<number[]>((acc, m) => {
      const prev = acc.length ? acc[acc.length - 1] : 0;
      return [...acc, prev + m.gain];
    }, []);
    const alloc = allocation(
      portfolio.holdings.map((h) => ({ key: h.ticker, value: Number(h.costValue.toString()) })),
    );
    const flows = filteredTransactions.map((tx) => {
      const n = normalizeStored(tx);
      const net = Number(n.net.toString());
      return { date: tx.executedAt.slice(0, 10), amount: tx.side === "buy" ? -net : net };
    });
    if (marketValue.gt(0)) {
      flows.push({ date: new Date().toISOString().slice(0, 10), amount: Number(marketValue.toString()) });
    }
    const r = xirr(flows);
    return {
      winRatePct: winRate(gains) * 100,
      xirrPct: r != null ? r * 100 : null,
      xirrText: r == null ? "—" : `${(r * 100).toFixed(1)}%`,
      maxDdPct: maxDrawdown(curve) * 100,
      allocation: alloc,
      monthly,
    };
  }, [saleEvents, portfolio.holdings, filteredTransactions, marketValue]);

  if (!hydrated) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <Card key={i} className="h-24 animate-pulse" />)}
      </div>
    );
  }

  if (transactions.length === 0) {
    return (
      <div className="space-y-5">
        <PageHeader />
        <EmptyState
          title="ยังไม่มีรายการเทรด"
          description="เริ่มต้นด้วยการเพิ่มรายการจาก screenshot ของ Webull / Dime หรือโหลดข้อมูลตัวอย่าง"
          action={
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Link href="/transactions/new"><Button><Plus className="h-4 w-4" aria-hidden /> เพิ่มรายการแรก</Button></Link>
              <Button variant="outline" onClick={() => seedSampleData()}><Database className="h-4 w-4" aria-hidden /> โหลดข้อมูลตัวอย่าง</Button>
            </div>
          }
        />
      </div>
    );
  }

  const recent = [...filteredTransactions].sort((a, b) => (a.executedAt < b.executedAt ? 1 : -1)).slice(0, 6);
  const hasPrices = pricedCost.gt(0);
  const latestQuoteTime = Object.values(quotes).map((q) => q.asOf).filter((v): v is string => Boolean(v)).sort().at(-1);
  const quoteSource = Object.values(quotes).map((q) => q.source).find(Boolean);
  const mvHint = hasPrices
    ? latestQuoteTime
      ? `${quoteSource?.startsWith("alpaca-") ? "Alpaca" : "Yahoo"} · ${fmtDateTimeBangkok(latestQuoteTime)}`
      : quoteSource?.startsWith("alpaca-") ? "Alpaca stream" : "Yahoo live"
    : "รอราคา...";

  const todayChangePct = hasPrices && pricedCost.gt(0) && !todayChangeUsd.isZero()
    ? todayChangeUsd.div(pricedCost).times(100).toNumber()
    : null;
  const todayTone = !todayChangeUsd.isZero() ? gainTone(todayChangeUsd) : "default";
  const todayColor = todayTone === "positive" ? "text-emerald-400" : todayTone === "negative" ? "text-rose-400" : "text-slate-400";

  return (
    <div className="space-y-6">
      <PageHeader />
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-slate-400">Account view</span>
        <div className="w-full sm:w-56">
          <Select value={brokerFilter} onChange={(e) => setBrokerFilter(e.target.value)} aria-label="Filter dashboard by broker">
            <option value="all">Webull + Dime</option>
            <option value="webull">Webull only</option>
            <option value="dime">Dime only</option>
          </Select>
        </div>
      </div>

      {/* ─── Portfolio hero banner ────────────────────────────────── */}
      {filteredTransactions.length === 0 ? (
        <EmptyState
          title="No transactions for this account"
          description="Try switching the account filter back to Webull + Dime, or add a transaction for this broker."
        />
      ) : (
        <>
      <div className="rounded-xl border border-slate-700/60 bg-gradient-to-br from-slate-800/80 to-slate-900/80 px-6 py-5">
        <div className="flex flex-wrap items-start justify-between gap-6">
          {/* Left: total value (stocks + cash) */}
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-slate-500">มูลค่าทรัพย์สินทั้งหมด</p>
            <p className="mt-1 text-3xl font-bold tracking-tight text-slate-100">
              {hasPrices && fxRate
                ? fmtThb(marketValue.plus(totalCashUsd).times(fxRate))
                : "—"}
            </p>
            <p className="mt-0.5 text-sm tabular-nums text-slate-400">
              {hasPrices ? fmtUsd(marketValue.plus(totalCashUsd)) : "—"}
            </p>
            {!totalCashUsd.isZero() && (
              <p className="mt-0.5 text-xs text-slate-600">
                หุ้น {hasPrices ? fmtUsd(marketValue) : "—"} · เงินสด {fmtUsd(totalCashUsd)}
              </p>
            )}
          </div>

          {/* Right: today's change + FX rate */}
          <div className="flex flex-wrap gap-8 text-right">
            <div>
              <p className="text-xs font-medium uppercase tracking-widest text-slate-500">วันนี้</p>
              <p className={`mt-1 text-xl font-semibold tabular-nums ${todayChangeUsd.isZero() ? "text-slate-400" : todayColor}`}>
                {todayChangeUsd.isZero() ? "—" : fmtSignedUsd(todayChangeUsd)}
              </p>
              <p className={`mt-0.5 text-sm tabular-nums ${todayChangePct == null ? "text-slate-500" : todayColor}`}>
                {todayChangePct != null ? fmtPct(todayChangePct) : ""}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-widest text-slate-500">USD / THB</p>
              <p className="mt-1 text-xl font-semibold tabular-nums text-slate-100">
                {fxRate ? `฿${fxRate.toFixed(2)}` : "—"}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                {fxAsOf ? fmtDateTimeBangkok(fxAsOf) : "Yahoo Finance"}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Summary stats ───────────────────────────────────────── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard
          label="ต้นทุนรวม (เปิดอยู่)"
          value={fmtUsd(portfolio.totalOpenCost)}
          hint="FIFO ต้นทุนเฉลี่ย"
        />
        <StatCard
          label="มูลค่าตลาด"
          value={hasPrices ? fmtUsd(marketValue) : "—"}
          hint={mvHint}
        />
        <StatCard
          label="กำไรยังไม่เกิด"
          value={hasPrices ? fmtSignedUsd(unrealized) : "—"}
          tone={hasPrices ? gainTone(unrealized) : "default"}
          hint={hasPrices && unrealizedPct != null ? fmtPct(unrealizedPct) : undefined}
        />
        <StatCard
          label="กำไร Realized"
          value={fmtSignedUsd(portfolio.totalRealizedGain)}
          tone={gainTone(portfolio.totalRealizedGain)}
          hint="FIFO ทุกรายการ"
        />
        <StatCard
          label="XIRR (ต่อปี)"
          value={metrics.xirrText}
          tone={metrics.xirrPct != null ? (metrics.xirrPct > 0 ? "positive" : metrics.xirrPct < 0 ? "negative" : "default") : "default"}
          hint="IRR รวม unrealized"
        />
        <StatCard
          label="ภาษีประมาณ (ปีนี้)"
          value={fmtThb(taxTotal)}
          hint={`Win rate ${metrics.winRatePct.toFixed(0)}%`}
        />
      </div>

      {/* ─── FIFO errors ─────────────────────────────────────────── */}
      {portfolio.errors.length > 0 && (
        <Card className="border-rose-900/60 bg-rose-950/20 p-3">
          <p className="text-sm font-medium text-rose-300">พบรายการที่คำนวณไม่ได้</p>
          <ul className="mt-1.5 space-y-0.5 text-xs text-rose-200/80">
            {portfolio.errors.map((e, i) => (
              <li key={i}>{BROKER_LABELS[e.brokerId] ?? e.brokerId} · {e.ticker}: {e.message}</li>
            ))}
          </ul>
        </Card>
      )}

      {/* ─── Main content grid ───────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px] xl:grid-cols-[minmax(0,1fr)_340px]">

        {/* Recent transactions */}
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-200">{t("dashboard.recent")}</h2>
            <Link href="/transactions" className="text-xs text-indigo-400 hover:text-indigo-300">{t("common.viewAll")}</Link>
          </div>
          <ul className="divide-y divide-slate-800/70">
            {recent.map((tx) => {
              const n = normalizeStored(tx);
              const px = prices[tx.ticker];
              const hasPx = px != null && Number.isFinite(px);
              const txPrice = parseFloat(tx.price);
              // P/L % from executed price → current market price
              const plPct = hasPx && txPrice > 0
                ? ((px! - txPrice) / txPrice) * 100
                : null;
              // For sells: flip sign (if price went up after selling, that's a missed gain — show negative)
              const displayPct = plPct != null && tx.side === "sell" ? -plPct : plPct;
              return (
                <li key={tx.id} className="flex items-center gap-3 py-2.5">
                  <StockLogo ticker={tx.ticker} size={28} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-100"><TickerLink ticker={tx.ticker} /></span>
                      <Badge tone={tx.side}>{tx.side === "buy" ? "ซื้อ" : "ขาย"}</Badge>
                      <span className="text-xs text-slate-500">{BROKER_LABELS[tx.brokerId] ?? tx.brokerId}</span>
                    </div>
                    <p className="text-xs text-slate-500">{fmtDateTimeBangkok(tx.executedAt)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm tabular-nums text-slate-200">{fmtUsd(n.net)}</p>
                    {displayPct != null && (
                      <p className={`text-xs tabular-nums ${displayPct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        {fmtPct(displayPct)}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>

        {/* Tax + performance sidebar */}
        <div className="flex flex-col gap-4">
          {/* Tax estimate */}
          <Card>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{t("dashboard.taxEstimate")}</p>
                <p className="mt-1 text-2xl font-bold text-slate-100">{fmtThb(taxTotal)}</p>
              </div>
              <TrendingUp className="h-5 w-5 text-slate-600" />
            </div>
            <div className="mt-3 space-y-1.5 border-t border-slate-800 pt-3 text-xs text-slate-500">
              <div className="flex justify-between">
                <span>Realized gain</span>
                <span className={portfolio.totalRealizedGain.gt(0) ? "text-emerald-400" : "text-rose-400"}>
                  {fmtSignedUsd(portfolio.totalRealizedGain)}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Win rate</span>
                <span className="text-slate-300">{metrics.winRatePct.toFixed(1)}%</span>
              </div>
              <div className="flex justify-between">
                <span>Max drawdown</span>
                <span className="text-rose-400">−{Math.abs(metrics.maxDdPct).toFixed(1)}%</span>
              </div>
            </div>
            <Link href="/tax" className="mt-3 block text-xs text-indigo-400 hover:text-indigo-300">
              ดูรายละเอียด + What-if →
            </Link>
          </Card>

          {/* Open positions quick view */}
          {portfolio.holdings.length > 0 && (
            <Card className="flex-1">
              <div className="mb-2.5 flex items-center justify-between">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Positions ที่ถือ</p>
                <Link href="/holdings" className="text-xs text-indigo-400 hover:text-indigo-300">ทั้งหมด →</Link>
              </div>
              <ul className="space-y-2">
                {portfolio.holdings.slice(0, 5).map((h) => {
                  const px = prices[h.ticker];
                  const quote = quotes[h.ticker];
                  const hasPx = px != null && Number.isFinite(px);
                  const mv = hasPx ? h.qty.times(px) : null;
                  const upl = mv ? mv.minus(h.costValue) : null;
                  const uplPct = upl && h.costValue.gt(0) ? upl.toNumber() / h.costValue.toNumber() * 100 : null;
                  const changePct = quote?.last != null && quote?.previousClose != null && quote.previousClose !== 0
                    ? ((quote.last - quote.previousClose) / quote.previousClose) * 100
                    : null;
                  return (
                    <li key={`${h.brokerId}-${h.ticker}`} className="flex items-center gap-2">
                      <StockLogo ticker={h.ticker} size={24} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-1">
                          <span className="text-sm font-medium text-slate-100"><TickerLink ticker={h.ticker} /></span>
                          <span className={`text-xs tabular-nums ${upl ? (upl.gt(0) ? "text-emerald-400" : "text-rose-400") : "text-slate-500"}`}>
                            {upl ? fmtSignedUsd(upl) : "—"}
                          </span>
                        </div>
                        <div className="flex items-baseline justify-between gap-1">
                          <span className="text-xs text-slate-500">{fmtQty(h.qty)} หุ้น</span>
                          <div className="flex gap-2">
                            {changePct != null && (
                              <span className={`text-xs tabular-nums ${changePct >= 0 ? "text-emerald-400/70" : "text-rose-400/70"}`}>
                                {fmtPct(changePct, 1)} today
                              </span>
                            )}
                            {uplPct != null && (
                              <span className={`text-xs tabular-nums ${uplPct >= 0 ? "text-emerald-400/70" : "text-rose-400/70"}`}>
                                {fmtPct(uplPct, 1)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
                {portfolio.holdings.length > 5 && (
                  <li className="pt-1 text-center text-xs text-slate-600">
                    +{portfolio.holdings.length - 5} positions อื่น
                  </li>
                )}
              </ul>
            </Card>
          )}
        </div>
      </div>

      {taxSettings?.showMetrics && <MetricsSection data={metrics} />}
        </>
      )}
    </div>
  );
}

function PageHeader() {
  const { t } = useT();
  return (
    <header className="flex items-end justify-between gap-2">
      <div>
        <h1 className="text-lg font-semibold text-slate-100">{t("dashboard.title")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("dashboard.subtitle")}</p>
      </div>
      <Link href="/transactions/new" className="shrink-0">
        <Button><Plus className="h-4 w-4" aria-hidden /> {t("nav.add")}</Button>
      </Link>
    </header>
  );
}
