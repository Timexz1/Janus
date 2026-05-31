"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getAccounts,
  getTransactions,
  getRemittances,
  getIncomeByYear,
  getTaxSettings,
  setCloudMirror,
  loadSnapshot,
  clearLocalData,
  type CloudTable,
} from "./local-store";
import type {
  Account,
  StoredTransaction,
  Remittance,
  IncomeByYear,
  TaxSettings,
} from "./types";

/**
 * Cloud sync: localStorage is the synchronous cache; Supabase is the durable,
 * per-user, RLS-protected source of truth. On login we hydrate the cache from
 * Supabase; every mutation mirrors the affected table back (debounced). Numeric
 * columns round-trip as strings (PostgREST default), matching the local store.
 * API keys are never synced — they stay device-local.
 */

// --- mappers (text id = same id local & cloud) ----------------------------
type Row = Record<string, unknown>;

const accToDb = (a: Account, uid: string): Row => ({
  id: a.id, user_id: uid, broker: a.broker, account_label: a.accountLabel, currency: a.currency,
});
const accFromDb = (r: Row): Account => ({
  id: r.id as string, broker: r.broker as string,
  accountLabel: r.account_label as string, currency: r.currency as string,
});

const txToDb = (t: StoredTransaction, uid: string): Row => ({
  id: t.id, user_id: uid, account_id: t.accountId, ticker: t.ticker, exchange: t.exchange,
  side: t.side, qty: t.qty, price: t.price, stock_value: t.stockValue, fees: t.fees,
  coupons_waived: t.couponsWaived, executed_at: t.executedAt, executed_tz: t.executedTz,
  created_at: t.createdAt,
});
const txFromDb = (r: Row): StoredTransaction => ({
  id: r.id as string, accountId: r.account_id as string, ticker: r.ticker as string,
  exchange: (r.exchange as StoredTransaction["exchange"]) ?? null,
  side: r.side as StoredTransaction["side"],
  qty: String(r.qty), price: String(r.price),
  stockValue: r.stock_value == null ? null : String(r.stock_value),
  fees: String(r.fees),
  couponsWaived: r.coupons_waived == null ? null : String(r.coupons_waived),
  executedAt: r.executed_at as string, executedTz: (r.executed_tz as string) ?? null,
  createdAt: r.created_at as string,
});

const remToDb = (r: Remittance, uid: string): Row => ({
  id: r.id, user_id: uid, date: r.date, direction: r.direction,
  amount_usd: r.amountUsd, fx_rate: r.fxRate, note: r.note, created_at: r.createdAt,
});
const remFromDb = (r: Row): Remittance => ({
  id: r.id as string, date: r.date as string,
  direction: (r.direction as Remittance["direction"]) ?? "inbound",
  amountUsd: String(r.amount_usd), fxRate: String(r.fx_rate),
  note: (r.note as string) ?? null, createdAt: r.created_at as string,
});

const tsToDb = (s: TaxSettings, uid: string): Row => ({
  user_id: uid, apportionment_method: s.apportionmentMethod,
  personal_allowance: s.personalAllowance, tax_year: s.taxYear,
  show_metrics: s.showMetrics, ocr_enabled: s.ocrEnabled,
  ocr_provider: s.ocrProvider, claude_model: s.claudeModel,
});
const tsFromDb = (r: Row): Partial<TaxSettings> => ({
  apportionmentMethod: r.apportionment_method as TaxSettings["apportionmentMethod"],
  personalAllowance: String(r.personal_allowance), taxYear: r.tax_year as number,
  showMetrics: r.show_metrics as boolean, ocrEnabled: r.ocr_enabled as boolean,
  ocrProvider: r.ocr_provider as TaxSettings["ocrProvider"],
  claudeModel: r.claude_model as string,
});

// --- hydrate ---------------------------------------------------------------
async function hydrate(sb: SupabaseClient, uid: string): Promise<void> {
  const [acc, tx, rem, inc, ts] = await Promise.all([
    sb.from("accounts").select("*"),
    sb.from("transactions").select("*"),
    sb.from("remittances").select("*"),
    sb.from("income_inputs").select("*"),
    sb.from("tax_settings").select("*").eq("user_id", uid).maybeSingle(),
  ]);
  const income: IncomeByYear = {};
  for (const r of (inc.data ?? []) as Row[]) income[r.tax_year as number] = String(r.other_income_thb);
  loadSnapshot({
    accounts: ((acc.data ?? []) as Row[]).map(accFromDb),
    transactions: ((tx.data ?? []) as Row[]).map(txFromDb),
    remittances: ((rem.data ?? []) as Row[]).map(remFromDb),
    income,
    taxSettings: ts.data ? tsFromDb(ts.data as Row) : undefined,
  });
}

// --- mirror (upsert all + delete missing) ----------------------------------
// supabase-js returns { error } instead of throwing — surface it so failures
// (RLS, FK, type) are visible, not silently swallowed.
async function run(p: PromiseLike<{ error: unknown }>) {
  const { error } = await p;
  if (error) throw error;
}

async function delMissing(sb: SupabaseClient, table: string, uid: string, ids: string[]) {
  // ids are app-generated [a-z0-9_] tokens — safe unquoted in the PostgREST list.
  let q = sb.from(table).delete().eq("user_id", uid);
  if (ids.length) q = q.not("id", "in", `(${ids.join(",")})`);
  await run(q);
}

async function mirrorNow(sb: SupabaseClient, uid: string, table: CloudTable) {
  if (table === "accounts") {
    const rows = getAccounts().map((a) => accToDb(a, uid));
    if (rows.length) await run(sb.from("accounts").upsert(rows, { onConflict: "user_id,id" }));
    await delMissing(sb, "accounts", uid, rows.map((r) => r.id as string));
  } else if (table === "transactions") {
    const rows = getTransactions().map((t) => txToDb(t, uid));
    if (rows.length) await run(sb.from("transactions").upsert(rows, { onConflict: "id" }));
    await delMissing(sb, "transactions", uid, rows.map((r) => r.id as string));
  } else if (table === "remittances") {
    const rows = getRemittances().map((r) => remToDb(r, uid));
    if (rows.length) await run(sb.from("remittances").upsert(rows, { onConflict: "id" }));
    await delMissing(sb, "remittances", uid, rows.map((r) => r.id as string));
  } else if (table === "income_inputs") {
    const inc = getIncomeByYear();
    const rows = Object.entries(inc).map(([y, v]) => ({
      user_id: uid, tax_year: Number(y), other_income_thb: String(v),
    }));
    if (rows.length) await run(sb.from("income_inputs").upsert(rows, { onConflict: "user_id,tax_year" }));
    const years = rows.map((r) => r.tax_year);
    let q = sb.from("income_inputs").delete().eq("user_id", uid);
    if (years.length) q = q.not("tax_year", "in", `(${years.join(",")})`);
    await run(q);
  } else if (table === "tax_settings") {
    await run(sb.from("tax_settings").upsert(tsToDb(getTaxSettings(), uid), { onConflict: "user_id" }));
  }
}

const timers: Partial<Record<CloudTable, ReturnType<typeof setTimeout>>> = {};
function scheduleMirror(sb: SupabaseClient, uid: string, table: CloudTable) {
  if (timers[table]) clearTimeout(timers[table]);
  timers[table] = setTimeout(() => {
    mirrorNow(sb, uid, table).catch((e) =>
      console.error("cloud sync failed:", table, e),
    );
  }, 200);
}

export async function startCloudSync(sb: SupabaseClient, uid: string): Promise<void> {
  setCloudMirror((table) => scheduleMirror(sb, uid, table));
  await hydrate(sb, uid);
}

export function stopCloudSync(): void {
  setCloudMirror(null);
  for (const t of Object.values(timers)) if (t) clearTimeout(t);
  clearLocalData();
}
