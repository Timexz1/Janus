"use client";

import { useRef, useState } from "react";
import { Upload, Download, Check, X, AlertCircle } from "lucide-react";
import { parseFile, type RawRow } from "@/lib/import/parse";
import { validateRow, type ValidatedRow, type RowError } from "@/lib/import/validate";
import { addTransaction } from "@/lib/store/local-store";
import { Button, Input, Select } from "@/components/ui";

interface PreviewRow {
  id: string;
  raw: RawRow;
  validated: ValidatedRow;
  errors: RowError[];
  edited: Partial<RawRow>;
}

export function ImportTransactions({ onDone }: { onDone?: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<PreviewRow[] | null>(null);
  const [importing, setImporting] = useState(false);
  const [done, setDone] = useState<number | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const rawRows = await parseFile(file);
    const preview: PreviewRow[] = rawRows.map((raw, i) => {
      const { row: validated, errors } = validateRow(raw);
      return { id: String(i), raw, validated, errors, edited: {} };
    });
    setRows(preview);
    setDone(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function updateCell(rowId: string, field: string, value: string) {
    setRows((prev) =>
      (prev ?? []).map((r) => {
        if (r.id !== rowId) return r;
        const editedClean = Object.fromEntries(
          Object.entries({ ...r.edited, [field]: value }).filter(([, v]) => v !== undefined),
        ) as RawRow;
        const merged: RawRow = { ...r.raw, ...editedClean };
        const { row: validated, errors } = validateRow(merged);
        return { ...r, edited: { ...r.edited, [field]: value }, validated, errors };
      }),
    );
  }

  function confirm() {
    if (!rows) return;
    setImporting(true);
    let count = 0;
    for (const r of rows) {
      if (r.errors.length > 0) continue;
      addTransaction({
        brokerId: r.validated.brokerId,
        ticker: r.validated.ticker,
        exchange: r.validated.exchange,
        side: r.validated.side,
        qty: r.validated.qty,
        price: r.validated.price,
        stockValue: r.validated.stockValue,
        fees: r.validated.fees,
        couponsWaived: r.validated.couponsWaived,
        fxRate: r.validated.fxRate,
        thbCost: r.validated.thbCost,
        imagePath: null,
        executedAt: r.validated.executedAt,
        executedTz: r.validated.executedTz,
      });
      count++;
    }
    setImporting(false);
    setDone(count);
    setRows(null);
    onDone?.();
  }

  const allValid = rows ? rows.every((r) => r.errors.length === 0) : false;
  const errorCount = rows ? rows.filter((r) => r.errors.length > 0).length : 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => fileRef.current?.click()}>
          <Upload className="h-4 w-4" aria-hidden /> นำเข้าไฟล์
        </Button>
        <a href="/api/export/transactions" download>
          <Button variant="outline">
            <Download className="h-4 w-4" aria-hidden /> ตัวอย่าง CSV
          </Button>
        </a>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          className="hidden"
          onChange={onFile}
        />
      </div>

      {done !== null && (
        <p className="text-sm text-emerald-400">
          <Check className="inline h-4 w-4" /> นำเข้าสำเร็จ {done} รายการ
        </p>
      )}

      {rows && rows.length > 0 && (
        <div className="space-y-3">
          {errorCount > 0 && (
            <p className="flex items-center gap-1 text-sm text-amber-400">
              <AlertCircle className="h-4 w-4" /> มี {errorCount} แถวที่ต้องแก้ไขก่อน
            </p>
          )}
          <div className="overflow-x-auto rounded-lg border border-slate-800">
            <table className="w-full min-w-[900px] text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-left text-slate-400">
                  {["โบรก", "Ticker", "Side", "Qty", "Price", "Fees", "วันที่", ""].map(
                    (h) => (
                      <th key={h} className="px-3 py-2 font-medium">
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {rows.map((row) => {
                  const merged = { ...row.raw, ...row.edited };
                  const hasError = row.errors.length > 0;
                  return (
                    <tr key={row.id} className={hasError ? "bg-rose-950/20" : ""}>
                      <td className="px-2 py-1">
                        <Select
                          value={merged.broker ?? ""}
                          onChange={(e) => updateCell(row.id, "broker", e.target.value)}
                          className="h-7 text-xs"
                        >
                          <option value="Webull">Webull</option>
                          <option value="Dime">Dime</option>
                        </Select>
                      </td>
                      <td className="px-2 py-1">
                        <Input
                          value={merged.ticker ?? ""}
                          onChange={(e) => updateCell(row.id, "ticker", e.target.value)}
                          className="h-7 w-20 text-xs"
                        />
                      </td>
                      <td className="px-2 py-1">
                        <Select
                          value={merged.side ?? ""}
                          onChange={(e) => updateCell(row.id, "side", e.target.value)}
                          className="h-7 text-xs"
                        >
                          <option value="buy">buy</option>
                          <option value="sell">sell</option>
                        </Select>
                      </td>
                      <td className="px-2 py-1">
                        <Input
                          value={merged.qty ?? ""}
                          onChange={(e) => updateCell(row.id, "qty", e.target.value)}
                          className="h-7 w-20 text-xs"
                        />
                      </td>
                      <td className="px-2 py-1">
                        <Input
                          value={merged.price ?? ""}
                          onChange={(e) => updateCell(row.id, "price", e.target.value)}
                          className="h-7 w-20 text-xs"
                        />
                      </td>
                      <td className="px-2 py-1">
                        <Input
                          value={merged.fees ?? ""}
                          onChange={(e) => updateCell(row.id, "fees", e.target.value)}
                          className="h-7 w-16 text-xs"
                        />
                      </td>
                      <td className="px-2 py-1">
                        <Input
                          value={merged.executed_at ?? ""}
                          onChange={(e) =>
                            updateCell(row.id, "executed_at", e.target.value)
                          }
                          className="h-7 w-36 text-xs"
                        />
                      </td>
                      <td className="px-2 py-1">
                        {hasError ? (
                          <span
                            title={row.errors.map((e) => e.message).join("; ")}
                          >
                            <X className="h-4 w-4 text-rose-400" />
                          </span>
                        ) : (
                          <Check className="h-4 w-4 text-emerald-400" />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Button onClick={confirm} disabled={!allValid || importing}>
            {importing
              ? "กำลังนำเข้า..."
              : `ยืนยันนำเข้า ${rows.length} รายการ`}
          </Button>
        </div>
      )}
    </div>
  );
}
