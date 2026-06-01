"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Pencil, Trash2, Plus, Database } from "lucide-react";
import { useStore } from "@/lib/store/hooks";
import { useT } from "@/lib/i18n/context";
import { buildPortfolio, normalizeStored } from "@/lib/portfolio/portfolio";
import { deleteTransaction } from "@/lib/store/local-store";
import { getScreenshotUrl } from "@/lib/store/screenshots";
import { seedSampleData } from "@/lib/sample-data";
import { Badge, Button, Card, EmptyState, Select } from "@/components/ui";
import { TickerLink } from "@/components/ticker-link";
import { fmtUsd, fmtSignedUsd, fmtQty, fmtPrice, fmtDateTimeBangkok, gainTone } from "@/lib/format";

export default function TransactionsPage() {
  const { accounts, transactions, hydrated } = useStore();
  const { t } = useT();
  const [accountFilter, setAccountFilter] = useState("all");
  const [tickerFilter, setTickerFilter] = useState("all");

  const portfolio = useMemo(
    () => buildPortfolio(accounts, transactions),
    [accounts, transactions],
  );
  const broker = (id: string) => accounts.find((a) => a.id === id)?.broker ?? id;

  const tickers = useMemo(
    () => Array.from(new Set(transactions.map((t) => t.ticker))).sort(),
    [transactions],
  );

  const rows = useMemo(() => {
    return [...transactions]
      .filter((t) => accountFilter === "all" || t.accountId === accountFilter)
      .filter((t) => tickerFilter === "all" || t.ticker === tickerFilter)
      .sort((a, b) => (a.executedAt < b.executedAt ? 1 : -1));
  }, [transactions, accountFilter, tickerFilter]);

  if (!hydrated) return <Card className="h-48 animate-pulse" />;

  function onDelete(id: string, label: string) {
    if (window.confirm(`ลบรายการ ${label}? การลบจะคำนวณ FIFO ใหม่ทั้งหมด`)) {
      deleteTransaction(id);
    }
  }

  return (
    <div className="space-y-5">
      <header className="flex items-end justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-slate-100">{t("transactions.title")}</h1>
          <p className="mt-1 text-sm text-slate-500">
            แก้ไข/ลบได้ — ระบบจะคำนวณต้นทุนและกำไรใหม่อัตโนมัติ
          </p>
        </div>
        <Link href="/transactions/new" className="shrink-0">
          <Button>
            <Plus className="h-4 w-4" aria-hidden /> เพิ่มรายการ
          </Button>
        </Link>
      </header>

      {transactions.length === 0 ? (
        <EmptyState
          title="ยังไม่มีรายการเทรด"
          description="เพิ่มรายการ หรือโหลดข้อมูลตัวอย่างจากภาพจริงในบรีฟ"
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
      ) : (
        <>
          <div className="flex flex-wrap gap-3">
            <div className="w-44">
              <Select value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)}>
                <option value="all">ทุกบัญชี</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.broker}
                  </option>
                ))}
              </Select>
            </div>
            <div className="w-44">
              <Select value={tickerFilter} onChange={(e) => setTickerFilter(e.target.value)}>
                <option value="all">ทุกหุ้น</option>
                {tickers.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <Card className="overflow-x-auto p-0">
            <table className="w-full min-w-[840px] text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-3 font-medium">วันเวลา (ไทย)</th>
                  <th className="px-4 py-3 font-medium">บัญชี</th>
                  <th className="px-4 py-3 font-medium">หุ้น</th>
                  <th className="px-4 py-3 font-medium">ประเภท</th>
                  <th className="px-4 py-3 text-right font-medium">จำนวน</th>
                  <th className="px-4 py-3 text-right font-medium">ราคา</th>
                  <th className="px-4 py-3 text-right font-medium">สุทธิ</th>
                  <th className="px-4 py-3 text-right font-medium">กำไร realized</th>
                  <th className="px-4 py-3 text-center font-medium">รูป</th>
                  <th className="px-4 py-3 text-right font-medium">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {rows.map((t) => {
                  const n = normalizeStored(t);
                  const gain = portfolio.realizedByTxId.get(t.id);
                  return (
                    <tr key={t.id} className="hover:bg-slate-800/30">
                      <td className="px-4 py-3 text-slate-300">{fmtDateTimeBangkok(t.executedAt)}</td>
                      <td className="px-4 py-3 text-slate-400">{broker(t.accountId)}</td>
                      <td className="px-4 py-3 font-medium text-slate-100">
                        <TickerLink ticker={t.ticker} />
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={t.side}>{t.side === "buy" ? "ซื้อ" : "ขาย"}</Badge>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-200">{fmtQty(t.qty)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-300">{fmtPrice(t.price)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-200">{fmtUsd(n.net)}</td>
                      <td
                        className={`px-4 py-3 text-right tabular-nums ${
                          gain && gainTone(gain) === "positive"
                            ? "text-emerald-400"
                            : gain && gainTone(gain) === "negative"
                              ? "text-rose-400"
                              : "text-slate-500"
                        }`}
                      >
                        {gain ? fmtSignedUsd(gain) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-center">
                          {t.imagePath ? <TxScreenshot path={t.imagePath} /> : <span className="text-slate-600">-</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Link
                            href={`/transactions/new?id=${t.id}`}
                            className="rounded p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                            aria-label="แก้ไข"
                          >
                            <Pencil className="h-4 w-4" aria-hidden />
                          </Link>
                          <button
                            type="button"
                            onClick={() => onDelete(t.id, `${t.side === "buy" ? "ซื้อ" : "ขาย"} ${t.ticker}`)}
                            className="rounded p-1.5 text-rose-400/80 hover:bg-rose-950/40 hover:text-rose-300"
                            aria-label="ลบ"
                          >
                            <Trash2 className="h-4 w-4" aria-hidden />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  );
}

/** Thumbnail of the OCR screenshot a transaction was imported from (private
 *  bucket → short-lived signed URL fetched on mount). Opens full size on click. */
function TxScreenshot({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    getScreenshotUrl(path).then((u) => {
      if (alive) setUrl(u);
    });
    return () => {
      alive = false;
    };
  }, [path]);
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-block shrink-0"
      title="ดูภาพต้นฉบับ"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt="screenshot"
        className="h-7 w-7 rounded object-cover ring-1 ring-slate-700 hover:ring-2 hover:ring-indigo-400"
      />
    </a>
  );
}
