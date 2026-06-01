"use client";

import Link from "next/link";
import { Fragment, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, ExternalLink, Pencil, Check } from "lucide-react";
import { Card, EmptyState, StatCard } from "@/components/ui";
import { StockLogo } from "@/components/stock-logo";
import { TickerLink } from "@/components/ticker-link";
import { useT } from "@/lib/i18n/context";
import { fmtPrice, fmtQty, fmtSignedUsd, fmtUsd, gainTone, fmtDateTimeBangkok } from "@/lib/format";
import { Decimal, D, ZERO } from "@/lib/money/decimal";
import { buildPortfolio } from "@/lib/portfolio/portfolio";
import { useLastPrices } from "@/lib/prices/use-prices";
import { useStore } from "@/lib/store/hooks";
import { setCashBalance } from "@/lib/store/local-store";

const BROKER_LABELS: Record<string, string> = { webull: "Webull", dime: "Dime" };

function fmtPct(n: number | null) {
  if (n == null || !Number.isFinite(n)) return "—";
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

function MarketBadge({ state }: { state: string | null }) {
  if (!state || state === "REGULAR") return null;
  const map: Record<string, string> = {
    PRE: "bg-amber-900/60 text-amber-300",
    POST: "bg-sky-900/60 text-sky-300",
    CLOSED: "bg-slate-700 text-slate-400",
  };
  return (
    <span className={`ml-1 rounded px-1 py-0.5 text-[10px] font-semibold ${map[state] ?? "bg-slate-700 text-slate-400"}`}>
      {state}
    </span>
  );
}

function CashRow({ brokerId, label, current }: { brokerId: string; label: string; current: string }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(current || "0");
  const inputRef = useRef<HTMLInputElement>(null);

  function save() {
    const n = parseFloat(val);
    if (!isNaN(n) && n >= 0) setCashBalance(brokerId, String(n));
    setEditing(false);
  }

  return (
    <tr className="bg-slate-900/40">
      <td className="px-2 py-2" />
      <td className="px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-700 text-xs font-bold text-slate-300">
            $
          </span>
          <span className="text-sm text-slate-400">เงินสด — {label}</span>
        </div>
      </td>
      <td className="px-4 py-2 text-xs text-slate-600">—</td>
      <td colSpan={9} className="px-4 py-2" />
      <td className="px-4 py-2">
        <div className="flex items-center justify-end gap-1">
          {editing ? (
            <>
              <span className="text-xs text-slate-500">$</span>
              <input
                ref={inputRef}
                type="number"
                min="0"
                step="0.01"
                value={val}
                onChange={(e) => setVal(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
                className="w-28 rounded border border-slate-600 bg-slate-800 px-2 py-0.5 text-right text-sm tabular-nums text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                autoFocus
              />
              <button onClick={save} className="rounded p-1 text-emerald-400 hover:bg-slate-700">
                <Check className="h-4 w-4" />
              </button>
            </>
          ) : (
            <>
              <span className="text-sm tabular-nums text-slate-300">
                {fmtUsd(D(current || "0"))}
              </span>
              <button
                onClick={() => { setVal(current || "0"); setEditing(true); }}
                className="rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-300"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}

export default function HoldingsPage() {
  const { transactions, cashBalances, hydrated } = useStore();
  const portfolio = useMemo(() => buildPortfolio(transactions), [transactions]);
  const { t } = useT();
  const { prices, quotes } = useLastPrices(portfolio.holdings.map((h) => h.ticker));
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Per-holding computed values
  const holdingData = useMemo(() => {
    let totalMV = ZERO;
    const rows = portfolio.holdings.map((holding) => {
      const px = prices[holding.ticker];
      const quote = quotes[holding.ticker];
      const hasPx = px != null && Number.isFinite(px);
      const mv = hasPx ? holding.qty.times(px) : null;
      const upl = mv ? mv.minus(holding.costValue) : null;
      if (mv) totalMV = totalMV.plus(mv);
      const changePct =
        quote?.last != null && quote?.previousClose != null && quote.previousClose !== 0
          ? ((quote.last - quote.previousClose) / quote.previousClose) * 100
          : null;
      const uplPct =
        upl && holding.costValue.gt(0) ? upl.toNumber() / holding.costValue.toNumber() * 100 : null;
      return { holding, quote, hasPx, mv, upl, changePct, uplPct };
    });
    return { rows, totalMV };
  }, [portfolio.holdings, prices, quotes]);

  // Total cash across all brokers
  const totalCashUsd = useMemo(() => {
    return Object.values(cashBalances).reduce(
      (sum, b) => sum.plus(D(b.amountUsd)),
      ZERO,
    );
  }, [cashBalances]);

  // Summary totals (stocks + cash)
  const totals = useMemo(() => {
    let cost = ZERO;
    for (const { holding, hasPx } of holdingData.rows) {
      if (hasPx) cost = cost.plus(holding.costValue);
    }
    const stockMV = holdingData.totalMV;
    const totalMV = stockMV.plus(totalCashUsd);
    const unrealized = stockMV.minus(cost);
    const uplPct = cost.gt(0) ? unrealized.toNumber() / cost.toNumber() * 100 : null;
    return { mv: totalMV, stockMV, cost, unrealized, uplPct, hasPrices: cost.gt(0) };
  }, [holdingData, totalCashUsd]);

  if (!hydrated) return <Card className="h-48 animate-pulse" />;

  function toggleRow(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  const toneClass = (v: Decimal | number | null) => {
    if (v == null) return "text-slate-500";
    const n = typeof v === "number" ? v : v.toNumber();
    return n > 0 ? "text-emerald-400" : n < 0 ? "text-rose-400" : "text-slate-400";
  };

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-lg font-semibold text-slate-100">{t("holdings.title")}</h1>
        <p className="mt-1 text-sm text-slate-500">
          สถานะถือครองพร้อมต้นทุน FIFO, ราคาตลาด และ lot breakdown
        </p>
      </header>

      {/* Summary stats — featured card + 2×2 grid */}
      <div className="grid gap-3 grid-cols-1 lg:grid-cols-[2fr_1fr_1fr]">
        {/* Featured: total portfolio value */}
        <div className="flex flex-col justify-center rounded-lg border border-slate-700/60 bg-gradient-to-br from-slate-800/80 to-slate-900/80 p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-widest text-slate-500">มูลค่ารวม (หุ้น+เงินสด)</p>
          <p className="mt-3 text-4xl font-bold tabular-nums tracking-tight text-slate-100">
            {totals.hasPrices ? fmtUsd(totals.mv) : "—"}
          </p>
          {totals.hasPrices && !totalCashUsd.isZero() && (
            <p className="mt-2 text-sm text-slate-500">
              หุ้น {fmtUsd(totals.stockMV)} · เงินสด {fmtUsd(totalCashUsd)}
            </p>
          )}
        </div>

        {/* Right col 1 */}
        <div className="flex flex-col gap-3">
          <StatCard
            className="flex-1"
            label="ยังไม่เกิด (P/L)"
            value={totals.hasPrices ? fmtSignedUsd(totals.unrealized) : "—"}
            tone={totals.hasPrices ? gainTone(totals.unrealized) : "default"}
            hint={totals.uplPct != null ? fmtPct(totals.uplPct) : undefined}
            hintTone={totals.uplPct != null ? (totals.uplPct > 0 ? "positive" : totals.uplPct < 0 ? "negative" : undefined) : undefined}
          />
          <StatCard
            className="flex-1"
            label="กำไร Realized"
            value={fmtSignedUsd(portfolio.totalRealizedGain)}
            tone={gainTone(portfolio.totalRealizedGain)}
            hint="FIFO ทุกรายการ"
          />
        </div>

        {/* Right col 2 */}
        <div className="flex flex-col gap-3">
          <StatCard
            className="flex-1"
            label="ต้นทุนรวมที่ถือ"
            value={fmtUsd(portfolio.totalOpenCost)}
            hint="FIFO ต้นทุนเฉลี่ย"
          />
          <StatCard
            className="flex-1"
            label="เงินสดรวม"
            value={fmtUsd(totalCashUsd)}
            hint="Webull + Dime"
          />
        </div>
      </div>

      {portfolio.holdings.length === 0 ? (
        <EmptyState
          title="ยังไม่มีสถานะถือครอง"
          description="เมื่อมีรายการซื้อที่ยังไม่ถูกขายหมด จะแสดงที่นี่"
        />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[1100px] text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="w-8 px-2 py-3" />
                <th className="px-4 py-3 font-medium">หุ้น</th>
                <th className="px-4 py-3 font-medium">โบรก</th>
                <th className="px-4 py-3 text-right font-medium">คงเหลือ</th>
                <th className="px-4 py-3 text-right font-medium">ต้นทุน/หุ้น</th>
                <th className="px-4 py-3 text-right font-medium">ต้นทุนรวม</th>
                <th className="px-4 py-3 text-right font-medium">Last</th>
                <th className="px-4 py-3 text-right font-medium">% วันนี้</th>
                <th className="px-4 py-3 text-right font-medium">มูลค่าตลาด</th>
                <th className="px-4 py-3 text-right font-medium">ยังไม่เกิด</th>
                <th className="px-4 py-3 text-right font-medium">% ผลตอบ</th>
                <th className="px-4 py-3 text-right font-medium">สัดส่วน</th>
                <th className="px-4 py-3 text-right font-medium">realized</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {holdingData.rows.map(({ holding, quote, hasPx, mv, upl, changePct, uplPct }) => {
                const key = `${holding.brokerId}-${holding.ticker}`;
                const isExpanded = expanded.has(key);
                const weightPct =
                  mv && holdingData.totalMV.gt(0)
                    ? (mv.toNumber() / holdingData.totalMV.toNumber()) * 100
                    : null;

                return (
                  <Fragment key={key}>
                    <tr
                      className="cursor-pointer hover:bg-slate-800/40"
                      onClick={() => toggleRow(key)}
                    >
                      {/* expand chevron */}
                      <td className="px-2 py-3 text-slate-500">
                        {isExpanded
                          ? <ChevronDown className="h-4 w-4" />
                          : <ChevronRight className="h-4 w-4" />}
                      </td>

                      {/* ticker + logo + market state */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <StockLogo ticker={holding.ticker} size={28} />
                          <div className="flex items-center gap-1">
                            <span className="font-semibold text-slate-100">
                              <TickerLink ticker={holding.ticker} />
                            </span>
                            <MarketBadge state={quote?.marketState ?? null} />
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3 text-xs text-slate-500">
                        {BROKER_LABELS[holding.brokerId] ?? holding.brokerId}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-200">
                        {fmtQty(holding.qty)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-400">
                        {fmtPrice(holding.avgCost)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-300">
                        {fmtUsd(holding.costValue)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-200">
                        {quote?.last != null ? fmtPrice(quote.last) : "—"}
                      </td>
                      <td className={`px-4 py-3 text-right tabular-nums ${toneClass(changePct)}`}>
                        {fmtPct(changePct)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-200">
                        {mv ? fmtUsd(mv) : "—"}
                      </td>
                      <td className={`px-4 py-3 text-right tabular-nums ${upl ? toneClass(upl) : "text-slate-500"}`}>
                        {upl ? fmtSignedUsd(upl) : "—"}
                      </td>
                      <td className={`px-4 py-3 text-right tabular-nums ${toneClass(uplPct)}`}>
                        {fmtPct(uplPct)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-400">
                        {weightPct != null ? `${weightPct.toFixed(1)}%` : "—"}
                      </td>
                      <td className={`px-4 py-3 text-right tabular-nums ${toneClass(holding.realizedGain)}`}>
                        {holding.realizedGain.isZero() ? "—" : fmtSignedUsd(holding.realizedGain)}
                      </td>
                    </tr>

                    {/* Expanded row */}
                    {isExpanded && (
                      <tr key={`${key}-expanded`} className="bg-slate-900/60">
                        <td colSpan={13} className="px-6 py-4">
                          <div className="space-y-3">
                            {/* Bid / Ask */}
                            {(quote?.bid != null || quote?.ask != null) && (
                              <div className="flex gap-6 text-xs text-slate-400">
                                <span>
                                  Bid:{" "}
                                  <span className="text-slate-200">
                                    {quote.bid != null ? fmtPrice(quote.bid) : "—"}
                                    {quote.bidSize != null ? ` × ${quote.bidSize}` : ""}
                                  </span>
                                </span>
                                <span>
                                  Ask:{" "}
                                  <span className="text-slate-200">
                                    {quote.ask != null ? fmtPrice(quote.ask) : "—"}
                                    {quote.askSize != null ? ` × ${quote.askSize}` : ""}
                                  </span>
                                </span>
                                {quote.previousClose != null && (
                                  <span>
                                    Prev close:{" "}
                                    <span className="text-slate-200">{fmtPrice(quote.previousClose)}</span>
                                  </span>
                                )}
                              </div>
                            )}

                            {/* Lots table */}
                            <div>
                              <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
                                FIFO Lots
                              </p>
                              <table className="w-full max-w-2xl text-xs">
                                <thead>
                                  <tr className="text-left text-slate-500">
                                    <th className="pb-1 pr-4 font-medium">วันที่ซื้อ</th>
                                    <th className="pb-1 pr-4 text-right font-medium">Qty คงเหลือ</th>
                                    <th className="pb-1 pr-4 text-right font-medium">ต้นทุน/หุ้น</th>
                                    <th className="pb-1 pr-4 text-right font-medium">ราคาตลาด</th>
                                    <th className="pb-1 text-right font-medium">P/L ต่อ lot</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800/60">
                                  {holding.lots.map((lot) => {
                                    const lotMV = hasPx && prices[holding.ticker] != null
                                      ? lot.qtyRemaining.times(prices[holding.ticker]!)
                                      : null;
                                    const lotCost = lot.qtyRemaining.times(lot.costPerShare);
                                    const lotUpl = lotMV ? lotMV.minus(lotCost) : null;
                                    return (
                                      <tr key={lot.sourceTransactionId}>
                                        <td className="py-1 pr-4 text-slate-400">
                                          {fmtDateTimeBangkok(lot.openedAt)}
                                        </td>
                                        <td className="py-1 pr-4 text-right tabular-nums text-slate-200">
                                          {fmtQty(lot.qtyRemaining)}
                                        </td>
                                        <td className="py-1 pr-4 text-right tabular-nums text-slate-300">
                                          {fmtPrice(lot.costPerShare)}
                                        </td>
                                        <td className="py-1 pr-4 text-right tabular-nums text-slate-300">
                                          {lotMV ? fmtUsd(lotMV) : "—"}
                                        </td>
                                        <td className={`py-1 text-right tabular-nums ${lotUpl ? toneClass(lotUpl) : "text-slate-500"}`}>
                                          {lotUpl ? fmtSignedUsd(lotUpl) : "—"}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>

                            {/* Link to transactions */}
                            <Link
                              href="/transactions"
                              className="inline-flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300"
                              onClick={(e) => e.stopPropagation()}
                            >
                              ดูประวัติ transactions ทั้งหมด
                              <ExternalLink className="h-3 w-3" />
                            </Link>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {/* Cash balance rows — one per broker */}
              {(["webull", "dime"] as const).map((brokerId) => (
                <CashRow
                  key={brokerId}
                  brokerId={brokerId}
                  label={BROKER_LABELS[brokerId]}
                  current={cashBalances[brokerId]?.amountUsd ?? "0"}
                />
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* FIFO errors */}
      {portfolio.errors.length > 0 && (
        <Card className="border-rose-900/50 bg-rose-950/20 p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-rose-400">
            ข้อผิดพลาดในการคำนวณ
          </p>
          <ul className="space-y-1 text-xs text-rose-300">
            {portfolio.errors.map((e) => (
              <li key={`${e.brokerId}-${e.ticker}`}>
                {e.ticker} ({BROKER_LABELS[e.brokerId] ?? e.brokerId}): {e.message}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
