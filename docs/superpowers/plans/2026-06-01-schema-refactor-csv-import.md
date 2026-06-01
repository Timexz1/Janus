# Schema Refactor + CSV/XLSX Import — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace per-user `accounts` table with a shared `brokers` lookup, rename `accountId` → `brokerId` throughout, and add CSV/XLSX import with client-side preview + inline editing.

**Architecture:** Schema migration renames the column and drops the redundant table. All TypeScript types cascade from `StoredTransaction.brokerId`. New import feature uses PapaParse/SheetJS in the browser, validates rows, shows an editable preview table, then batch-inserts on confirm.

**Tech Stack:** Next.js 16 App Router, Supabase (PostgreSQL + JS client), PapaParse, SheetJS (xlsx), Zod, Vitest, Tailwind CSS

---

## File Map

### Modified
| File | Change |
|---|---|
| `src/lib/store/types.ts` | Remove `Account`, rename `StoredTransaction.accountId` → `brokerId` |
| `src/lib/store/local-store.ts` | Remove accounts storage/DEFAULT_ACCOUNTS/repairOrphan; update tx |
| `src/lib/store/cloud.ts` | Remove acc mappers; update `txToDb`/`txFromDb`; drop accounts hydration |
| `src/lib/store/hooks.ts` | Remove `accounts` state |
| `src/lib/import/dedupe.ts` | `TradeKeyFields.accountId` → `brokerId` |
| `src/lib/portfolio/portfolio.ts` | `buildPortfolio` drops `accounts` param; `Holding.accountId` → `brokerId` |
| `src/lib/sample-data.ts` | `accountId` → `brokerId` values |
| `src/components/transaction-form.tsx` | `accountId` → `brokerId`; remove `Account[]` prop |
| `src/components/import-table.tsx` | `accountId` → `brokerId`; remove `Account[]` prop |
| `src/app/transactions/page.tsx` | Update filter; add Import/Download buttons |
| `src/app/transactions/new/page.tsx` | Remove `accounts` prop from children |
| `src/app/holdings/page.tsx` | Remove `accounts` from `buildPortfolio` call |
| `src/app/page.tsx` | Remove `accounts` from `buildPortfolio` call |

### Created
| File | Purpose |
|---|---|
| `supabase/migrations/20260601140000_brokers_refactor.sql` | DB migration |
| `src/lib/import/parse.ts` | CSV/XLSX → raw row objects |
| `src/lib/import/validate.ts` | Row validation → `ImportRow` |
| `src/lib/import/__tests__/parse.test.ts` | parse unit tests |
| `src/lib/import/__tests__/validate.test.ts` | validate unit tests |
| `src/components/import-transactions.tsx` | File picker + preview table + confirm |
| `src/app/api/export/transactions/route.ts` | CSV download endpoint |

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/20260601140000_brokers_refactor.sql`

- [ ] **Step 1: Create migration file**

```bash
cd c:/01-dev/Janus
npx supabase migration new brokers_refactor
```

Expected: creates `supabase/migrations/20260601140000_brokers_refactor.sql` (timestamp may differ — rename to `20260601140000_brokers_refactor.sql`).

- [ ] **Step 2: Write migration SQL**

Replace the generated file content with:

```sql
-- 1. Shared brokers lookup (no user_id)
CREATE TABLE public.brokers (
  id           TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  currency     TEXT NOT NULL DEFAULT 'USD'
);

INSERT INTO public.brokers (id, display_name, currency) VALUES
  ('webull', 'Webull Thailand', 'USD'),
  ('dime',   'Dime! USD',       'USD');

-- 2. Add broker_id to transactions (nullable first for migration)
ALTER TABLE public.transactions ADD COLUMN broker_id TEXT REFERENCES public.brokers(id);

-- 3. Populate broker_id from existing accounts
UPDATE public.transactions t
SET broker_id = lower(a.broker)
FROM public.accounts a
WHERE t.account_id = a.id;

-- 4. Make broker_id NOT NULL now that it's populated
ALTER TABLE public.transactions ALTER COLUMN broker_id SET NOT NULL;

-- 5. Drop old column and table
ALTER TABLE public.transactions DROP COLUMN account_id;
DROP TABLE public.accounts;
```

- [ ] **Step 3: Apply migration to production**

```bash
npx supabase db push --include-all
```

Expected output: `Applying migration 20260601140000_brokers_refactor.sql`

- [ ] **Step 4: Verify**

In Supabase dashboard → SQL Editor, run:
```sql
SELECT id, broker_id, ticker FROM public.transactions LIMIT 5;
SELECT * FROM public.brokers;
```
Expected: `broker_id` column filled with `'webull'` or `'dime'`; brokers table has 2 rows.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260601140000_brokers_refactor.sql
git commit -m "feat(db): replace accounts table with shared brokers lookup"
```

---

## Task 2: Core Types

**Files:**
- Modify: `src/lib/store/types.ts`

- [ ] **Step 1: Update types.ts**

Remove the `Account` interface entirely. In `StoredTransaction`, rename `accountId` to `brokerId` and change its type:

```typescript
// DELETE this entire interface:
// export interface Account { ... }

export interface StoredTransaction {
  id: string;
  brokerId: string;   // was: accountId: string
  ticker: string;
  exchange: Exchange | null;
  side: Side;
  qty: string;
  price: string;
  stockValue: string | null;
  fees: string;
  couponsWaived: string | null;
  fxRate: string | null;
  thbCost: string | null;
  imagePath: string | null;
  executedAt: string;
  executedTz: string | null;
  createdAt: string;
}

export type TransactionInput = Omit<StoredTransaction, "id" | "createdAt">;
```

- [ ] **Step 2: Run tsc to see all broken references**

```bash
cd c:/01-dev/Janus && npx tsc --noEmit 2>&1 | head -60
```

Expected: many type errors about `accountId` and `Account` — these are the files to fix in subsequent tasks.

---

## Task 3: Local Store

**Files:**
- Modify: `src/lib/store/local-store.ts`

- [ ] **Step 1: Remove accounts storage and DEFAULT_ACCOUNTS**

Delete/replace these items in `local-store.ts`:
- Delete: `const ACCOUNTS_KEY = "janus.accounts.v1";`
- Delete: `export const DEFAULT_ACCOUNTS: Account[]` constant
- Remove `"accounts"` from `CloudTable` union type
- Remove `[ACCOUNTS_KEY]: "accounts"` from `KEY_TABLE`
- Delete: `export function getAccounts()` function
- Delete: `export function repairOrphanTransactions()` function
- In `loadSnapshot`, remove the `if (s.accounts)` branch and `accounts?` parameter
- In `clearLocalData`, remove `ACCOUNTS_KEY` from the array

Updated `CloudTable`:
```typescript
export type CloudTable =
  | "transactions"
  | "remittances"
  | "income_inputs"
  | "tax_settings"
  | "chart_states";
```

Updated `loadSnapshot` signature:
```typescript
export function loadSnapshot(s: {
  transactions?: StoredTransaction[];
  remittances?: Remittance[];
  income?: IncomeByYear;
  taxSettings?: Partial<TaxSettings>;
  chartStates?: Record<string, ChartState>;
}): void {
```

Updated `clearLocalData`:
```typescript
export function clearLocalData(): void {
  if (typeof window === "undefined") return;
  [TXNS_KEY, REMITTANCES_KEY, INCOME_KEY, TAX_SETTINGS_KEY, CHART_STATES_KEY].forEach((k) =>
    window.localStorage.removeItem(k),
  );
  window.dispatchEvent(new Event(STORE_CHANGE_EVENT));
}
```

- [ ] **Step 2: Run tsc**

```bash
npx tsc --noEmit 2>&1 | head -40
```

Expected: errors about `Account` import removed from `local-store.ts`; `types.ts` errors should decrease.

---

## Task 4: Cloud Sync

**Files:**
- Modify: `src/lib/store/cloud.ts`

- [ ] **Step 1: Remove account mappers and update tx mapper**

Delete `accToDb` and `accFromDb` functions entirely.

Update `txToDb`:
```typescript
const txToDb = (t: StoredTransaction, uid: string, withExtras: boolean): Row => {
  const row: Row = {
    id: t.id, user_id: uid, broker_id: t.brokerId, ticker: t.ticker, exchange: t.exchange,
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
```

Update `txFromDb`:
```typescript
const txFromDb = (r: Row): StoredTransaction => ({
  id: r.id as string, brokerId: r.broker_id as string, ticker: r.ticker as string,
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
```

- [ ] **Step 2: Update hydrate function**

Remove `acc` from the Promise.all and remove accounts loading:

```typescript
async function hydrate(sb: SupabaseClient, uid: string): Promise<void> {
  const [tx, rem, inc, ts, chart] = await Promise.all([
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
  loadSnapshot({
    transactions: ((tx.data ?? []) as Row[]).map(txFromDb),
    remittances: ((rem.data ?? []) as Row[]).map(remFromDb),
    income,
    taxSettings: ts.data ? tsFromDb(ts.data as Row) : undefined,
    chartStates,
  });
}
```

- [ ] **Step 3: Remove accounts from mirror function**

Find the `mirror` function and remove any reference to `"accounts"` table or `accToDb`.

- [ ] **Step 4: Fix imports**

Remove `Account`, `getAccounts`, `DEFAULT_ACCOUNTS` from imports at the top of `cloud.ts`.

- [ ] **Step 5: Run tsc**

```bash
npx tsc --noEmit 2>&1 | head -40
```

---

## Task 5: Hooks

**Files:**
- Modify: `src/lib/store/hooks.ts`

- [ ] **Step 1: Remove accounts from useStore**

Remove `Account` import, `getAccounts` import, `repairOrphanTransactions` import, `accounts` state, and `setAccounts` call:

```typescript
"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  StoredTransaction,
  Remittance,
  TaxSettings,
  IncomeByYear,
} from "./types";
import {
  getTransactions,
  getRemittances,
  getTaxSettings,
  getIncomeByYear,
  STORE_CHANGE_EVENT,
} from "./local-store";

export function useStore() {
  const [transactions, setTransactions] = useState<StoredTransaction[]>([]);
  const [remittances, setRemittances] = useState<Remittance[]>([]);
  const [taxSettings, setTaxSettings] = useState<TaxSettings | null>(null);
  const [incomeByYear, setIncomeByYear] = useState<IncomeByYear>({});
  const [hydrated, setHydrated] = useState(false);

  const refresh = useCallback(() => {
    setTransactions(getTransactions());
    setRemittances(getRemittances());
    setTaxSettings(getTaxSettings());
    setIncomeByYear(getIncomeByYear());
    setHydrated(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) refresh();
    });
    window.addEventListener(STORE_CHANGE_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      cancelled = true;
      window.removeEventListener(STORE_CHANGE_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [refresh]);

  return { transactions, remittances, taxSettings, incomeByYear, hydrated };
}
```

---

## Task 6: Portfolio + Dedupe

**Files:**
- Modify: `src/lib/portfolio/portfolio.ts`
- Modify: `src/lib/import/dedupe.ts`

- [ ] **Step 1: Update portfolio.ts — remove accounts param**

Change `buildPortfolio` signature and internals:

```typescript
// Remove: import type { Account, StoredTransaction } from "@/lib/store/types";
import type { StoredTransaction } from "@/lib/store/types";

// Change Holding.accountId → brokerId
export interface Holding {
  brokerId: string;   // was: accountId
  ticker: string;
  qty: Decimal;
  avgCost: Decimal;
  costValue: Decimal;
  realizedGain: Decimal;
}

// Change GroupError.accountId → brokerId
export interface GroupError {
  brokerId: string;   // was: accountId
  ticker: string;
  message: string;
}

// Change groupKey to use brokerId
function groupKey(brokerId: string, ticker: string): string {
  return `${brokerId}__${ticker}`;
}

// Remove accounts param from buildPortfolio
export function buildPortfolio(transactions: StoredTransaction[]): Portfolio {
  const groups = new Map<string, StoredTransaction[]>();
  for (const t of transactions) {
    const key = groupKey(t.brokerId, t.ticker);
    const list = groups.get(key);
    if (list) list.push(t);
    else groups.set(key, [t]);
  }

  // ... rest of function unchanged except:
  // const { accountId, ticker } = txns[0];  →  const { brokerId, ticker } = txns[0];
  // errors.push({ accountId, ... })  →  errors.push({ brokerId, ... })
  // holdings.push({ accountId, ... })  →  holdings.push({ brokerId, ... })
```

- [ ] **Step 2: Update dedupe.ts**

```typescript
export interface TradeKeyFields {
  brokerId: string;   // was: accountId
  ticker: string;
  side: string;
  qty: string;
  price: string;
  fees: string;
  executedAt: string;
}

export function tradeKey(t: TradeKeyFields): string {
  return [
    t.brokerId,        // was: t.accountId
    t.ticker.trim().toUpperCase(),
    t.side,
    norm(t.qty),
    norm(t.price),
    norm(t.fees),
    t.executedAt,
  ].join("|");
}
```

- [ ] **Step 3: Update dedupe test**

In `src/lib/import/__tests__/dedupe.test.ts`, replace `accountId` with `brokerId` in all test fixtures.

- [ ] **Step 4: Run tsc**

```bash
npx tsc --noEmit 2>&1 | head -40
```

---

## Task 7: Sample Data + UI Components

**Files:**
- Modify: `src/lib/sample-data.ts`
- Modify: `src/components/transaction-form.tsx`
- Modify: `src/components/import-table.tsx`
- Modify: `src/app/transactions/new/page.tsx`
- Modify: `src/app/holdings/page.tsx`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Update sample-data.ts**

Replace `accountId: "acc_webull"` → `brokerId: "webull"` and `accountId: "acc_dime"` → `brokerId: "dime"` throughout:

```typescript
const SAMPLE: StoredTransaction[] = [
  { id: "tx_sample_asts_buy", brokerId: "webull", ticker: "ASTS", ... },
  { id: "tx_sample_asts_sell", brokerId: "webull", ticker: "ASTS", ... },
  { id: "tx_sample_rdw_buy", brokerId: "dime", ticker: "RDW", ... },
];
```

- [ ] **Step 2: Update transaction-form.tsx**

In `schema`:
```typescript
brokerId: z.enum(["webull", "dime"]),   // was: accountId: z.string().min(1, ...)
```

In `toDefaults`:
```typescript
brokerId: tx?.brokerId ?? "webull",    // was: accountId: tx?.accountId ?? "acc_webull"
```

Remove `Account[]` prop, hardcode broker options:
```typescript
export function TransactionForm({ editTx }: { editTx?: StoredTransaction }) {
```

Replace the `<Select>` for account with:
```tsx
<Field label="โบรกเกอร์" htmlFor="brokerId">
  <Select id="brokerId" {...register("brokerId")}>
    <option value="webull">Webull Thailand</option>
    <option value="dime">Dime! USD</option>
  </Select>
</Field>
```

In submit handler, replace `accountId` → `brokerId` when constructing `TransactionInput`.

- [ ] **Step 3: Update import-table.tsx**

In `RowFields`:
```typescript
interface RowFields {
  brokerId: string;   // was: accountId
  ...
}
```

Remove `Account[]` prop from `ImportTable`. Replace account dropdown with hardcoded broker options (same as transaction-form above).

Update all `accountId` references within the component to `brokerId`.

Update `tradeKey` call:
```typescript
tradeKey({ brokerId: row.fields.brokerId, ... })  // was: accountId
```

- [ ] **Step 4: Update transactions/new/page.tsx**

Remove `accounts` from `useStore()` and props:
```typescript
const { transactions, hydrated } = useStore();
// ...
<TransactionForm editTx={editTx} />   // remove accounts prop
// ...
<ImportTable />                        // remove accounts prop
```

- [ ] **Step 5: Update holdings/page.tsx**

Find `buildPortfolio(accounts, transactions)` → `buildPortfolio(transactions)`.
Replace `holding.accountId` references with `holding.brokerId`.

- [ ] **Step 6: Update page.tsx (dashboard)**

Find `buildPortfolio(accounts, transactions)` → `buildPortfolio(transactions)`.
Remove `accounts` from `useStore()` destructuring.

- [ ] **Step 6b: Update charts/page.tsx and settings/page.tsx**

In both files, remove `accounts` from `useStore()` destructuring and remove any `Account`-typed variables or props. Run `grep -n "accounts" src/app/charts/page.tsx src/app/settings/page.tsx` to find exact lines.

- [ ] **Step 6c: Update import-table.tsx buildPortfolio call**

In `src/components/import-table.tsx`, find `buildPortfolio(accounts, transactions)` → `buildPortfolio(transactions)`.

- [ ] **Step 7: Run tsc — should be zero errors**

```bash
npx tsc --noEmit 2>&1
```

Expected: no output (zero errors).

- [ ] **Step 8: Run tests**

```bash
npm test
```

Expected: all existing tests pass.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "refactor: replace accounts with shared brokers (accountId → brokerId)"
```

---

## Task 8: Add Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install papaparse and xlsx**

```bash
cd c:/01-dev/Janus && npm install papaparse xlsx
npm install -D @types/papaparse
```

- [ ] **Step 2: Verify installation**

```bash
node -e "require('papaparse'); require('xlsx'); console.log('ok')"
```

Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add papaparse + xlsx for CSV/XLSX import"
```

---

## Task 9: Parse + Validate Libraries

**Files:**
- Create: `src/lib/import/parse.ts`
- Create: `src/lib/import/validate.ts`
- Create: `src/lib/import/__tests__/parse.test.ts`
- Create: `src/lib/import/__tests__/validate.test.ts`

- [ ] **Step 1: Write failing tests for parse.ts**

Create `src/lib/import/__tests__/parse.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { parseFile } from "../parse";

describe("parseFile CSV", () => {
  it("parses valid CSV rows", async () => {
    const csv = `broker,ticker,side,qty,price,fees,executed_at
Webull,AAPL,buy,10,185.23,0.5,2026-01-15 09:30:00`;
    const file = new File([csv], "test.csv", { type: "text/csv" });
    const rows = await parseFile(file);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      broker: "Webull",
      ticker: "AAPL",
      side: "buy",
      qty: "10",
      price: "185.23",
      fees: "0.5",
      executed_at: "2026-01-15 09:30:00",
    });
  });

  it("returns empty array for empty CSV", async () => {
    const file = new File(["broker,ticker,side,qty,price,fees,executed_at\n"], "empty.csv", { type: "text/csv" });
    const rows = await parseFile(file);
    expect(rows).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/import/__tests__/parse.test.ts
```

Expected: FAIL — `parseFile` not found.

- [ ] **Step 3: Write parse.ts**

Create `src/lib/import/parse.ts`:

```typescript
import Papa from "papaparse";
import * as XLSX from "xlsx";

export type RawRow = Record<string, string>;

export async function parseFile(file: File): Promise<RawRow[]> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    return parseXlsx(file);
  }
  return parseCsv(file);
}

function parseCsv(file: File): Promise<RawRow[]> {
  return new Promise((resolve, reject) => {
    Papa.parse<RawRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => resolve(results.data),
      error: (err) => reject(new Error(err.message)),
    });
  });
}

async function parseXlsx(file: File): Promise<RawRow[]> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json<RawRow>(ws, { defval: "", raw: false });
  return raw;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/import/__tests__/parse.test.ts
```

Expected: PASS.

- [ ] **Step 5: Write failing tests for validate.ts**

Create `src/lib/import/__tests__/validate.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { validateRow, type ValidatedRow } from "../validate";

describe("validateRow", () => {
  const valid = {
    broker: "Webull",
    ticker: "AAPL",
    side: "buy",
    qty: "10",
    price: "185.23",
    fees: "0.5",
    executed_at: "2026-01-15 09:30:00",
  };

  it("accepts a fully valid row", () => {
    const result = validateRow(valid);
    expect(result.errors).toHaveLength(0);
    expect(result.row.brokerId).toBe("webull");
    expect(result.row.ticker).toBe("AAPL");
    expect(result.row.side).toBe("buy");
  });

  it("normalises broker case-insensitively", () => {
    const result = validateRow({ ...valid, broker: "WEBULL" });
    expect(result.errors).toHaveLength(0);
    expect(result.row.brokerId).toBe("webull");
  });

  it("rejects unknown broker", () => {
    const result = validateRow({ ...valid, broker: "SomeBroker" });
    expect(result.errors.some((e) => e.field === "broker")).toBe(true);
  });

  it("rejects zero qty", () => {
    const result = validateRow({ ...valid, qty: "0" });
    expect(result.errors.some((e) => e.field === "qty")).toBe(true);
  });

  it("rejects negative fees", () => {
    const result = validateRow({ ...valid, fees: "-1" });
    expect(result.errors.some((e) => e.field === "fees")).toBe(true);
  });

  it("rejects invalid date", () => {
    const result = validateRow({ ...valid, executed_at: "not-a-date" });
    expect(result.errors.some((e) => e.field === "executed_at")).toBe(true);
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

```bash
npx vitest run src/lib/import/__tests__/validate.test.ts
```

Expected: FAIL — `validateRow` not found.

- [ ] **Step 7: Write validate.ts**

Create `src/lib/import/validate.ts`:

```typescript
import { Decimal } from "@/lib/money/decimal";
import type { RawRow } from "./parse";

export interface RowError {
  field: string;
  message: string;
}

export interface ValidatedRow {
  brokerId: string;
  ticker: string;
  exchange: "NYSE" | "NASDAQ" | "OTHER";
  side: "buy" | "sell";
  qty: string;
  price: string;
  stockValue: string | null;
  fees: string;
  couponsWaived: string | null;
  fxRate: string | null;
  thbCost: string | null;
  executedAt: string;
  executedTz: string | null;
}

export interface ValidationResult {
  row: ValidatedRow;
  errors: RowError[];
}

const BROKER_MAP: Record<string, string> = {
  webull: "webull",
  dime: "dime",
};

function isPosDecimal(v: string): boolean {
  if (!v?.trim()) return false;
  try { return new Decimal(v).gt(0); } catch { return false; }
}

function isNonNegDecimal(v: string): boolean {
  if (!v?.trim()) return false;
  try { return new Decimal(v).gte(0); } catch { return false; }
}

function isOptDecimal(v: string | undefined): boolean {
  if (!v?.trim()) return true;
  return isNonNegDecimal(v);
}

function toIso(raw: string): string | null {
  if (!raw?.trim()) return null;
  const d = new Date(raw.trim().replace(" ", "T"));
  return isNaN(d.getTime()) ? null : d.toISOString();
}

export function validateRow(raw: RawRow): ValidationResult {
  const errors: RowError[] = [];

  const brokerKey = (raw.broker ?? "").toLowerCase().trim();
  const brokerId = BROKER_MAP[brokerKey] ?? null;
  if (!brokerId) errors.push({ field: "broker", message: `โบรกเกอร์ไม่รู้จัก: "${raw.broker}" (ต้องเป็น Webull หรือ Dime)` });

  const ticker = (raw.ticker ?? "").trim().toUpperCase();
  if (!ticker) errors.push({ field: "ticker", message: "ต้องระบุ ticker" });

  const side = (raw.side ?? "").toLowerCase().trim();
  if (side !== "buy" && side !== "sell") errors.push({ field: "side", message: "side ต้องเป็น buy หรือ sell" });

  if (!isPosDecimal(raw.qty)) errors.push({ field: "qty", message: "qty ต้องเป็นตัวเลข > 0" });
  if (!isPosDecimal(raw.price)) errors.push({ field: "price", message: "price ต้องเป็นตัวเลข > 0" });
  if (!isNonNegDecimal(raw.fees ?? "0")) errors.push({ field: "fees", message: "fees ต้องเป็นตัวเลข ≥ 0" });

  const executedAt = toIso(raw.executed_at ?? "");
  if (!executedAt) errors.push({ field: "executed_at", message: "วันเวลาไม่ถูกต้อง (ใช้รูปแบบ YYYY-MM-DD HH:mm:ss)" });

  const exchange = (["NYSE", "NASDAQ", "OTHER"].includes((raw.exchange ?? "").toUpperCase())
    ? (raw.exchange ?? "").toUpperCase()
    : "OTHER") as "NYSE" | "NASDAQ" | "OTHER";

  return {
    errors,
    row: {
      brokerId: brokerId ?? "webull",
      ticker,
      exchange,
      side: (side === "buy" || side === "sell" ? side : "buy"),
      qty: raw.qty ?? "",
      price: raw.price ?? "",
      stockValue: raw.stock_value?.trim() || null,
      fees: raw.fees ?? "0",
      couponsWaived: raw.coupons_waived?.trim() || null,
      fxRate: raw.fx_rate?.trim() || null,
      thbCost: raw.thb_cost?.trim() || null,
      executedAt: executedAt ?? "",
      executedTz: raw.executed_tz?.trim() || null,
    },
  };
}
```

- [ ] **Step 8: Run tests**

```bash
npx vitest run src/lib/import/__tests__/validate.test.ts
```

Expected: all 6 tests PASS.

- [ ] **Step 9: Commit**

```bash
git add src/lib/import/parse.ts src/lib/import/validate.ts src/lib/import/__tests__/
git commit -m "feat(import): add CSV/XLSX parse + validation libs"
```

---

## Task 10: Export API Route

**Files:**
- Create: `src/app/api/export/transactions/route.ts`

- [ ] **Step 1: Write the export route**

Create `src/app/api/export/transactions/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

const HEADERS = [
  "broker", "ticker", "side", "qty", "price", "fees", "executed_at",
  "exchange", "stock_value", "coupons_waived", "fx_rate", "thb_cost", "executed_tz",
];

type TxRow = Record<string, unknown>;

function toCsvRow(r: TxRow, brokerMap: Record<string, string>): string {
  const broker = brokerMap[r.broker_id as string] ?? String(r.broker_id);
  const values = [
    broker,
    r.ticker,
    r.side,
    r.qty,
    r.price,
    r.fees ?? "0",
    (r.executed_at as string)?.replace("T", " ").replace(/\.\d+Z$/, ""),
    r.exchange ?? "",
    r.stock_value ?? "",
    r.coupons_waived ?? "",
    r.fx_rate ?? "",
    r.thb_cost ?? "",
    r.executed_tz ?? "",
  ].map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`);
  return values.join(",");
}

const TEMPLATE_ROW = `"Webull","AAPL","buy","10","185.23","0.50","2026-01-15 09:30:00","NASDAQ","","","",""`;

export async function GET() {
  const supabase = await createServerSupabase();

  if (!supabase) {
    const csv = [HEADERS.join(","), TEMPLATE_ROW].join("\n");
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="transactions-sample.csv"',
      },
    });
  }

  const { data: user } = await supabase.auth.getUser();
  if (!user.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [{ data: txRows }, { data: brokers }] = await Promise.all([
    supabase.from("transactions").select("*").order("executed_at"),
    supabase.from("brokers").select("id, display_name"),
  ]);

  const brokerMap: Record<string, string> = {};
  for (const b of brokers ?? []) brokerMap[b.id] = b.display_name;

  const rows = (txRows ?? []) as TxRow[];
  const lines = [HEADERS.join(","), ...rows.map((r) => toCsvRow(r, brokerMap))];
  const csv = lines.join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="transactions-sample.csv"',
    },
  });
}
```

- [ ] **Step 2: Test manually**

Start dev server and visit `http://localhost:3000/api/export/transactions` — should download a CSV file.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/export/transactions/route.ts
git commit -m "feat(api): add CSV export endpoint for transactions"
```

---

## Task 11: Import UI Component

**Files:**
- Create: `src/components/import-transactions.tsx`

- [ ] **Step 1: Write the component**

Create `src/components/import-transactions.tsx`:

```typescript
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
        const merged = { ...r.raw, ...r.edited, [field]: value };
        const { row: validated, errors } = validateRow(merged);
        return { ...r, edited: { ...r.edited, [field]: value }, validated, errors };
      }),
    );
  }

  async function confirm() {
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
                  {["โบรก", "Ticker", "Side", "Qty", "Price", "Fees", "วันที่", ""].map((h) => (
                    <th key={h} className="px-3 py-2 font-medium">{h}</th>
                  ))}
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
                        <Input value={merged.ticker ?? ""} onChange={(e) => updateCell(row.id, "ticker", e.target.value)} className="h-7 w-20 text-xs" />
                      </td>
                      <td className="px-2 py-1">
                        <Select value={merged.side ?? ""} onChange={(e) => updateCell(row.id, "side", e.target.value)} className="h-7 text-xs">
                          <option value="buy">buy</option>
                          <option value="sell">sell</option>
                        </Select>
                      </td>
                      <td className="px-2 py-1">
                        <Input value={merged.qty ?? ""} onChange={(e) => updateCell(row.id, "qty", e.target.value)} className="h-7 w-20 text-xs" />
                      </td>
                      <td className="px-2 py-1">
                        <Input value={merged.price ?? ""} onChange={(e) => updateCell(row.id, "price", e.target.value)} className="h-7 w-20 text-xs" />
                      </td>
                      <td className="px-2 py-1">
                        <Input value={merged.fees ?? ""} onChange={(e) => updateCell(row.id, "fees", e.target.value)} className="h-7 w-16 text-xs" />
                      </td>
                      <td className="px-2 py-1">
                        <Input value={merged.executed_at ?? ""} onChange={(e) => updateCell(row.id, "executed_at", e.target.value)} className="h-7 w-36 text-xs" />
                      </td>
                      <td className="px-2 py-1">
                        {hasError ? (
                          <span title={row.errors.map((e) => e.message).join("; ")}>
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
            {importing ? "กำลังนำเข้า..." : `ยืนยันนำเข้า ${rows.length} รายการ`}
          </Button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/import-transactions.tsx
git commit -m "feat(ui): add ImportTransactions component with preview + inline edit"
```

---

## Task 12: Wire Up in Transactions Page

**Files:**
- Modify: `src/app/transactions/page.tsx`

- [ ] **Step 1: Add ImportTransactions to transactions page**

Import the component and add the buttons to the header:

```typescript
import { ImportTransactions } from "@/components/import-transactions";
```

Replace the current header button section:
```tsx
<header className="flex items-end justify-between gap-2">
  <div>
    <h1 className="text-lg font-semibold text-slate-100">{t("transactions.title")}</h1>
    <p className="mt-1 text-sm text-slate-500">
      แก้ไข/ลบได้ — ระบบจะคำนวณต้นทุนและกำไรใหม่อัตโนมัติ
    </p>
  </div>
  <div className="flex shrink-0 gap-2">
    <Link href="/transactions/new">
      <Button>
        <Plus className="h-4 w-4" aria-hidden /> เพิ่มรายการ
      </Button>
    </Link>
    <ImportTransactions />
  </div>
</header>
```

- [ ] **Step 2: Update broker filter**

Remove `accounts` from `useStore()`. Change the account filter to use `brokerId`:

```typescript
const { transactions, hydrated } = useStore();
const [brokerFilter, setBrokerFilter] = useState("all");
```

Update the filter logic:
```typescript
.filter((t) => brokerFilter === "all" || t.brokerId === brokerFilter)
```

Update the broker display helper:
```typescript
const BROKER_LABELS: Record<string, string> = { webull: "Webull", dime: "Dime" };
const brokerLabel = (id: string) => BROKER_LABELS[id] ?? id;
```

Update the filter Select:
```tsx
<Select value={brokerFilter} onChange={(e) => setBrokerFilter(e.target.value)}>
  <option value="all">ทุกโบรกเกอร์</option>
  <option value="webull">Webull</option>
  <option value="dime">Dime</option>
</Select>
```

Update table cell:
```tsx
<td className="px-4 py-3 text-slate-400">{brokerLabel(t.brokerId)}</td>
```

- [ ] **Step 3: Commit**

```bash
git add src/app/transactions/page.tsx
git commit -m "feat(transactions): add import buttons + broker filter"
```

---

## Task 13: Final Verification

- [ ] **Step 1: Run full test suite**

```bash
cd c:/01-dev/Janus && npm test
```

Expected: all tests pass.

- [ ] **Step 2: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 3: Build**

```bash
npm run build
```

Expected: build succeeds, no errors.

- [ ] **Step 4: Test import flow manually**

1. Start dev server: `npm run dev`
2. Login at `http://localhost:3000/login`
3. Go to `/transactions` — verify "นำเข้าไฟล์" and "ตัวอย่าง CSV" buttons appear
4. Click "ตัวอย่าง CSV" — verify CSV downloads with correct columns
5. Upload the downloaded CSV — verify preview table shows all rows valid
6. Edit a row to be invalid (e.g. `qty = abc`) — verify row turns red
7. Fix it — verify row turns green
8. Click "ยืนยันนำเข้า" — verify transactions appear in the list

- [ ] **Step 5: Push to master and verify Vercel deploy**

```bash
git checkout develop
git merge master --ff-only || git merge master
# If on develop branch already:
git checkout master
git merge develop --ff-only
git push origin master
```

Expected: Vercel triggers new deployment successfully.
