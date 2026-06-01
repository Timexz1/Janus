# Holdings Page Redesign — Design Spec

**Date:** 2026-06-01  
**Status:** Approved

## Summary

Redesign the holdings page to a Webull-inspired hybrid layout: summary stats on top, expandable table below. Each row has a stock logo (TradingView CDN), new data columns, and expands on click to show FIFO lots + link to transactions.

---

## 1. New Data Columns (Table)

Remove: **Bid / Ask** (move to expanded row)

Add:
| Column | Formula |
|---|---|
| Logo (in ticker cell) | `https://s3-symbol-logo.tradingview.com/{ticker.toLowerCase()}.svg` |
| Market state badge | `quote.marketState` → PRE / REGULAR / POST / CLOSED |
| Cost Value | `holding.costValue` (total $ invested) |
| % Today | `(last − previousClose) / previousClose × 100` |
| % Unrealized | `upl / costValue × 100` |
| % Weight | `mv / totalPortfolioMV × 100` |

---

## 2. Summary Stats Cards

Current: ต้นทุนรวม / มูลค่าตลาด / ยังไม่เกิด / realized  
Add: **% Unrealized return** + **จำนวน positions**

---

## 3. Expanded Row

Click any row → inline sub-table shows:
- **Lots**: openedAt, qty remaining, cost/share, current price, unrealized P/L per lot
- **Bid × Size / Ask × Size** from quote  
- Button: `ดูประวัติ transactions →` links to `/transactions`

---

## 4. Components

| File | Purpose |
|---|---|
| `src/components/stock-logo.tsx` | Logo img + letter-fallback |
| `src/app/holdings/page.tsx` | Full redesign |
| `src/lib/portfolio/portfolio.ts` | Add `lots: OpenLot[]` to `Holding` |

---

## 5. Out of Scope
- Company name lookup
- Sorting/filtering columns
- Lot editing
