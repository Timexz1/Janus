# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev          # dev server → http://localhost:3000
npm test             # run all tests once (vitest run)
npm run test:watch   # watch mode
npx tsc --noEmit     # type-check without emitting
npm run build        # production build
npm run lint         # ESLint

# Run a single test file
npx vitest run src/lib/engine/__tests__/acceptance.test.ts

# Database
npm run db:new       # create migration file (supabase migration new <name>)
npm run db:push      # apply migrations to cloud (supabase db push --include-all)
npm run db:status    # list applied migrations
```

## Architecture

**Engine-first design**: calculation code in `src/lib/` is pure TypeScript with no I/O dependencies. All money values use `decimal.js` — never native floats.

### Key invariants

- **Transactions are the source of truth.** Holdings, lots, and realized gain are always *derived* by replaying transactions through the FIFO engine (`src/lib/engine/fifo.ts`). Nothing is stored as a cached snapshot.
- **localStorage = synchronous cache; Supabase = durable source.** On login, `cloud.ts` hydrates localStorage from Supabase. Every write goes to localStorage first (synchronous, instant) then mirrors to Supabase (debounced, async). `runSuppressed()` suppresses the mirror during hydration to avoid write-loops.
- **Decimal strings throughout.** `StoredTransaction` fields (qty, price, fees, etc.) are `string`, not `number`. Always construct `Decimal` values with `D(str)` from `src/lib/money/decimal.ts`.

### Data flow

```
User action → local-store.ts (localStorage) → cloud.ts mirror → Supabase
                     ↓
              useStore() hook → page components
```

### Folder map

```
src/
├── app/              Next.js App Router pages + API routes
│   ├── api/prices/   Yahoo Finance proxy (avoids CORS)
│   ├── api/export/   CSV export
│   ├── api/ocr/      OCR provider routing
│   └── auth/         Supabase auth callbacks (login POST, OAuth callback)
├── components/       Shared UI (ui.tsx has all primitives)
├── lib/
│   ├── engine/       FIFO replay engine (pure, no I/O)
│   ├── tax/          Thai tax brackets + remittance gain-matching (pure)
│   ├── portfolio/    buildPortfolio(), extractSaleEvents() (pure)
│   ├── metrics/      XIRR, win rate, max drawdown (pure)
│   ├── prices/       Yahoo Finance fetchers + useLastPrices hook + Alpaca WebSocket
│   ├── store/        types.ts · local-store.ts · cloud.ts · hooks.ts
│   ├── import/       CSV/XLSX parsing + row validation
│   └── ocr/          OCR response parser + provider pricing
└── supabase/migrations/  SQL migrations applied via CI on push to master
```

### Brokers

Two supported brokers: `webull` and `dime`. Each is a row in the `public.brokers` table. `StoredTransaction.brokerId` references this. There are no per-user "accounts" — broker is stored directly on transactions.

### Tax logic

Thai capital gains tax applies only to gains *remitted back to Thailand* (ป.161/162). The `src/lib/tax/` engine matches sale events against remittances using one of three apportionment methods: `gain_first`, `pro_rata`, or `principal_first`. Tax year is Gregorian.

### Supabase RLS

Every table uses `(SELECT auth.uid()) = user_id` policies. Use `TO authenticated` with both `USING` and `WITH CHECK`. Never use `auth.role()` (deprecated).

### Price data

- Daily candles: Yahoo Finance via `/api/prices` (server-side, avoids CORS)
- Live quotes: Yahoo snapshot + optional Alpaca WebSocket stream
- FX rate: `USDTHB=X` from Yahoo via `useUsdThbRate()` hook, polled every 60 s

### Deployment

- Vercel auto-deploys on push to `master`
- GitHub Actions (`supabase-migrations.yml`) runs `supabase db push --include-all` on push to `master` when `supabase/migrations/**` changes
- Required Vercel env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`
