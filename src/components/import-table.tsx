"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Upload, ScanText, Plus, Trash2, Loader2, ImageIcon, X, PencilLine } from "lucide-react";
import { Decimal, D } from "@/lib/money/decimal";
import { normalizeTrade } from "@/lib/engine/normalize";
import { buildPortfolio } from "@/lib/portfolio/portfolio";
import { addTransaction, getTransactions, getTaxSettings, saveTaxSettings } from "@/lib/store/local-store";
import { useStore } from "@/lib/store/hooks";
import { CLAUDE_MODELS, DEFAULT_CLAUDE_MODEL } from "@/lib/ocr/pricing";
import type { Account, OcrProvider, StoredTransaction } from "@/lib/store/types";
import type { ParsedTrade } from "@/lib/ocr/parser";
import { tradeKey } from "@/lib/import/dedupe";
import { isoToLocalInput, localInputToIso, fmtUsd } from "@/lib/format";
import { Button, Card, Input, Select, cn } from "@/components/ui";

interface OcrUsage {
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  costThb: number;
}

type RowStatus = "manual" | "pending" | "processing" | "done" | "error";
type EditableField = keyof RowFields;

interface RowFields {
  accountId: string;
  side: "buy" | "sell";
  ticker: string;
  exchange: "NYSE" | "NASDAQ" | "OTHER";
  qty: string;
  price: string;
  stockValue: string;
  fees: string;
  couponsWaived: string;
  executedAtLocal: string;
}

interface ImportRow {
  id: string;
  imageName?: string;
  dataUrl?: string;
  status: RowStatus;
  message?: string;
  fields: RowFields;
  errors: string[];
  usage?: OcrUsage;
}

function rowKey(r: ImportRow): string {
  return tradeKey({
    accountId: r.fields.accountId,
    ticker: r.fields.ticker,
    side: r.fields.side,
    qty: r.fields.qty,
    price: r.fields.price,
    fees: r.fields.fees,
    executedAt: executedAtKeyFromLocal(r.fields.executedAtLocal),
  });
}

function executedAtKeyFromLocal(local: string): string {
  if (!local.trim()) return "";
  try {
    return localInputToIso(local);
  } catch {
    return local.trim();
  }
}

function storedTransactionKey(t: StoredTransaction): string {
  return tradeKey({
    accountId: t.accountId,
    ticker: t.ticker,
    side: t.side,
    qty: t.qty,
    price: t.price,
    fees: t.fees,
    executedAt: t.executedAt,
  });
}

function isPos(v: string) {
  try { return v.trim() !== "" && new Decimal(v).gt(0); } catch { return false; }
}
function isNonNeg(v: string) {
  try { return v.trim() !== "" && new Decimal(v).gte(0); } catch { return false; }
}
function isOpt(v: string) {
  return v.trim() === "" || isNonNeg(v);
}

function emptyFields(): RowFields {
  return {
    accountId: "acc_webull",
    side: "buy",
    ticker: "",
    exchange: "NASDAQ",
    qty: "",
    price: "",
    stockValue: "",
    fees: "0",
    couponsWaived: "",
    executedAtLocal: isoToLocalInput(new Date().toISOString()),
  };
}

/** Magnitude of a possibly-negative/blank string (brokers show fees as "-1.44"). */
function absMag(v: string | null | undefined): Decimal {
  try {
    return v ? new Decimal(v).abs() : new Decimal(0);
  } catch {
    return new Decimal(0);
  }
}

/** Net fee = all fees − coupons waived, folded into one number (brief §4.3). */
function netFeeStr(fees: string | null | undefined, coupon: string | null | undefined): string {
  return Decimal.max(absMag(fees).minus(absMag(coupon)), 0).toString();
}

function fieldsFromParsed(p: ParsedTrade): RowFields {
  return {
    accountId: p.accountId ?? "acc_webull",
    side: p.side ?? "buy",
    ticker: p.ticker ?? "",
    exchange: p.exchange ?? "OTHER",
    qty: p.qty ?? "",
    price: p.price ?? "",
    stockValue: p.stockValue ?? "",
    fees: netFeeStr(p.fees, p.couponsWaived), // coupon folded into the fee
    couponsWaived: "",
    executedAtLocal: p.executedAt
      ? isoToLocalInput(p.executedAt)
      : isoToLocalInput(new Date().toISOString()),
  };
}

let counter = 0;
const newId = () => `row_${Date.now().toString(36)}_${counter++}`;

function rowNetPreview(f: RowFields): string {
  if (!isPos(f.qty) || !isNonNeg(f.price) || !isNonNeg(f.fees)) return "—";
  if (!isOpt(f.stockValue) || !isOpt(f.couponsWaived)) return "—";
  try {
    const n = normalizeTrade({
      side: f.side,
      qty: D(f.qty),
      price: D(f.price),
      stockValue: f.stockValue.trim() === "" ? undefined : D(f.stockValue),
      fees: D(f.fees),
      couponsWaived: f.couponsWaived.trim() === "" ? undefined : D(f.couponsWaived),
    });
    return fmtUsd(n.net);
  } catch {
    return "—";
  }
}

function validateFields(f: RowFields): string[] {
  const errs: string[] = [];
  if (!f.ticker.trim()) errs.push("ใส่ ticker");
  if (!isPos(f.qty)) errs.push("จำนวนต้อง > 0");
  if (!isNonNeg(f.price)) errs.push("ราคาต้อง ≥ 0");
  if (!isNonNeg(f.fees)) errs.push("ค่าธรรมเนียมต้อง ≥ 0");
  if (!isOpt(f.stockValue)) errs.push("มูลค่าหุ้นไม่ถูกต้อง");
  if (!isOpt(f.couponsWaived)) errs.push("คูปองไม่ถูกต้อง");
  if (!f.executedAtLocal) errs.push("ใส่วันเวลา");
  if (isPos(f.qty) && isPos(f.price) && isPos(f.stockValue)) {
    const gross = new Decimal(f.qty).mul(f.price);
    const reported = new Decimal(f.stockValue);
    const tolerance = Decimal.max(new Decimal("0.05"), reported.abs().mul("0.01"));
    if (gross.minus(reported).abs().gt(tolerance)) {
      errs.push("จำนวน×ราคาไม่ตรงมูลค่าหุ้น");
    }
  }
  return errs;
}

function hasStockValueMismatch(f: RowFields): boolean {
  if (!isPos(f.qty) || !isPos(f.price) || !isPos(f.stockValue)) return false;
  try {
    const gross = new Decimal(f.qty).mul(f.price);
    const reported = new Decimal(f.stockValue);
    const tolerance = Decimal.max(new Decimal("0.05"), reported.abs().mul("0.01"));
    return gross.minus(reported).abs().gt(tolerance);
  } catch {
    return false;
  }
}

function firstEditableField(row: ImportRow, duplicateMessage?: string): EditableField {
  const f = row.fields;
  if (!f.ticker.trim()) return "ticker";
  if (!isPos(f.qty)) return "qty";
  if (!isNonNeg(f.price)) return "price";
  if (!isOpt(f.stockValue)) return "stockValue";
  if (!isNonNeg(f.fees)) return "fees";
  if (!isOpt(f.couponsWaived)) return "couponsWaived";
  if (!f.executedAtLocal) return "executedAtLocal";
  if (hasStockValueMismatch(f)) return "qty";
  if (duplicateMessage) return "executedAtLocal";
  return "ticker";
}

function duplicateMessagesForRows(
  rows: ImportRow[],
  existingKeys = new Set<string>(),
): Map<string, string> {
  const seen = new Set(existingKeys);
  const messages = new Map<string, string>();
  for (const row of rows) {
    if (row.status === "error" || validateFields(row.fields).length > 0) continue;
    const key = rowKey(row);
    if (seen.has(key)) {
      messages.set(
        row.id,
        existingKeys.has(key) ? "รายการซ้ำกับข้อมูลเดิม" : "รายการซ้ำในชุดนำเข้า",
      );
    } else {
      seen.add(key);
    }
  }
  return messages;
}

function toStored(f: RowFields, id: string): StoredTransaction {
  return {
    id,
    accountId: f.accountId,
    ticker: f.ticker.toUpperCase(),
    exchange: f.exchange,
    side: f.side,
    qty: f.qty,
    price: f.price,
    stockValue: f.stockValue.trim() === "" ? null : f.stockValue,
    fees: f.fees,
    couponsWaived: f.couponsWaived.trim() === "" ? null : f.couponsWaived,
    executedAt: localInputToIso(f.executedAtLocal),
    executedTz: "Asia/Bangkok",
    createdAt: new Date().toISOString(),
  };
}

export function ImportTable({ accounts }: { accounts: Account[] }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [running, setRunning] = useState(false);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [previewRowId, setPreviewRowId] = useState<string | null>(null);
  const { taxSettings, transactions } = useStore();

  const ocrProvider = taxSettings?.ocrProvider ?? "claude";
  const claudeModel =
    taxSettings?.claudeModel && CLAUDE_MODELS[taxSettings.claudeModel]
      ? taxSettings.claudeModel
      : DEFAULT_CLAUDE_MODEL;
  const ocrLabel =
    ocrProvider === "claude"
      ? "Claude"
      : ocrProvider === "gemini"
        ? "Gemini · gemini-2.5-flash"
        : "Typhoon OCR";
  const ocrReady =
    ocrProvider === "claude"
      ? Boolean(taxSettings?.claudeApiKey)
      : ocrProvider === "gemini"
        ? Boolean(taxSettings?.geminiApiKey)
        : Boolean(taxSettings?.typhoonApiKey);

  function patchRow(id: string, patch: Partial<ImportRow>) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }
  function patchField(id: string, key: keyof RowFields, value: string) {
    setRows((rs) =>
      rs.map((r) =>
        r.id === id ? { ...r, fields: { ...r.fields, [key]: value }, errors: [] } : r,
      ),
    );
  }

  function goToEdit(row: ImportRow, duplicateMessage?: string) {
    const field = firstEditableField(row, duplicateMessage);
    if (row.dataUrl) setPreviewRowId(row.id);
    window.requestAnimationFrame(() => {
      const container = tableScrollRef.current;
      if (!container) return;
      const selector = `[data-row-id="${row.id}"][data-field="${field}"]`;
      const el = container.querySelector<HTMLElement>(selector);
      if (!el) return;
      const targetLeft = Math.max(0, el.offsetLeft - 220);
      container.scrollTo({ left: targetLeft, behavior: "smooth" });
      el.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
      window.setTimeout(() => el.focus(), 250);
    });
  }

  async function addFiles(files: FileList | File[]) {
    const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
    const read = await Promise.all(
      list.map(
        (file) =>
          new Promise<ImportRow>((resolve) => {
            const reader = new FileReader();
            reader.onload = () =>
              resolve({
                id: newId(),
                imageName: file.name,
                dataUrl: reader.result as string,
                status: "pending",
                fields: emptyFields(),
                errors: [],
              });
            reader.readAsDataURL(file);
          }),
      ),
    );
    setRows((rs) => [...rs, ...read]);
  }

  async function ocrRow(row: ImportRow) {
    if (!row.dataUrl) return;
    patchRow(row.id, { status: "processing", message: undefined, errors: [] });
    try {
      const settings = getTaxSettings();
      const res = await fetch("/api/ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dataUrl: row.dataUrl,
          provider: settings.ocrProvider,
          geminiApiKey: settings.geminiApiKey || undefined,
          typhoonApiKey: settings.typhoonApiKey || undefined,
          claudeApiKey: settings.claudeApiKey || undefined,
          claudeModel: settings.claudeModel,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        patchRow(row.id, { status: "error", message: json.error ?? "OCR ล้มเหลว" });
        return;
      }
      const parsed = json.parsed as ParsedTrade;
      const parsedFields = fieldsFromParsed(parsed);
      patchRow(row.id, {
        status: "done",
        fields: parsedFields,
        errors: validateFields(parsedFields),
        message: undefined,
        usage: json.usage as OcrUsage | undefined,
      });
    } catch (e) {
      patchRow(row.id, {
        status: "error",
        message: e instanceof Error ? e.message : "OCR ล้มเหลว",
      });
    }
  }

  async function ocrAll() {
    const settings = getTaxSettings();
    if (!settings.ocrEnabled) {
      setBatchError("OCR ถูกปิดอยู่ใน Settings");
      return;
    }
    setRunning(true);
    setBatchError(null);
    // snapshot rows that still need OCR
    const targets = rows.filter((r) => r.dataUrl && (r.status !== "done" || r.errors.length > 0));
    for (const r of targets) {
      // re-read latest row in case state changed
      await ocrRow(r);
    }
    setRunning(false);
  }

  function addManualRow() {
    setRows((rs) => [
      ...rs,
      { id: newId(), status: "manual", fields: emptyFields(), errors: [] },
    ]);
  }

  function removeRow(id: string) {
    setRows((rs) => rs.filter((r) => r.id !== id));
    setPreviewRowId((current) => (current === id ? null : current));
  }

  function confirmAll() {
    setBatchError(null);
    if (rows.length === 0) return;

    if (rows.some((r) => r.status === "error")) {
      setBatchError("มีแถวสีแดงจาก OCR ไม่สำเร็จ กรุณาลบแถวนั้นหรือกด OCR ใหม่ให้สำเร็จก่อนบันทึก");
      return;
    }

    // 1) per-row field validation
    let hasFieldError = false;
    const validated = rows.map((r) => {
      const errs = validateFields(r.fields);
      if (errs.length) hasFieldError = true;
      return { ...r, errors: errs };
    });

    const existing = getTransactions();
    const existingKeys = new Set(existing.map(storedTransactionKey));
    const duplicateMessages = duplicateMessagesForRows(validated, existingKeys);

    setRows(validated);
    if (hasFieldError || duplicateMessages.size > 0) {
      const duplicateNote =
        duplicateMessages.size > 0 ? `พบรายการซ้ำ ${duplicateMessages.size} แถว · ` : "";
      setBatchError(
        duplicateNote + "มีบางแถวข้อมูลไม่ครบ/ไม่ถูกต้อง โปรดแก้หรือลบแถวสีแดงก่อนบันทึก",
      );
      return;
    }

    // 2) holistic FIFO check (existing + this batch) so no oversell slips in
    const candidates = validated.map((r) => toStored(r.fields, r.id));
    const portfolio = buildPortfolio(accounts, [...existing, ...candidates]);
    if (portfolio.errors.length) {
      const broker = (id: string) => accounts.find((a) => a.id === id)?.broker ?? id;
      setBatchError(
        "บันทึกไม่ได้: " +
          portfolio.errors
            .map((e) => `${broker(e.accountId)} ${e.ticker} — ${e.message}`)
            .join(" · "),
      );
      return;
    }

    // 3) commit
    for (const r of validated) addTransaction(toStored(r.fields, r.id));
    router.push("/transactions");
  }

  const existingKeys = new Set(transactions.map(storedTransactionKey));
  const duplicateMessages = duplicateMessagesForRows(rows, existingKeys);
  const hasRedRows = rows.some(
    (r) => r.status === "error" || r.errors.length > 0 || duplicateMessages.has(r.id),
  );
  const ocrErrorCount = rows.filter((r) => r.status === "error").length;
  const validCount = rows.filter(
    (r) =>
      r.status !== "error" &&
      validateFields(r.fields).length === 0 &&
      !duplicateMessages.has(r.id),
  ).length;
  const dupeIds = new Set(duplicateMessages.keys());
  const ocrCount = rows.filter((r) => r.usage).length;
  const totalCostUsd = rows.reduce((s, r) => s + (r.usage?.costUsd ?? 0), 0);
  const previewRow =
    previewRowId ? rows.find((r) => r.id === previewRowId && r.dataUrl) : undefined;

  return (
    <div className="space-y-4">
      {/* Upload zone */}
      <Card className="border-dashed p-3">
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
          }}
          className="flex flex-col gap-3 text-left lg:flex-row lg:items-center lg:justify-between"
        >
          <div className="flex min-w-0 items-center gap-3 lg:flex-1">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-800 text-slate-300">
              <Upload className="h-4 w-4" aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="truncate whitespace-nowrap text-sm font-medium text-slate-200">
                ลากรูป screenshot มาวาง หรือเลือกหลายไฟล์
              </p>
              <p className="mt-0.5 truncate whitespace-nowrap text-xs text-slate-500">
                Webull / Dime · 1 รูปต่อ 1 แถว
              </p>
            </div>
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-2 lg:ml-auto lg:justify-end min-[1500px]:flex-nowrap">
            <Button
              variant="outline"
              className="shrink-0 whitespace-nowrap"
              onClick={() => fileRef.current?.click()}
            >
              <ImageIcon className="h-4 w-4" aria-hidden /> เลือกรูป
            </Button>
            <Button
              className="shrink-0 whitespace-nowrap"
              onClick={ocrAll}
              disabled={
                running ||
                !rows.some((r) => r.dataUrl && (r.status !== "done" || r.errors.length > 0))
              }
            >
              {running ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <ScanText className="h-4 w-4" aria-hidden />
              )}
              OCR ทั้งหมด
            </Button>
            <Button variant="ghost" className="shrink-0 whitespace-nowrap" onClick={addManualRow}>
              <Plus className="h-4 w-4" aria-hidden /> เพิ่มแถวเอง
            </Button>
            <span className="hidden h-6 w-px bg-slate-800 lg:block" aria-hidden />
            <span className="shrink-0 whitespace-nowrap text-xs text-slate-500">OCR</span>
            <Select
              aria-label="เลือก OCR provider"
              className="w-32 shrink-0 py-1 text-xs"
              value={ocrProvider}
              disabled={running}
              onChange={(e) => saveTaxSettings({ ocrProvider: e.target.value as OcrProvider })}
            >
              <option value="claude">Claude</option>
              <option value="gemini">Gemini</option>
              <option value="typhoon">Typhoon OCR</option>
            </Select>
            {ocrProvider === "claude" ? (
                <Select
                  aria-label="เลือกโมเดล Claude OCR"
                  className="w-48 shrink-0 py-1 text-xs"
                  value={claudeModel}
                  disabled={running}
                  onChange={(e) => saveTaxSettings({ claudeModel: e.target.value })}
                >
                  {Object.entries(CLAUDE_MODELS).map(([id, m]) => (
                    <option key={id} value={id}>
                      {m.label}
                    </option>
                  ))}
                </Select>
            ) : (
              <span className="shrink-0 whitespace-nowrap text-xs font-medium text-slate-300">{ocrLabel}</span>
            )}
            {!ocrReady ? <span className="shrink-0 whitespace-nowrap text-xs text-amber-400">ยังไม่มี key</span> : null}
            <Link href="/settings" className="shrink-0 whitespace-nowrap text-xs text-indigo-400 hover:underline">
              ตั้งค่า
            </Link>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>
      </Card>

      {batchError ? (
        <Card className="border-rose-900/60 bg-rose-950/20">
          <p className="text-sm text-rose-300">{batchError}</p>
        </Card>
      ) : null}

      {ocrErrorCount > 0 ? (
        <Card className="border-rose-900/70 bg-rose-950/25">
          <p className="flex items-start gap-2 text-sm text-rose-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>
              มีรายการ OCR ไม่สำเร็จ {ocrErrorCount} แถว กรุณาลบแถวสีแดงหรือกด OCR ใหม่ให้สำเร็จก่อนบันทึก
            </span>
          </p>
        </Card>
      ) : null}

      {rows.length > 0 ? (
        <div
          className={cn(
            "grid gap-3",
            previewRow &&
              "xl:grid-cols-[380px_minmax(0,1fr)] 2xl:grid-cols-[420px_minmax(0,1fr)] min-[2200px]:grid-cols-[480px_minmax(0,1fr)] min-[3200px]:grid-cols-[560px_minmax(0,1fr)]",
          )}
        >
          {previewRow ? (
            <ImageReviewPanel row={previewRow} onClose={() => setPreviewRowId(null)} />
          ) : null}

          <Card className="min-w-0 p-0">
            <div
              ref={tableScrollRef}
              className="max-w-full overflow-x-auto overflow-y-hidden overscroll-x-contain [scrollbar-gutter:stable]"
            >
            <table className="w-max min-w-max table-auto text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="sticky left-0 z-10 bg-slate-900 px-2 py-2.5 font-medium shadow-[1px_0_0_rgba(30,41,59,0.9)]">
                  รูป/สถานะ
                </th>
                <th className="px-2 py-2.5 font-medium">บัญชี</th>
                <th className="px-2 py-2.5 font-medium">ประเภท</th>
                <th className="px-2 py-2.5 font-medium">Ticker</th>
                <th className="px-2 py-2.5 font-medium">ตลาด</th>
                <th className="px-2 py-2.5 font-medium">จำนวน</th>
                <th className="px-2 py-2.5 font-medium">ราคา</th>
                <th className="px-2 py-2.5 font-medium">มูลค่าหุ้น</th>
                <th className="px-2 py-2.5 font-medium">ค่าธรรมเนียม (สุทธิ)</th>
                <th className="px-2 py-2.5 font-medium">วันเวลา (ไทย)</th>
                <th className="px-2 py-2.5 text-right font-medium">สุทธิ</th>
                <th className="px-2 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {rows.map((r) => {
                const duplicateMessage = duplicateMessages.get(r.id);
                const rowErrors = duplicateMessage ? [...r.errors, duplicateMessage] : r.errors;
                const isRedRow = r.status === "error" || rowErrors.length > 0;
                return (
                <tr
                  key={r.id}
                  className={cn(
                    "align-top",
                    isRedRow && "bg-rose-950/25 ring-1 ring-inset ring-rose-900/60",
                  )}
                >
                  <td
                    className={cn(
                      "sticky left-0 z-10 px-2 py-2 shadow-[1px_0_0_rgba(30,41,59,0.9)]",
                      isRedRow ? "bg-rose-950" : "bg-slate-900",
                    )}
                  >
                    <StatusCell
                      row={r}
                      isDup={dupeIds.has(r.id)}
                      isPreviewing={previewRowId === r.id}
                      onImageClick={() =>
                        r.dataUrl && setPreviewRowId((current) => (current === r.id ? null : r.id))
                      }
                      onRemove={() => removeRow(r.id)}
                      onRetry={() => ocrRow(r)}
                      onEdit={() => goToEdit(r, duplicateMessage)}
                      retryDisabled={running || r.status === "processing"}
                      duplicateMessage={duplicateMessage}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <Select
                      className="w-44 py-1"
                      data-row-id={r.id}
                      data-field="accountId"
                      value={r.fields.accountId}
                      onChange={(e) => patchField(r.id, "accountId", e.target.value)}
                    >
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>{a.broker}</option>
                      ))}
                    </Select>
                  </td>
                  <td className="px-2 py-2">
                    <Select
                      className="!w-20 py-1"
                      data-row-id={r.id}
                      data-field="side"
                      value={r.fields.side}
                      onChange={(e) => patchField(r.id, "side", e.target.value)}
                    >
                      <option value="buy">ซื้อ</option>
                      <option value="sell">ขาย</option>
                    </Select>
                  </td>
                  <td className="px-2 py-2">
                    <Input
                      className="!w-16 py-1"
                      data-row-id={r.id}
                      data-field="ticker"
                      value={r.fields.ticker}
                      onChange={(e) => patchField(r.id, "ticker", e.target.value)}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <Select
                      className="!w-24 py-1"
                      data-row-id={r.id}
                      data-field="exchange"
                      value={r.fields.exchange}
                      onChange={(e) => patchField(r.id, "exchange", e.target.value)}
                    >
                      <option value="NASDAQ">NASDAQ</option>
                      <option value="NYSE">NYSE</option>
                      <option value="OTHER">อื่นๆ</option>
                    </Select>
                  </td>
                  <td className="px-2 py-2">
                    <Input className="!w-24 py-1" data-row-id={r.id} data-field="qty" inputMode="decimal" value={r.fields.qty}
                      onChange={(e) => patchField(r.id, "qty", e.target.value)} />
                  </td>
                  <td className="px-2 py-2">
                    <Input className="!w-20 py-1" data-row-id={r.id} data-field="price" inputMode="decimal" value={r.fields.price}
                      onChange={(e) => patchField(r.id, "price", e.target.value)} />
                  </td>
                  <td className="px-2 py-2">
                    <Input className="!w-24 py-1" data-row-id={r.id} data-field="stockValue" inputMode="decimal" placeholder="auto" value={r.fields.stockValue}
                      onChange={(e) => patchField(r.id, "stockValue", e.target.value)} />
                  </td>
                  <td className="px-2 py-2">
                    <Input className="!w-20 py-1" data-row-id={r.id} data-field="fees" inputMode="decimal" value={r.fields.fees}
                      onChange={(e) => patchField(r.id, "fees", e.target.value)} />
                  </td>
                  <td className="px-2 py-2">
                    <Input className="w-64 py-1" data-row-id={r.id} data-field="executedAtLocal" type="datetime-local" value={r.fields.executedAtLocal}
                      onChange={(e) => patchField(r.id, "executedAtLocal", e.target.value)} />
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-slate-200 whitespace-nowrap">
                    {rowNetPreview(r.fields)}
                    {rowErrors.length > 0 ? (
                      <p className="mt-1 text-xs text-rose-400">{rowErrors.join(", ")}</p>
                    ) : null}
                  </td>
                  <td className="px-2 py-2">
                    <button type="button" onClick={() => removeRow(r.id)}
                      className="rounded p-1.5 text-rose-400/80 hover:bg-rose-950/40 hover:text-rose-300"
                      aria-label="ลบแถว">
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  </td>
                </tr>
                );
              })}
            </tbody>
            </table>
            </div>
          </Card>
        </div>
      ) : null}

      {rows.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-slate-500">
            <p>ตรวจ/แก้ข้อมูลในตารางให้ถูกต้องก่อน — ระบบจะคำนวณ FIFO และกำไรหลังบันทึก</p>
            {ocrCount > 0 ? (
              <p className="mt-0.5 text-slate-400">
                OCR {ocrCount} รูป · ค่าใช้จ่ายรวม ≈ <b className="text-slate-200">${totalCostUsd.toFixed(4)} USD</b>
                {totalCostUsd > 0 ? ` (≈$${(totalCostUsd / ocrCount).toFixed(4)} USD/รูป)` : ""}
              </p>
            ) : null}
          </div>
          <Button onClick={confirmAll} disabled={validCount === 0 || hasRedRows || running}>
            {hasRedRows ? "แก้แถวสีแดงก่อน" : `ยืนยันบันทึกทั้งหมด (${validCount})`}
          </Button>
        </div>
      ) : null}

    </div>
  );
}

function ImageReviewPanel({ row, onClose }: { row: ImportRow; onClose: () => void }) {
  if (!row.dataUrl) return null;
  return (
    <Card className="min-w-0 self-start p-2 xl:sticky xl:top-20">
      <div className="mb-2 flex items-center justify-between gap-2 px-1">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-slate-200">
            {row.fields.ticker || row.imageName || "รูปอ้างอิง"}
          </p>
          {row.imageName ? (
            <p className="truncate text-[11px] text-slate-500">{row.imageName}</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-slate-400 hover:bg-slate-800 hover:text-slate-100"
          aria-label="ปิดรูป"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <div className="max-h-[calc(100vh-11rem)] overflow-auto rounded-lg bg-slate-950">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={row.dataUrl}
          alt={row.imageName ?? "screenshot"}
          className="w-full rounded-lg object-contain"
        />
      </div>
    </Card>
  );
}

function StatusCell({
  row,
  isDup,
  isPreviewing,
  onImageClick,
  onRemove,
  onRetry,
  onEdit,
  retryDisabled,
  duplicateMessage,
}: {
  row: ImportRow;
  isDup: boolean;
  isPreviewing: boolean;
  onImageClick: () => void;
  onRemove: () => void;
  onRetry: () => void;
  onEdit: () => void;
  retryDisabled: boolean;
  duplicateMessage?: string;
}) {
  const map: Record<RowStatus, { label: string; cls: string }> = {
    manual: { label: "กรอกเอง", cls: "text-slate-400" },
    pending: { label: "รอ OCR", cls: "text-amber-400" },
    processing: { label: "กำลังอ่าน…", cls: "text-indigo-300" },
    done: { label: "อ่านแล้ว", cls: "text-emerald-400" },
    error: { label: "OCR ไม่สำเร็จ", cls: "text-rose-300" },
  };
  const s = map[row.status];
  const hasFieldErrors = row.errors.length > 0 || Boolean(duplicateMessage);
  const label = duplicateMessage ? "รายการซ้ำ" : hasFieldErrors ? "ต้องแก้ข้อมูล" : s.label;
  const cls = row.status === "error" || hasFieldErrors ? "text-rose-300" : s.cls;
  const costUsdLabel = row.usage
    ? `≈$${row.usage.costUsd.toFixed(row.usage.costUsd > 0 && row.usage.costUsd < 0.01 ? 4 : 2)}`
    : null;
  return (
    <div className="w-56">
      <div className="flex items-center gap-2">
        {row.dataUrl ? (
          <button
            type="button"
            onClick={onImageClick}
            className={cn(
              "shrink-0 rounded ring-offset-1 hover:ring-2 hover:ring-indigo-500",
              isPreviewing && "ring-2 ring-indigo-400",
            )}
            aria-label="ขยายรูป"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={row.dataUrl} alt="" className="h-9 w-9 rounded object-cover" />
          </button>
        ) : (
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded bg-slate-800 text-slate-500">
            <ImageIcon className="h-4 w-4" aria-hidden />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1 whitespace-nowrap">
            <span className={`shrink-0 text-xs font-medium ${cls}`}>{label}</span>
            {costUsdLabel ? (
              <span className="shrink-0 text-[10px] leading-none text-slate-500 tabular-nums">
                {costUsdLabel}
              </span>
            ) : null}
          {isDup ? (
            <span className="inline-block shrink-0 rounded bg-amber-950/60 px-1 text-[10px] text-amber-300">
              ซ้ำ
            </span>
          ) : null}
            {hasFieldErrors ? (
              <button
                type="button"
                onClick={onEdit}
                title="แก้ข้อมูล"
                aria-label="แก้ข้อมูล"
                className="grid h-5 w-5 shrink-0 place-items-center rounded border border-amber-900/70 bg-amber-950/30 text-amber-200 hover:bg-amber-900/40"
              >
                <PencilLine className="h-3 w-3" aria-hidden />
              </button>
            ) : null}
            {(row.status === "error" || hasFieldErrors) && row.dataUrl ? (
              <button
                type="button"
                onClick={onRetry}
                disabled={retryDisabled}
                title="OCR ใหม่"
                aria-label="OCR ใหม่"
                className="grid h-5 w-5 shrink-0 place-items-center rounded border border-indigo-900/70 bg-indigo-950/40 text-indigo-200 hover:bg-indigo-900/40 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ScanText className="h-3 w-3" aria-hidden />
              </button>
            ) : null}
          </div>
        </div>
      </div>
      {row.message ? (
        <p className="mt-1 text-[11px] leading-tight text-rose-400">{row.message}</p>
      ) : null}
      {duplicateMessage ? (
        <p className="mt-1 text-[11px] leading-tight text-rose-400">{duplicateMessage}</p>
      ) : null}
      {row.status === "error" || duplicateMessage ? (
        <button
          type="button"
          onClick={onRemove}
          className="mt-1 inline-flex items-center gap-1 rounded border border-rose-900/70 bg-rose-950/40 px-1.5 py-0.5 text-[11px] font-medium text-rose-200 hover:bg-rose-900/40"
        >
          <Trash2 className="h-3 w-3" aria-hidden /> ลบแถว
        </button>
      ) : null}
    </div>
  );
}
