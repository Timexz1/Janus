"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { useStore } from "@/lib/store/hooks";
import { useT } from "@/lib/i18n/context";
import { extractSaleEvents } from "@/lib/portfolio/portfolio";
import { matchRemittances, toTaxableInputs, outboundFromTrades } from "@/lib/tax/remittance";
import { APPORTIONMENT_LABELS } from "@/lib/tax/config";
import { addRemittance, deleteRemittance } from "@/lib/store/local-store";
import { Decimal, D, ZERO } from "@/lib/money/decimal";
import { Button, Card, Field, Input, Select, StatCard, EmptyState } from "@/components/ui";
import { fmtUsd, fmtSignedUsd, fmtThb } from "@/lib/format";

type Direction = "inbound" | "outbound";

function isPos(v: string) {
  try { return v.trim() !== "" && new Decimal(v).gt(0); } catch { return false; }
}

export default function RemittancesPage() {
  const { transactions, remittances, taxSettings, hydrated } = useStore();
  const { t } = useT();
  const method = taxSettings?.apportionmentMethod ?? "gain_first";

  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [direction, setDirection] = useState<Direction>("inbound");
  const [amount, setAmount] = useState("");
  const [fx, setFx] = useState("");
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const saleEvents = useMemo(() => extractSaleEvents(transactions), [transactions]);
  // tax matching uses ONLY inbound (to-Thailand) transfers
  const lines = useMemo(
    () => matchRemittances(saleEvents, toTaxableInputs(remittances), method),
    [remittances, saleEvents, method],
  );
  const lineById = useMemo(() => new Map(lines.map((l) => [l.id, l])), [lines]);

  const totalRealized = useMemo(
    () => saleEvents.reduce((s, e) => s.plus(e.gainUsd), ZERO),
    [saleEvents],
  );
  const matchedGain = useMemo(
    () => lines.reduce((s, l) => s.plus(l.gainUsdMatched), ZERO),
    [lines],
  );
  const unremitted = Decimal.max(totalRealized.minus(matchedGain), 0);

  const inboundTotal = useMemo(
    () =>
      remittances
        .filter((r) => r.direction !== "outbound")
        .reduce((s, r) => s.plus(D(r.amountUsd)), ZERO),
    [remittances],
  );
  const outboundManual = useMemo(
    () =>
      remittances
        .filter((r) => r.direction === "outbound")
        .reduce((s, r) => s.plus(D(r.amountUsd)), ZERO),
    [remittances],
  );
  // THB-funded buys (Dime!) are themselves money sent abroad — fold them in.
  const tradesOutbound = useMemo(() => outboundFromTrades(transactions), [transactions]);
  const outboundTotal = outboundManual.plus(tradesOutbound.usd);

  if (!hydrated) return <Card className="h-48 animate-pulse" />;

  function onAdd() {
    setErr(null);
    if (!date) return setErr("ใส่วันที่โอน");
    if (!isPos(amount)) return setErr("จำนวนเงิน (USD) ต้องมากกว่า 0");
    if (!isPos(fx)) return setErr("เรตแลกเปลี่ยน (THB/USD) ต้องมากกว่า 0");
    addRemittance({
      date,
      direction,
      amountUsd: amount,
      fxRate: fx,
      note: note.trim() === "" ? null : note.trim(),
    });
    setAmount("");
    setFx("");
    setNote("");
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-lg font-semibold text-slate-100">{t("remittances.title")}</h1>
        <p className="mt-1 text-sm text-slate-500">
          บันทึกการโอนทั้ง <span className="text-emerald-300">เข้าไทย</span> และ{" "}
          <span className="text-sky-300">ออกไปลงทุน</span> — เก็บภาษีเฉพาะกำไรที่{" "}
          <b>นำกลับเข้าไทย</b> ด้วยวิธี{" "}
          <span className="text-slate-300">{APPORTIONMENT_LABELS[method]}</span> (เปลี่ยนได้ในตั้งค่า)
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="โอนออกไปลงทุนสะสม"
          value={fmtUsd(outboundTotal)}
          hint={
            tradesOutbound.thb.gt(0)
              ? `รวมซื้อด้วยบาท ${fmtThb(tradesOutbound.thb)} · เงินต้น (ไม่เสียภาษี)`
              : "เงินต้น (ไม่เสียภาษี)"
          }
        />
        <StatCard label="นำกลับเข้าไทยสะสม" value={fmtUsd(inboundTotal)} hint="ส่วนกำไรเข้าฐานภาษี" />
        <StatCard label="กำไรที่เข้าฐานภาษี" value={fmtUsd(matchedGain)} hint="จาก match ขาเข้าไทย" />
        <StatCard label="กำไรค้างรอโอน" value={fmtUsd(unremitted)} hint="ยังไม่นำเข้า → ยังไม่เสียภาษี" />
      </div>

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-slate-200">บันทึกการโอนใหม่</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
          <Field label="ทิศทาง" htmlFor="r-dir">
            <Select id="r-dir" value={direction} onChange={(e) => setDirection(e.target.value as Direction)}>
              <option value="inbound">เข้าไทย (เสียภาษี)</option>
              <option value="outbound">ออกไปลงทุน (เงินต้น)</option>
            </Select>
          </Field>
          <Field label="วันที่โอน" htmlFor="r-date">
            <Input id="r-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="จำนวนเงิน (USD)" htmlFor="r-amt">
            <Input id="r-amt" inputMode="decimal" placeholder="2000" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field label="เรต (THB/USD)" htmlFor="r-fx" hint="อ้างอิง ธปท.">
            <Input id="r-fx" inputMode="decimal" placeholder="36.50" value={fx} onChange={(e) => setFx(e.target.value)} />
          </Field>
          <Field label="หมายเหตุ" htmlFor="r-note">
            <Input id="r-note" placeholder="(ไม่บังคับ)" value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <div className="flex items-end">
            <Button onClick={onAdd} className="w-full">
              <Plus className="h-4 w-4" aria-hidden /> บันทึก
            </Button>
          </div>
        </div>
        {err ? <p className="mt-2 text-xs text-rose-400">{err}</p> : null}
      </Card>

      {remittances.length === 0 ? (
        <EmptyState
          title="ยังไม่มีรายการโอน"
          description="บันทึกทั้งการโอนเข้าไทย (เสียภาษีตามกฎ ป.161/162) และโอนออกไปลงทุน เพื่อเห็นกระแสเงินสดแบบเรียลไทม์"
        />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-4 py-3 font-medium">วันที่โอน</th>
                <th className="px-4 py-3 font-medium">ทิศทาง</th>
                <th className="px-4 py-3 text-right font-medium">จำนวน (USD)</th>
                <th className="px-4 py-3 text-right font-medium">เรต</th>
                <th className="px-4 py-3 text-right font-medium">กำไรที่ match (USD)</th>
                <th className="px-4 py-3 text-right font-medium">ภาษีต้องนำไปคำนวณ (THB)</th>
                <th className="px-4 py-3 font-medium">หมายเหตุ</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {[...remittances]
                .sort((a, b) => (a.date < b.date ? 1 : -1))
                .map((r) => {
                  const line = lineById.get(r.id);
                  const isOut = r.direction === "outbound";
                  return (
                    <tr key={r.id} className="hover:bg-slate-800/30">
                      <td className="px-4 py-3 text-slate-300">{r.date}</td>
                      <td className="px-4 py-3">
                        {isOut ? (
                          <span className="inline-flex items-center gap-1 rounded bg-sky-950/50 px-1.5 py-0.5 text-xs text-sky-300">
                            <ArrowUpRight className="h-3 w-3" aria-hidden /> ออกไปลงทุน
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded bg-emerald-950/50 px-1.5 py-0.5 text-xs text-emerald-300">
                            <ArrowDownLeft className="h-3 w-3" aria-hidden /> เข้าไทย
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-200">{fmtUsd(r.amountUsd)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-300">{r.fxRate}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-[color:var(--warning-strong)]">
                        {line ? fmtSignedUsd(line.gainUsdMatched) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-100">
                        {line ? fmtThb(line.taxableThb) : "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-500">{r.note ?? "—"}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => deleteRemittance(r.id)}
                          className="rounded p-1.5 text-rose-400/80 hover:bg-rose-950/40 hover:text-rose-300"
                          aria-label="ลบ"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </button>
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
