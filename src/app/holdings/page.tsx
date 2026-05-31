"use client";

import { useMemo } from "react";
import { useStore } from "@/lib/store/hooks";
import { useT } from "@/lib/i18n/context";
import { buildPortfolio } from "@/lib/portfolio/portfolio";
import { useLastPrices } from "@/lib/prices/use-prices";
import { Card, EmptyState, StatCard } from "@/components/ui";
import { TickerLink } from "@/components/ticker-link";
import { Decimal, ZERO } from "@/lib/money/decimal";
import { fmtUsd, fmtSignedUsd, fmtQty, fmtPrice, gainTone } from "@/lib/format";

export default function HoldingsPage() {
  const { accounts, transactions, hydrated } = useStore();
  const portfolio = useMemo(
    () => buildPortfolio(accounts, transactions),
    [accounts, transactions],
  );
  const { t } = useT();
  const broker = (id: string) => accounts.find((a) => a.id === id)?.broker ?? id;
  const { prices } = useLastPrices(portfolio.holdings.map((h) => h.ticker));

  const totals = useMemo(() => {
    let mv = ZERO;
    let pc = ZERO;
    for (const h of portfolio.holdings) {
      const px = prices[h.ticker];
      if (px != null && Number.isFinite(px)) {
        mv = mv.plus(h.qty.times(px));
        pc = pc.plus(h.costValue);
      }
    }
    return { marketValue: mv, unrealized: mv.minus(pc), hasPrices: pc.gt(0) };
  }, [portfolio.holdings, prices]);

  if (!hydrated) return <Card className="h-48 animate-pulse" />;

  const toneClass = (v: Decimal) =>
    gainTone(v) === "positive" ? "text-emerald-400" : gainTone(v) === "negative" ? "text-rose-400" : "text-slate-400";

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-lg font-semibold text-slate-100">{t("holdings.title")}</h1>
        <p className="mt-1 text-sm text-slate-500">สถานะคงเหลือต่อบัญชี/หุ้น พร้อมต้นทุนเฉลี่ย (FIFO) และราคาตลาดจริง</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="ต้นทุนรวมที่ถือ" value={fmtUsd(portfolio.totalOpenCost)} />
        <StatCard label="มูลค่าตลาด" value={totals.hasPrices ? fmtUsd(totals.marketValue) : "—"} />
        <StatCard label="กำไรที่ยังไม่เกิด" value={totals.hasPrices ? fmtSignedUsd(totals.unrealized) : "—"} tone={totals.hasPrices ? gainTone(totals.unrealized) : "default"} />
        <StatCard label="กำไร realized" value={fmtSignedUsd(portfolio.totalRealizedGain)} tone={gainTone(portfolio.totalRealizedGain)} />
      </div>

      {portfolio.holdings.length === 0 ? (
        <EmptyState title="ยังไม่มีสถานะถือครอง" description="เมื่อมีรายการซื้อที่ยังไม่ถูกขายหมด จะแสดงที่นี่" />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-4 py-3 font-medium">หุ้น</th>
                <th className="px-4 py-3 font-medium">บัญชี</th>
                <th className="px-4 py-3 text-right font-medium">คงเหลือ</th>
                <th className="px-4 py-3 text-right font-medium">ต้นทุน/หุ้น</th>
                <th className="px-4 py-3 text-right font-medium">ราคาตลาด</th>
                <th className="px-4 py-3 text-right font-medium">มูลค่าตลาด</th>
                <th className="px-4 py-3 text-right font-medium">ยังไม่เกิด (P/L)</th>
                <th className="px-4 py-3 text-right font-medium">realized</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {portfolio.holdings.map((h) => {
                const px = prices[h.ticker];
                const hasPx = px != null && Number.isFinite(px);
                const mv = hasPx ? h.qty.times(px) : null;
                const upl = mv ? mv.minus(h.costValue) : null;
                return (
                  <tr key={`${h.accountId}-${h.ticker}`} className="hover:bg-slate-800/30">
                    <td className="px-4 py-3 font-medium text-slate-100">
                      <TickerLink ticker={h.ticker} />
                    </td>
                    <td className="px-4 py-3 text-slate-400">{broker(h.accountId)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-200">{fmtQty(h.qty)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-200">{fmtPrice(h.avgCost)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-300">{hasPx ? fmtPrice(px) : "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-200">{mv ? fmtUsd(mv) : "—"}</td>
                    <td className={`px-4 py-3 text-right tabular-nums ${upl ? toneClass(upl) : "text-slate-500"}`}>
                      {upl ? fmtSignedUsd(upl) : "—"}
                    </td>
                    <td className={`px-4 py-3 text-right tabular-nums ${toneClass(h.realizedGain)}`}>
                      {h.realizedGain.isZero() ? "—" : fmtSignedUsd(h.realizedGain)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
