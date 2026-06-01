# Schema Refactor + CSV/XLSX Import — Design Spec

**Date:** 2026-06-01  
**Status:** Approved  
**Scope:** Remove redundant per-user accounts, add shared brokers table, add CSV/XLSX import with preview + inline editing

---

## Background

The `accounts` table currently creates 2 rows (Webull + Dime) for every user on signup, causing 100 users → 200 identical rows. All users share the same 2 brokers with identical labels, so per-user account rows provide no value.

---

## 1. Schema Changes

### Remove
- `accounts` table (all rows)
- `transactions.account_id` column

### Add: `brokers` table
Shared lookup — 2 rows, never changes, no `user_id`.

```sql
CREATE TABLE public.brokers (
  id           TEXT PRIMARY KEY,        -- 'webull' | 'dime'
  display_name TEXT NOT NULL,           -- 'Webull Thailand' | 'Dime! USD'
  currency     TEXT NOT NULL DEFAULT 'USD'
);

INSERT INTO public.brokers VALUES
  ('webull', 'Webull Thailand', 'USD'),
  ('dime',   'Dime! USD',       'USD');
```

No RLS needed — brokers is a public read-only reference table.

### Modify: `transactions` table
Replace `account_id TEXT` with `broker_id TEXT NOT NULL REFERENCES public.brokers(id)`.

### Migration of existing data
Map existing `account_id` → `broker_id` by joining through `accounts.broker`:
```sql
-- run before dropping accounts
UPDATE public.transactions t
SET broker_id = lower(a.broker)
FROM public.accounts a
WHERE t.account_id = a.id;
```
Then drop `accounts` table and `account_id` column.

---

## 2. CSV/XLSX Format

### Required columns
| Column | Type | Values |
|---|---|---|
| `broker` | text | `Webull` \| `Dime` |
| `ticker` | text | e.g. `AAPL` |
| `side` | text | `buy` \| `sell` |
| `qty` | number | positive decimal |
| `price` | number | USD, positive |
| `fees` | number | USD, ≥ 0 |
| `executed_at` | datetime | `YYYY-MM-DD HH:mm:ss` |

### Optional columns
`exchange`, `stock_value`, `coupons_waived`, `fx_rate`, `thb_cost`, `executed_tz`

No `image_path` — imports never carry screenshots.

### Sample file
Generated from the authenticated user's existing transactions via `GET /api/export/transactions`. Format: CSV with header row. The download button on `/transactions` triggers this endpoint directly (no page navigation).

---

## 3. UI Changes

### `/transactions` page — button bar
```
[+ เพิ่มรายการ]   [↑ นำเข้าไฟล์]   [↓ ตัวอย่าง CSV]
```

### Import flow
1. Click "นำเข้าไฟล์" → `<input type="file" accept=".csv,.xlsx">` (hidden, triggered by button)
2. Parse client-side: PapaParse (CSV) or SheetJS/xlsx (XLSX)
3. Map columns → validate each row against transaction rules
4. Show preview table:
   - Valid rows: normal display
   - Invalid rows: red highlight, editable cells, error tooltip per cell
5. "ยืนยันนำเข้า N รายการ" button — enabled only when **all** rows pass validation
6. On confirm: batch `INSERT` via Supabase JS client → show success toast with count

### Validation rules (same as `/transactions/new`)
- `broker` must be `webull` or `dime` (case-insensitive)
- `ticker` non-empty string
- `side` must be `buy` or `sell`
- `qty` > 0, finite number
- `price` > 0, finite number
- `fees` ≥ 0, finite number
- `executed_at` valid parseable datetime

### Export (sample download)
`GET /api/export/transactions` — server route that:
1. Queries `transactions` for the authenticated user
2. Joins `brokers` to get display name
3. Returns CSV with `Content-Disposition: attachment; filename="transactions-sample.csv"`
4. Falls back to static empty-template CSV if user has no transactions

---

## 4. New Files

| File | Purpose |
|---|---|
| `src/app/api/export/transactions/route.ts` | CSV export API route |
| `src/components/import-transactions.tsx` | Import button + file picker + preview table |
| `src/lib/import/parse.ts` | CSV/XLSX → row objects (PapaParse + SheetJS) |
| `src/lib/import/validate.ts` | Row validation logic |
| `supabase/migrations/YYYYMMDD_brokers_refactor.sql` | Schema migration |

---

## 5. Dependencies to Add

- `papaparse` + `@types/papaparse` — CSV parsing
- `xlsx` (SheetJS community edition) — XLSX parsing

---

## 6. Out of Scope

- Custom account labels per user (YAGNI)
- Server-side validation of import data
- Image/screenshot import
- Multi-sheet XLSX support
