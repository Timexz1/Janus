import { Decimal, D, ZERO } from "@/lib/money/decimal";
import { normalizeTrade } from "@/lib/engine/normalize";
import {
  replayTransactions,
  InsufficientSharesError,
} from "@/lib/engine/fifo";
import type { EngineTransaction, NormalizedTrade } from "@/lib/engine/types";
import type { Account, StoredTransaction } from "@/lib/store/types";
import type { SaleEvent } from "@/lib/tax/remittance";

/** Normalize a stored transaction (raw fields → canonical shape). */
export function normalizeStored(t: StoredTransaction): NormalizedTrade {
  return normalizeTrade({
    side: t.side,
    qty: D(t.qty),
    price: D(t.price),
    stockValue: t.stockValue != null ? D(t.stockValue) : undefined,
    fees: D(t.fees),
    couponsWaived: t.couponsWaived != null ? D(t.couponsWaived) : undefined,
  });
}

function toEngineTx(t: StoredTransaction): EngineTransaction {
  const n = normalizeStored(t);
  return {
    id: t.id,
    executedAt: t.executedAt,
    side: n.side,
    qty: n.qty,
    net: n.net,
    costPerShare: n.costPerShare,
  };
}

export interface Holding {
  accountId: string;
  ticker: string;
  qty: Decimal; // open shares
  avgCost: Decimal; // per share
  costValue: Decimal; // qty × avgCost
  realizedGain: Decimal; // realized for this account+ticker
}

export interface GroupError {
  accountId: string;
  ticker: string;
  message: string;
}

export interface Portfolio {
  holdings: Holding[];
  realizedByTxId: Map<string, Decimal>;
  errors: GroupError[];
  totalOpenCost: Decimal; // Σ open lots cost basis
  totalRealizedGain: Decimal;
  openPositions: number;
}

function groupKey(accountId: string, ticker: string): string {
  return `${accountId}__${ticker}`;
}

/**
 * Build the full portfolio view by replaying transactions per (account, ticker)
 * through the FIFO engine. A bad group (e.g. a sell with no matching buy) is
 * captured as an error instead of crashing the whole view.
 */
export function buildPortfolio(
  accounts: Account[],
  transactions: StoredTransaction[],
): Portfolio {
  const groups = new Map<string, StoredTransaction[]>();
  for (const t of transactions) {
    const key = groupKey(t.accountId, t.ticker);
    const list = groups.get(key);
    if (list) list.push(t);
    else groups.set(key, [t]);
  }

  const holdings: Holding[] = [];
  const realizedByTxId = new Map<string, Decimal>();
  const errors: GroupError[] = [];
  let totalOpenCost = ZERO;
  let totalRealizedGain = ZERO;

  for (const [, txns] of groups) {
    const { accountId, ticker } = txns[0];
    try {
      const result = replayTransactions(txns.map(toEngineTx));

      let qty = ZERO;
      let costValue = ZERO;
      for (const lot of result.lots) {
        qty = qty.plus(lot.qtyRemaining);
        costValue = costValue.plus(lot.qtyRemaining.times(lot.costPerShare));
      }
      let realizedGain = ZERO;
      for (const sale of result.sales) {
        realizedGain = realizedGain.plus(sale.realizedGain);
        realizedByTxId.set(sale.transactionId, sale.realizedGain);
      }

      if (qty.gt(0)) {
        holdings.push({
          accountId,
          ticker,
          qty,
          avgCost: costValue.div(qty),
          costValue,
          realizedGain,
        });
      }
      totalOpenCost = totalOpenCost.plus(costValue);
      totalRealizedGain = totalRealizedGain.plus(realizedGain);
    } catch (err) {
      const message =
        err instanceof InsufficientSharesError
          ? `ขายเกินจำนวนที่ถือ (ขาดอีก ${err.shortfall} หุ้น)`
          : err instanceof Error
            ? err.message
            : "เกิดข้อผิดพลาดในการคำนวณ";
      errors.push({ accountId, ticker, message });
    }
  }

  holdings.sort((a, b) => a.ticker.localeCompare(b.ticker));

  return {
    holdings,
    realizedByTxId,
    errors,
    totalOpenCost,
    totalRealizedGain,
    openPositions: holdings.length,
  };
}

/**
 * All realized sales as tax SaleEvents (date + gain + cost basis), across every
 * account+ticker, sorted by date. Feeds the remittance/tax engine (§3.3).
 */
export function extractSaleEvents(
  transactions: StoredTransaction[],
): SaleEvent[] {
  const byId = new Map(transactions.map((t) => [t.id, t]));
  const groups = new Map<string, StoredTransaction[]>();
  for (const t of transactions) {
    const key = groupKey(t.accountId, t.ticker);
    const list = groups.get(key);
    if (list) list.push(t);
    else groups.set(key, [t]);
  }

  const events: SaleEvent[] = [];
  for (const [, txns] of groups) {
    try {
      const result = replayTransactions(txns.map(toEngineTx));
      for (const sale of result.sales) {
        const tx = byId.get(sale.transactionId);
        if (!tx) continue;
        events.push({
          date: tx.executedAt,
          gainUsd: sale.realizedGain,
          principalUsd: sale.costBasis,
        });
      }
    } catch {
      // a broken group contributes no sale events
    }
  }

  events.sort((a, b) => (a.date < b.date ? -1 : 1));
  return events;
}

/** Available open shares for one account+ticker (used to validate sells). */
export function availableShares(
  transactions: StoredTransaction[],
  accountId: string,
  ticker: string,
): Decimal {
  const txns = transactions.filter(
    (t) => t.accountId === accountId && t.ticker === ticker,
  );
  if (txns.length === 0) return ZERO;
  try {
    const result = replayTransactions(txns.map(toEngineTx));
    return result.lots.reduce((sum, l) => sum.plus(l.qtyRemaining), ZERO);
  } catch {
    return ZERO;
  }
}
