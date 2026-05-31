import { D, ZERO, minDecimal } from "@/lib/money/decimal";
import type {
  EngineTransaction,
  LotConsumption,
  OpenLot,
  ReplayResult,
  SaleResult,
} from "./types";

/** Thrown when a sell tries to consume more shares than are currently held. */
export class InsufficientSharesError extends Error {
  constructor(
    public readonly transactionId: string,
    public readonly shortfall: string,
  ) {
    super(
      `Sell transaction ${transactionId} exceeds available shares by ${shortfall}`,
    );
    this.name = "InsufficientSharesError";
  }
}

/**
 * FIFO replay engine (brief §3.2, Approach A).
 *
 * `transactions` are the SOURCE OF TRUTH for ONE (account, ticker) pair. We
 * replay them in chronological order to DERIVE the open lots and the realized
 * gain of every sell. Because lots are always recomputed from history, edits
 * and deletes can never leave the lot snapshot in a drifted state.
 *
 * FIFO: a sell consumes the oldest open lot first. Lots are scoped to a single
 * account — consumption never crosses brokers (brief §3.2: Webull and Dime are
 * separate portfolios).
 *
 * All math is Decimal at full precision; nothing is rounded here.
 */
export function replayTransactions(
  transactions: EngineTransaction[],
): ReplayResult {
  // Chronological order, with `seq` as a stable tiebreaker for same-timestamp.
  const ordered = [...transactions].sort((a, b) => {
    if (a.executedAt !== b.executedAt) {
      return a.executedAt < b.executedAt ? -1 : 1;
    }
    return (a.seq ?? 0) - (b.seq ?? 0);
  });

  const lots: OpenLot[] = []; // FIFO queue: index 0 = oldest
  const sales: SaleResult[] = [];

  for (const tx of ordered) {
    if (tx.side === "buy") {
      lots.push({
        sourceTransactionId: tx.id,
        qtyRemaining: D(tx.qty),
        costPerShare: tx.costPerShare ?? ZERO,
        openedAt: tx.executedAt,
      });
      continue;
    }

    // sell — consume oldest lots first
    let remaining = D(tx.qty);
    let costBasis = ZERO;
    const consumed: LotConsumption[] = [];

    while (remaining.gt(0)) {
      const lot = lots[0];
      if (!lot) {
        throw new InsufficientSharesError(tx.id, remaining.toString());
      }
      const take = minDecimal(lot.qtyRemaining, remaining);
      costBasis = costBasis.plus(take.times(lot.costPerShare));
      consumed.push({
        lotTransactionId: lot.sourceTransactionId,
        qty: take,
        costPerShare: lot.costPerShare,
      });
      lot.qtyRemaining = lot.qtyRemaining.minus(take);
      remaining = remaining.minus(take);
      if (lot.qtyRemaining.lte(0)) {
        lots.shift();
      }
    }

    sales.push({
      transactionId: tx.id,
      realizedGain: D(tx.net).minus(costBasis), // net proceeds − cost basis
      costBasis,
      consumed,
    });
  }

  return { lots, sales };
}

/** Sum of realized gains across all sells in a replay result. */
export function totalRealizedGain(result: ReplayResult): import("@/lib/money/decimal").Decimal {
  return result.sales.reduce((sum, s) => sum.plus(s.realizedGain), ZERO);
}
