"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Database, Plus } from "lucide-react";
import { useStore } from "@/lib/store/hooks";
import { useT } from "@/lib/i18n/context";
import { buildPortfolio, extractSaleEvents, normalizeStored } from "@/lib/portfolio/portfolio";
import { computeTax } from "@/lib/tax/engine";
import { toTaxableInputs } from "@/lib/tax/remittance";
import { winRate, maxDrawdown, xirr, monthlyRealized, allocation } from "@/lib/metrics/metrics";
import { useLastPrices } from "@/lib/prices/use-prices";
import { seedSampleData } from "@/lib/sample-data";
import { MetricsSection } from "@/components/metrics-section";
import { TickerLink } from "@/components/ticker-link";
import { Badge, Button, Card, EmptyState, StatCard } from "@/components/ui";
import { D, ZERO } from "@/lib/money/decimal";
import { fmtUsd, fmtSignedUsd, fmtThb, fmtQty, fmtPrice, fmtDateTimeBangkok, gainTone } from "@/lib/format";

export default function DashboardPage() {
  const { transactions, remittances, taxSettings, incomeByYear, hydrated } = useStore();
  const { t } = useT();

  const portfolio = useMemo(
    () => buildPortfolio(transactions),
    [transactions],
  );
  const saleEvents = useMemo(() => extractSaleEvents(transactions), [transactions]);
  const heldTickers = useMemo(
    () => portfolio.holdings.map((h) => h.ticker),
    [portfolio.holdings],
  );
  const { prices } = useLastPrices(heldTickers);

  // market value + unrealized over the holdings we have a price for
  const { marketValue, pricedCost } = useMemo(() => {
    let mv = ZERO;
    let pc = ZERO;
    for (const h of portfolio.holdings) {
      const px = prices[h.ticker];
      if (px != null && Number.isFinite(px)) {
        mv = mv.plus(h.qty.times(px));
        pc = pc.plus(h.costValue);
      }
    }
    return { marketValue: mv, pricedCost: pc };
  }, [portfolio.holdings, prices]);

  const unrealized = marketValue.minus(pricedCost);
  const unrealizedPct = pricedCost.gt(0) ? unrealized.div(pricedCost).times(100) : ZERO;

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
      const previous = acc.length ? acc[acc.length - 1] : 0;
      return [...acc, previous + m.gain];
    }, []);
    const alloc = allocation(
      portfolio.holdings.map((h) => ({ key: h.ticker, value: Number(h.costValue.toString()) })),
    );
    const flows = transactions.map((t) => {
      const n = normalizeStored(t);
      const net = Number(n.net.toString());
      return { date: t.executedAt.slice(0, 10), amount: t.side === "buy" ? -net : net };
    });
    if (marketValue.gt(0)) {
      flows.push({ date: new Date().toISOString().slice(0, 10), amount: Number(marketValue.toString()) });
    }
    const r = xirr(flows);
    return {
      winRatePct: winRate(gains) * 100,
      xirrText: r == null ? "—" : `${(r * 100).toFixed(1)}%`,
      maxDdPct: maxDrawdown(curve) * 100,
      allocation: alloc,
      monthly,
    };
  }, [saleEvents, portfolio.holdings, transactions, marketValue]);

  if (!hydrated) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="h-24 animate-pulse" />
        ))}
      </div>
    );
  }

  if (transactions.length === 0) {
    return (
      <div className="space-y-5">
        <PageHeader />
        <EmptyState
          title="ยังไม่มีรายการเทรด"
          description="เริ่มต้นด้วยการเพิ่มรายการจาก screenshot ของ Webull / Dime หรือโหลดข้อมูลตัวอย่างจากภาพจริงในบรีฟเพื่อดูการทำงาน"
          action={
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Link href="/transactions/new">
                <Button>
                  <Plus className="h-4 w-4" aria-hidden /> เพิ่มรายการแรก
                </Button>
              </Link>
              <Button variant="outline" onClick={() => seedSampleData()}>
                <Database className="h-4 w-4" aria-hidden /> โหลดข้อมูลตัวอย่าง
              </Button>
            </div>
          }
        />
      </div>
    );
  }

  const recent = [...transactions]
    .sort((a, b) => (a.executedAt < b.executedAt ? 1 : -1))
    .slice(0, 6);
  const BROKER_LABELS: Record<string, string> = { webull: "Webull Thailand", dime: "Dime! USD" };
  const brokerLabel = (id: string) => BROKER_LABELS[id] ?? id;
  const hasPrices = pricedCost.gt(0);

  return (
    <div className="space-y-5">
      <PageHeader />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t("dashboard.openCost")} value={fmtUsd(portfolio.totalOpenCost)} hint={`${portfolio.openPositions} ${t("nav.holdings")}`} />
        <StatCard label={t("dashboard.marketValue")} value={hasPrices ? fmtUsd(marketValue) : "—"} hint={hasPrices ? "Yahoo" : "…"} />
        <StatCard
          label={t("dashboard.unrealized")}
          value={hasPrices ? fmtSignedUsd(unrealized) : "—"}
          tone={hasPrices ? gainTone(unrealized) : "default"}
          hint={hasPrices ? `${unrealizedPct.toDecimalPlaces(2).toString()}%` : "unrealized P/L"}
        />
        <StatCard label={t("dashboard.realized")} value={fmtSignedUsd(portfolio.totalRealizedGain)} tone={gainTone(portfolio.totalRealizedGain)} hint="realized (FIFO)" />
      </div>

      {portfolio.errors.length > 0 ? (
        <Card className="border-rose-900/60 bg-rose-950/20">
          <p className="text-sm font-medium text-rose-300">พบรายการที่คำนวณไม่ได้</p>
          <ul className="mt-2 space-y-1 text-sm text-rose-200/80">
            {portfolio.errors.map((e, i) => (
              <li key={i}>{brokerLabel(e.brokerId)} · {e.ticker}: {e.message}</li>
            ))}
          </ul>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_380px] 2xl:grid-cols-[minmax(0,1fr)_420px] min-[2200px]:grid-cols-[minmax(0,1fr)_480px] min-[3200px]:grid-cols-[minmax(0,1fr)_520px]">
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-200">{t("dashboard.recent")}</h2>
            <Link href="/transactions" className="text-xs text-indigo-400 hover:text-indigo-300">{t("common.viewAll")}</Link>
          </div>
          <ul className="divide-y divide-slate-800">
            {recent.map((t) => {
              const n = normalizeStored(t);
              return (
                <li key={t.id} className="flex items-center gap-3 py-2.5">
                  <Badge tone={t.side}>{t.side === "buy" ? "ซื้อ" : "ขาย"}</Badge>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-100">
                      <TickerLink ticker={t.ticker} />
                      <span className="ml-2 text-xs font-normal text-slate-500">{brokerLabel(t.brokerId)}</span>
                    </p>
                    <p className="text-xs text-slate-500">{fmtDateTimeBangkok(t.executedAt)}</p>
                  </div>
                  <p className="ml-auto text-sm tabular-nums text-slate-200">{fmtUsd(n.net)}</p>
                </li>
              );
            })}
          </ul>
        </Card>

        <Card className="flex flex-col">
          <h2 className="text-sm font-semibold text-slate-200">{t("dashboard.taxEstimate")}</h2>
          <div className="mt-3 flex flex-1 flex-col items-start justify-center gap-1">
            <p className="text-2xl font-semibold text-slate-100">{fmtThb(taxTotal)}</p>
            <p className="text-xs text-slate-500">
              กำไรค้างรอโอน{" "}
              <span className="text-slate-300">{fmtUsd(portfolio.totalRealizedGain)}</span>
            </p>
            <Link href="/tax" className="mt-2 text-xs text-indigo-400 hover:text-indigo-300">
              ดูรายละเอียด + What-if →
            </Link>
          </div>
        </Card>
      </div>

      {portfolio.holdings.length > 0 ? (
        <Card className="overflow-x-auto p-0">
          <div className="flex items-center justify-between px-4 pt-4">
            <h2 className="text-sm font-semibold text-slate-200">ทรัพย์สินที่ถืออยู่</h2>
            <Link href="/holdings" className="text-xs text-indigo-400 hover:text-indigo-300">
              {t("common.viewAll")}
            </Link>
          </div>
          <table className="mt-2 w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-y border-slate-800 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-4 py-2.5 font-medium">หุ้น</th>
                <th className="px-4 py-2.5 font-medium">บัญชี</th>
                <th className="px-4 py-2.5 text-right font-medium">จำนวน</th>
                <th className="px-4 py-2.5 text-right font-medium">ต้นทุน/หุ้น</th>
                <th className="px-4 py-2.5 text-right font-medium">ราคาตลาด</th>
                <th className="px-4 py-2.5 text-right font-medium">มูลค่า</th>
                <th className="px-4 py-2.5 text-right font-medium">กำไร/ขาดทุน</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {portfolio.holdings.map((h) => {
                const px = prices[h.ticker];
                const hasPx = px != null && Number.isFinite(px);
                const mv = hasPx ? h.qty.times(px) : null;
                const upl = mv ? mv.minus(h.costValue) : null;
                const uplTone = upl ? gainTone(upl) : "default";
                return (
                  <tr key={`${h.brokerId}-${h.ticker}`} className="hover:bg-slate-800/30">
                    <td className="px-4 py-2.5 font-medium text-slate-100">
                      <TickerLink ticker={h.ticker} />
                    </td>
                    <td className="px-4 py-2.5 text-slate-400">{brokerLabel(h.brokerId)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-slate-200">{fmtQty(h.qty)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-slate-300">{fmtPrice(h.avgCost)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-slate-300">{hasPx ? fmtPrice(px) : "—"}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-slate-200">{mv ? fmtUsd(mv) : "—"}</td>
                    <td className={`px-4 py-2.5 text-right tabular-nums ${
                      uplTone === "positive" ? "text-emerald-400" : uplTone === "negative" ? "text-rose-400" : "text-slate-500"
                    }`}>
                      {upl ? fmtSignedUsd(upl) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      ) : null}

      {taxSettings?.showMetrics ? <MetricsSection data={metrics} /> : null}
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
        <Button>
          <Plus className="h-4 w-4" aria-hidden /> {t("nav.add")}
        </Button>
      </Link>
    </header>
  );
}
