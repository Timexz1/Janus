"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useStore } from "@/lib/store/hooks";
import { TransactionForm } from "@/components/transaction-form";
import { ImportTable } from "@/components/import-table";
import { Card } from "@/components/ui";

function NewTransactionInner() {
  const params = useSearchParams();
  const editId = params.get("id");
  const { accounts, transactions, hydrated } = useStore();
  const editTx = editId
    ? transactions.find((t) => t.id === editId)
    : undefined;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-lg font-semibold text-slate-100">
          {editId ? "แก้ไขรายการเทรด" : "เพิ่มรายการเทรด"}
        </h1>
        <p className="text-sm text-slate-500">
          {editId
            ? "ตรวจตัวเลขก่อนยืนยัน"
            : "อัปโหลดรูป แล้วตรวจ/แก้ในตารางก่อนบันทึก"}
        </p>
      </header>
      {hydrated ? (
        editId ? (
          <TransactionForm accounts={accounts} editTx={editTx} />
        ) : (
          <ImportTable accounts={accounts} />
        )
      ) : (
        <Card className="h-40 animate-pulse" />
      )}
    </div>
  );
}

export default function NewTransactionPage() {
  return (
    <Suspense fallback={<Card className="h-40 animate-pulse" />}>
      <NewTransactionInner />
    </Suspense>
  );
}
