"use client";

import { useEffect, useMemo, useState } from "react";
import { Calculator, Info } from "lucide-react";
import { useStore } from "@/lib/store/hooks";
import { useT } from "@/lib/i18n/context";
import { extractSaleEvents } from "@/lib/portfolio/portfolio";
import { computeTax, whatIfRemittance } from "@/lib/tax/engine";
import { toTaxableInputs } from "@/lib/tax/remittance";
import { APPORTIONMENT_LABELS, DISCLAIMER, type ApportionmentMethod } from "@/lib/tax/config";
import { saveTaxSettings, setIncomeForYear } from "@/lib/store/local-store";
import { Decimal, D, ZERO } from "@/lib/money/decimal";
import { Card, Field, Input, Select, StatCard } from "@/components/ui";
import { fmtThb, fmtUsd } from "@/lib/format";

export default function TaxPage() {
  const { transactions, remittances, taxSettings, incomeByYear, hydrated } = useStore();
  const { t } = useT();

  const [income, setIncome] = useState("");
  const [wfAmount, setWfAmount] = useState("");
  const [wfFx, setWfFx] = useState("");

  const taxYear = taxSettings?.taxYear ?? new Date().getFullYear();
  const method = taxSettings?.apportionmentMethod ?? "gain_first";
  const allowance = taxSettings?.personalAllowance ?? "60000";

  // keep the income field in sync with the selected tax year
  useEffect(() => {
    queueMicrotask(() => setIncome(incomeByYear[taxYear] ?? ""));
  }, [incomeByYear, taxYear]);

  const saleEvents = useMemo(() => extractSaleEvents(transactions), [transactions]);
  const remInputs = useMemo(() => toTaxableInputs(remittances), [remittances]);

  const input = useMemo(
    () => ({
      saleEvents,
      remittances: remInputs,
      otherIncomeThb: D(income.trim() === "" ? "0" : income),
      personalAllowance: D(allowance),
      method: method as ApportionmentMethod,
      taxYear,
    }),
    [saleEvents, remInputs, income, allowance, method, taxYear],
  );

  const result = useMemo(() => {
    try {
      return computeTax(input);
    } catch {
      return null;
    }
  }, [input]);

  const whatIf = useMemo(() => {
    if (!wfAmount || !wfFx) return null;
    try {
      if (new Decimal(wfAmount).lte(0) || new Decimal(wfFx).lte(0)) return null;
      return whatIfRemittance(input, {
        id: "whatif",
        date: new Date().toISOString().slice(0, 10),
        amountUsd: D(wfAmount),
        fxRate: D(wfFx),
      });
    } catch {
      return null;
    }
  }, [input, wfAmount, wfFx]);

  const effRate =
    result && result.netIncomeThb.gt(0)
      ? result.tax.total.div(result.netIncomeThb).times(100)
      : ZERO;

  if (!hydrated || !taxSettings) return <Card className="h-64 animate-pulse" />;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-lg font-semibold text-slate-100">{t("tax.title")}</h1>
        <p className="mt-1 text-sm text-slate-500">
          คำนวณแบบเรียลไทม์ตามกฎ &quot;นำเงินกลับไทย&quot; (ป.161/162) — เก็บภาษีเฉพาะกำไรที่โอนกลับแล้ว
        </p>
      </header>

      {/* inputs */}
      <Card className="grid gap-4 sm:grid-cols-3">
        <Field label="ปีภาษี (ค.ศ.)" htmlFor="ty">
          <Select
            id="ty"
            value={taxYear}
            onChange={(e) => saveTaxSettings({ taxYear: Number(e.target.value) })}
          >
            {yearOptions().map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </Select>
        </Field>
        <Field label="เงินได้อื่นรวมทั้งปี (THB)" htmlFor="inc" hint="เช่น เงินเดือน">
          <Input
            id="inc"
            inputMode="decimal"
            placeholder="500000"
            value={income}
            onChange={(e) => {
              setIncome(e.target.value);
              setIncomeForYear(taxYear, e.target.value);
            }}
          />
        </Field>
        <Field label="วิธีจับคู่กำไร" htmlFor="method">
          <Select
            id="method"
            value={method}
            onChange={(e) =>
              saveTaxSettings({ apportionmentMethod: e.target.value as ApportionmentMethod })
            }
          >
            {(Object.keys(APPORTIONMENT_LABELS) as ApportionmentMethod[]).map((m) => (
              <option key={m} value={m}>{APPORTIONMENT_LABELS[m]}</option>
            ))}
          </Select>
        </Field>
      </Card>

      {/* result */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="กำไรโอนกลับ (เข้าฐาน)"
          value={fmtThb(result?.taxableRemittedThb ?? 0)}
          hint={`ปีภาษี ${taxYear}`}
        />
        <StatCard label="เงินได้สุทธิ" value={fmtThb(result?.netIncomeThb ?? 0)} hint={`หักลดหย่อน ${fmtThb(allowance)}`} />
        <StatCard label="ภาษีโดยประมาณ" value={fmtThb(result?.tax.total ?? 0)} tone="negative" />
        <StatCard
          label="กำไรค้างรอโอน"
          value={fmtUsd(result?.unremittedGainUsd ?? 0)}
          hint={`อัตราภาษีเฉลี่ย ${effRate.toDecimalPlaces(2).toString()}%`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* bracket breakdown */}
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-slate-200">รายละเอียดขั้นบันได</h2>
          {result && result.tax.lines.length > 0 ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="py-2 font-medium">ช่วงเงินได้สุทธิ</th>
                  <th className="py-2 text-right font-medium">อัตรา</th>
                  <th className="py-2 text-right font-medium">ฐานในขั้น</th>
                  <th className="py-2 text-right font-medium">ภาษี</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {result.tax.lines.map((l, i) => (
                  <tr key={i}>
                    <td className="py-2 text-slate-300">
                      {l.from.toLocaleString()}–{l.to ? l.to.toLocaleString() : "∞"}
                    </td>
                    <td className="py-2 text-right tabular-nums text-slate-400">{(l.rate * 100).toFixed(0)}%</td>
                    <td className="py-2 text-right tabular-nums text-slate-300">{fmtThb(l.taxableInBracket)}</td>
                    <td className="py-2 text-right tabular-nums text-slate-100">{fmtThb(l.taxInBracket)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-slate-500">ยังไม่มีเงินได้สุทธิที่ต้องเสียภาษี</p>
          )}
        </Card>

        {/* what-if */}
        <Card>
          <div className="mb-3 flex items-center gap-2">
            <Calculator className="h-4 w-4 text-indigo-400" aria-hidden />
            <h2 className="text-sm font-semibold text-slate-200">What-if: ถ้าโอนเพิ่มวันนี้</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="จำนวนเงิน (USD)" htmlFor="wf-amt">
              <Input id="wf-amt" inputMode="decimal" placeholder="1000" value={wfAmount} onChange={(e) => setWfAmount(e.target.value)} />
            </Field>
            <Field label="เรต (THB/USD)" htmlFor="wf-fx">
              <Input id="wf-fx" inputMode="decimal" placeholder="36.50" value={wfFx} onChange={(e) => setWfFx(e.target.value)} />
            </Field>
          </div>
          {whatIf ? (
            <dl className="mt-3 space-y-2 text-sm">
              <Row label="กำไรที่จะเข้าฐานเพิ่ม" value={fmtThb(whatIf.extraTaxableThb)} />
              <Row label="ภาษีปัจจุบัน" value={fmtThb(whatIf.currentTax)} />
              <Row label="ภาษีหลังโอนเพิ่ม" value={fmtThb(whatIf.newTax)} />
              <div className="flex items-center justify-between border-t border-slate-800 pt-2">
                <dt className="font-medium text-slate-200">ภาษีส่วนเพิ่ม (marginal)</dt>
                <dd className="text-base font-semibold tabular-nums text-rose-400">
                  {fmtThb(whatIf.marginalTax)}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="mt-3 text-sm text-slate-500">ใส่จำนวนเงินและเรตเพื่อดูภาษีส่วนเพิ่ม</p>
          )}
        </Card>
      </div>

      <Card className="border-[color:var(--warning-border)] bg-[color:var(--warning-bg)]">
        <p className="flex items-start gap-2 text-xs leading-relaxed text-[color:var(--warning-text)]">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--warning-strong)]" aria-hidden />
          <span>{DISCLAIMER}</span>
        </p>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-slate-400">{label}</dt>
      <dd className="tabular-nums text-slate-200">{value}</dd>
    </div>
  );
}

function yearOptions(): number[] {
  const now = new Date().getFullYear();
  return [now + 1, now, now - 1, now - 2, now - 3];
}
