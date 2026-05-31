"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getAccounts,
  getTransactions,
  getRemittances,
  getIncomeByYear,
  getTaxSettings,
  getChartStates,
  setCloudMirror,
  loadSnapshot,
  clearLocalData,
  DEFAULT_ACCOUNTS,
  type CloudTable,
} from "./local-store";
import type {
  Account,
  StoredTransaction,
  Remittance,
  IncomeByYear,
  TaxSettings,
  ChartState,
  ChartDrawing,
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

// `withExtras` adds the newer columns (fx_rate/thb_cost/image_path). It is only
// turned on when at least one local transaction actually uses them, so a cloud DB
// that has not run the migration yet still syncs plain USD trades instead of
// failing the whole batch on an unknown column.
const txToDb = (t: StoredTransaction, uid: string, withExtras: boolean): Row => {
  const row: Row = {
    id: t.id, user_id: uid, account_id: t.accountId, ticker: t.ticker, exchange: t.exchange,
    side: t.side, qty: t.qty, price: t.price, stock_value: t.stockValue, fees: t.fees,
    coupons_waived: t.couponsWaived, executed_at: t.executedAt, executed_tz: t.executedTz,
    created_at: t.createdAt,
  };
  if (withExtras) {
    row.fx_rate = t.fxRate;
    row.thb_cost = t.thbCost;
    row.image_path = t.imagePath;
  }
  return row;
};
const txFromDb = (r: Row): StoredTransaction => ({
  id: r.id as string, accountId: r.account_id as string, ticker: r.ticker as string,
  exchange: (r.exchange as StoredTransaction["exchange"]) ?? null,
  side: r.side as StoredTransaction["side"],
  qty: String(r.qty), price: String(r.price),
  stockValue: r.stock_value == null ? null : String(r.stock_value),
  fees: String(r.fees),
  couponsWaived: r.coupons_waived == null ? null : String(r.coupons_waived),
  fxRate: r.fx_rate == null ? null : String(r.fx_rate),
  thbCost: r.thb_cost == null ? null : String(r.thb_cost),
  imagePath: (r.image_path as string) ?? null,
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

const chartStateToDb = (s: ChartState, uid: string): Row => ({
  user_id: uid,
  ticker: s.ticker,
  period: s.period,
  timeframe: s.timeframe,
  drawings: s.drawings,
  updated_at: s.updatedAt,
});
const chartStateFromDb = (r: Row): ChartState => ({
  ticker: r.ticker as string,
  period: (r.period as ChartState["period"]) ?? "1Y",
  timeframe: (r.timeframe as ChartState["timeframe"]) ?? "D",
  drawings: Array.isArray(r.drawings) ? (r.drawings as ChartDrawing[]) : [],
  updatedAt: (r.updated_at as string) ?? new Date().toISOString(),
});

// --- hydrate ---------------------------------------------------------------
async function hydrate(sb: SupabaseClient, uid: string): Promise<void> {
  const [acc, tx, rem, inc, ts, chart] = await Promise.all([
    sb.from("accounts").select("*"),
    sb.from("transactions").select("*"),
    sb.from("remittances").select("*"),
    sb.from("income_inputs").select("*"),
    sb.from("tax_settings").select("*").eq("user_id", uid).maybeSingle(),
    sb.from("chart_states").select("*"),
  ]);
  const income: IncomeByYear = {};
  for (const r of (inc.data ?? []) as Row[]) income[r.tax_year as number] = String(r.other_income_thb);
  const chartStates: Record<string, ChartState> = {};
  for (const r of (chart.data ?? []) as Row[]) {
    const state = chartStateFromDb(r);
    chartStates[state.ticker] = state;
  }
  // A user must always have at least the default broker accounts (the signup
  // trigger seeds them). If the cloud copy comes back empty — e.g. wiped by the
  // old delMissing bug, or read before the trigger committed — restore the
  // defaults locally so the transactions FK target always exists.
  const cloudAccounts = ((acc.data ?? []) as Row[]).map(accFromDb);
  loadSnapshot({
    accounts: cloudAccounts.length ? cloudAccounts : DEFAULT_ACCOUNTS,
    transactions: ((tx.data ?? []) as Row[]).map(txFromDb),
    remittances: ((rem.data ?? []) as Row[]).map(remFromDb),
    income,
    taxSettings: ts.data ? tsFromDb(ts.data as Row) : undefined,
    chartStates,
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
  // An empty local set must NOT wipe the cloud: that is almost always a transient
  // state (mid-hydration / before login settled), and deleting here once erased
  // the seeded accounts and broke the transactions FK. Skip when there is nothing
  // to keep — real deletions always leave at least the surviving rows in `ids`.
  if (ids.length === 0) return;
  // ids are app-generated [a-z0-9_] tokens — safe unquoted in the PostgREST list.
  await run(sb.from(table).delete().eq("user_id", uid).not("id", "in", `(${ids.join(",")})`));
}

async function mirrorNow(sb: SupabaseClient, uid: string, table: CloudTable) {
  if (table === "accounts") {
    const rows = getAccounts().map((a) => accToDb(a, uid));
    if (rows.length) await run(sb.from("accounts").upsert(rows, { onConflict: "user_id,id" }));
    await delMissing(sb, "accounts", uid, rows.map((r) => r.id as string));
  } else if (table === "transactions") {
    // Ensure FK targets exist on cloud first: a transaction references an account
    // by (user_id, account_id), and the accounts mirror may not have pushed yet
    // (or the row was wiped). Upserting accounts here keeps the FK satisfiable.
    const accs = getAccounts().map((a) => accToDb(a, uid));
    if (accs.length) await run(sb.from("accounts").upsert(accs, { onConflict: "user_id,id" }));
    const txns = getTransactions();
    const withExtras = txns.some(
      (t) => t.fxRate != null || t.thbCost != null || t.imagePath != null,
    );
    const rows = txns.map((t) => txToDb(t, uid, withExtras));
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
    // same guard as delMissing: an empty set must not wipe the whole table.
    if (years.length) {
      await run(
        sb.from("income_inputs").delete().eq("user_id", uid).not("tax_year", "in", `(${years.join(",")})`),
      );
    }
  } else if (table === "tax_settings") {
    await run(sb.from("tax_settings").upsert(tsToDb(getTaxSettings(), uid), { onConflict: "user_id" }));
  } else if (table === "chart_states") {
    const states = getChartStates();
    const rows = Object.values(states).map((s) => chartStateToDb(s, uid));
    if (rows.length) await run(sb.from("chart_states").upsert(rows, { onConflict: "user_id,ticker" }));
  }
}

const timers: Partial<Record<CloudTable, ReturnType<typeof setTimeout>>> = {};
function scheduleMirror(sb: SupabaseClient, uid: string, table: CloudTable) {
  if (timers[table]) clearTimeout(timers[table]);
  timers[table] = setTimeout(() => {
    // Background sync is best-effort — log as a warning (not console.error, which
    // pops the Next.js dev error overlay) so a transient/pre-migration failure
    // never interrupts the user. Real data integrity is protected by RLS + the
    // hydrate-on-login reconciliation.
    mirrorNow(sb, uid, table).catch((e) =>
      console.warn("cloud sync failed:", table, e),
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
