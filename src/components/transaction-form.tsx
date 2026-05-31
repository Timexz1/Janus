"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Decimal, D } from "@/lib/money/decimal";
import { normalizeTrade } from "@/lib/engine/normalize";
import { availableShares } from "@/lib/portfolio/portfolio";
import {
  addTransaction,
  updateTransaction,
  getTransactions,
} from "@/lib/store/local-store";
import type { Account, StoredTransaction } from "@/lib/store/types";
import { isoToLocalInput, localInputToIso, fmtUsd, fmtQty, fmtPrice } from "@/lib/format";
import { Button, Card, Field, Input, Select } from "@/components/ui";

function isPosDecimal(v: string): boolean {
  if (v.trim() === "") return false;
  try {
    const d = new Decimal(v);
    return d.isFinite() && d.gt(0);
  } catch {
    return false;
  }
}
function isNonNegDecimal(v: string): boolean {
  if (v.trim() === "") return false;
  try {
    const d = new Decimal(v);
    return d.isFinite() && d.gte(0);
  } catch {
    return false;
  }
}
function isOptDecimal(v: string): boolean {
  if (v.trim() === "") return true;
  return isNonNegDecimal(v);
}

const schema = z.object({
  accountId: z.string().min(1, "เลือกบัญชี"),
  ticker: z.string().trim().min(1, "ใส่ ticker"),
  exchange: z.enum(["NYSE", "NASDAQ", "OTHER"]),
  side: z.enum(["buy", "sell"]),
  qty: z.string().refine(isPosDecimal, "จำนวนหุ้นต้องมากกว่า 0"),
  price: z.string().refine(isNonNegDecimal, "ราคาต้องเป็นตัวเลข ≥ 0"),
  stockValue: z.string().refine(isOptDecimal, "ตัวเลขไม่ถูกต้อง"),
  fees: z.string().refine(isNonNegDecimal, "ค่าธรรมเนียมต้อง ≥ 0"),
  couponsWaived: z.string().refine(isOptDecimal, "ตัวเลขไม่ถูกต้อง"),
  fxRate: z.string().refine(isOptDecimal, "เรตต้องเป็นตัวเลข"),
  thbCost: z.string().refine(isOptDecimal, "ยอดบาทต้องเป็นตัวเลข"),
  executedAtLocal: z.string().min(1, "ใส่วันและเวลา"),
});

type FormValues = z.infer<typeof schema>;

function toDefaults(tx?: StoredTransaction): FormValues {
  if (!tx) {
    return {
      accountId: "acc_webull",
      ticker: "",
      exchange: "NASDAQ",
      side: "buy",
      qty: "",
      price: "",
      stockValue: "",
      fees: "0",
      couponsWaived: "",
      fxRate: "",
      thbCost: "",
      executedAtLocal: isoToLocalInput(new Date().toISOString()),
    };
  }
  return {
    accountId: tx.accountId,
    ticker: tx.ticker,
    exchange: tx.exchange ?? "OTHER",
    side: tx.side,
    qty: tx.qty,
    price: tx.price,
    stockValue: tx.stockValue ?? "",
    fees: tx.fees,
    couponsWaived: tx.couponsWaived ?? "",
    fxRate: tx.fxRate ?? "",
    thbCost: tx.thbCost ?? "",
    executedAtLocal: isoToLocalInput(tx.executedAt),
  };
}

export function TransactionForm({
  accounts,
  editTx,
}: {
  accounts: Account[];
  editTx?: StoredTransaction;
}) {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: toDefaults(editTx),
  });

  const values = useWatch({ control }) as FormValues;

  // Live preview of the normalized numbers the user is about to confirm (§4.3).
  const preview = useMemo(() => {
    if (!isPosDecimal(values.qty) || !isNonNegDecimal(values.price)) return null;
    if (!isNonNegDecimal(values.fees)) return null;
    if (!isOptDecimal(values.stockValue) || !isOptDecimal(values.couponsWaived))
      return null;
    try {
      return normalizeTrade({
        side: values.side,
        qty: D(values.qty),
        price: D(values.price),
        stockValue:
          values.stockValue.trim() === "" ? undefined : D(values.stockValue),
        fees: D(values.fees),
        couponsWaived:
          values.couponsWaived.trim() === ""
            ? undefined
            : D(values.couponsWaived),
      });
    } catch {
      return null;
    }
  }, [
    values.side,
    values.qty,
    values.price,
    values.stockValue,
    values.fees,
    values.couponsWaived,
  ]);

  function onSubmit(v: FormValues) {
    // Guardrail: a sell cannot exceed shares currently held in that account.
    if (v.side === "sell") {
      const others = getTransactions().filter((t) => t.id !== editTx?.id);
      const available = availableShares(others, v.accountId, v.ticker.toUpperCase());
      if (D(v.qty).gt(available)) {
        setError("qty", {
          message: `ถือ ${fmtQty(available)} หุ้นในบัญชีนี้ ขายได้ไม่เกินจำนวนนั้น`,
        });
        return;
      }
    }

    const input = {
      accountId: v.accountId,
      ticker: v.ticker.toUpperCase(),
      exchange: v.exchange,
      side: v.side,
      qty: v.qty,
      price: v.price,
      stockValue: v.stockValue.trim() === "" ? null : v.stockValue,
      fees: v.fees,
      couponsWaived: v.couponsWaived.trim() === "" ? null : v.couponsWaived,
      // THB-funded buy (Dime!): the buy is also a money-out event. Keep only when
      // the user actually paid in THB; never auto-fabricate an FX rate.
      fxRate: v.side === "buy" && v.fxRate.trim() !== "" ? v.fxRate : null,
      thbCost: v.side === "buy" && v.thbCost.trim() !== "" ? v.thbCost : null,
      imagePath: editTx?.imagePath ?? null,
      executedAt: localInputToIso(v.executedAtLocal),
      executedTz: "Asia/Bangkok",
    };

    if (editTx) updateTransaction(editTx.id, input);
    else addTransaction(input);
    router.push("/transactions");
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_380px] 2xl:grid-cols-[minmax(0,1fr)_420px] min-[2200px]:grid-cols-[minmax(0,1fr)_480px] min-[3200px]:grid-cols-[minmax(0,1fr)_520px]">
      <Card className="grid gap-4 sm:grid-cols-2">
        <Field label="บัญชี" htmlFor="accountId" error={errors.accountId?.message}>
          <Select id="accountId" {...register("accountId")}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.broker} — {a.accountLabel}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="ประเภท" htmlFor="side" error={errors.side?.message}>
          <Select id="side" {...register("side")}>
            <option value="buy">ซื้อ (Buy)</option>
            <option value="sell">ขาย (Sell)</option>
          </Select>
        </Field>

        <Field label="Ticker" htmlFor="ticker" error={errors.ticker?.message}>
          <Input id="ticker" placeholder="ASTS" {...register("ticker")} />
        </Field>

        <Field label="ตลาด" htmlFor="exchange" error={errors.exchange?.message}>
          <Select id="exchange" {...register("exchange")}>
            <option value="NASDAQ">NASDAQ</option>
            <option value="NYSE">NYSE</option>
            <option value="OTHER">อื่นๆ</option>
          </Select>
        </Field>

        <Field label="จำนวนหุ้น" htmlFor="qty" error={errors.qty?.message} hint="รองรับเศษหุ้น 7 ตำแหน่ง">
          <Input id="qty" inputMode="decimal" placeholder="37.04352" {...register("qty")} />
        </Field>

        <Field label="ราคาต่อหุ้น (USD)" htmlFor="price" error={errors.price?.message}>
          <Input id="price" inputMode="decimal" placeholder="73.400135" {...register("price")} />
        </Field>

        <Field
          label="มูลค่าหุ้น (USD) — ถ้ามี"
          htmlFor="stockValue"
          error={errors.stockValue?.message}
          hint="เว้นว่างได้ จะคิดจาก จำนวน × ราคา"
        >
          <Input id="stockValue" inputMode="decimal" placeholder="2719.00" {...register("stockValue")} />
        </Field>

        <Field
          label="ค่าธรรมเนียมรวม (USD)"
          htmlFor="fees"
          error={errors.fees?.message}
          hint="รวมคอม + VAT + TAF + ค่าธรรมเนียมตลาด"
        >
          <Input id="fees" inputMode="decimal" placeholder="2.91" {...register("fees")} />
        </Field>

        <Field
          label="คูปองที่ waive ค่าธรรมเนียม (USD)"
          htmlFor="couponsWaived"
          error={errors.couponsWaived?.message}
          hint="เช่น รายการฟรีของเดือน"
        >
          <Input id="couponsWaived" inputMode="decimal" placeholder="0" {...register("couponsWaived")} />
        </Field>

        {values.side === "buy" ? (
          <>
            <Field
              label="เรตแลกเปลี่ยน (THB/USD) — ถ้าจ่ายด้วยบาท"
              htmlFor="fxRate"
              error={errors.fxRate?.message}
              hint="เช่น Dime! Fast แปลงบาท→USD ตอนกดซื้อ"
            >
              <Input id="fxRate" inputMode="decimal" placeholder="33.80" {...register("fxRate")} />
            </Field>

            <Field
              label="ยอดที่จ่ายเป็นบาท (โอนออกนอกประเทศ)"
              htmlFor="thbCost"
              error={errors.thbCost?.message}
              hint="ยอดบาทรวมบนสลิป — นับเป็นเงินต้นออกนอกประเทศ"
            >
              <Input id="thbCost" inputMode="decimal" placeholder="2000.28" {...register("thbCost")} />
            </Field>
          </>
        ) : null}

        <Field label="วันและเวลาที่จับคู่" htmlFor="executedAtLocal" error={errors.executedAtLocal?.message} hint="เวลาประเทศไทย">
          <Input id="executedAtLocal" type="datetime-local" {...register("executedAtLocal")} />
        </Field>
      </Card>

      <div className="flex flex-col gap-3">
        <Card>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            ตรวจก่อนยืนยัน
          </p>
          {preview ? (
            <dl className="mt-3 space-y-2 text-sm">
              <Row label="มูลค่าหุ้น (gross)" value={fmtUsd(preview.gross)} />
              <Row label="ค่าธรรมเนียมสุทธิ" value={fmtUsd(preview.feesNet)} />
              <Row
                label={values.side === "buy" ? "ต้นทุนรวม (net)" : "เงินที่ได้รับสุทธิ (net)"}
                value={fmtUsd(preview.net)}
                strong
              />
              {preview.costPerShare ? (
                <Row label="ต้นทุน/หุ้น" value={fmtPrice(preview.costPerShare)} />
              ) : null}
            </dl>
          ) : (
            <p className="mt-3 text-sm text-slate-500">
              กรอกจำนวน/ราคา/ค่าธรรมเนียมให้ครบเพื่อดูตัวเลขที่จะบันทึก
            </p>
          )}
        </Card>

        <Button type="submit" disabled={isSubmitting || !preview} className="w-full">
          {editTx ? "บันทึกการแก้ไข" : "ยืนยันบันทึก"}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() => router.push("/transactions")}
        >
          ยกเลิก
        </Button>
        <p className="text-xs text-slate-500">
          ระบบจะคำนวณ FIFO และกำไรที่เกิดขึ้นจริงให้อัตโนมัติหลังบันทึก
        </p>
      </div>
    </form>
  );
}

function Row({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-slate-400">{label}</dt>
      <dd className={strong ? "font-semibold text-slate-100 tabular-nums" : "text-slate-200 tabular-nums"}>
        {value}
      </dd>
    </div>
  );
}
