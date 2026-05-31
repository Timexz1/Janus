import { Decimal, D, ZERO } from "@/lib/money/decimal";
import type { ApportionmentMethod } from "./config";

/**
 * Transfer direction. Only money brought INTO Thailand ("inbound") is the
 * taxable remittance event (brief §3.3). "outbound" = money sent out to fund
 * the brokerage (principal) — tracked for cash-flow but not taxed.
 */
export type RemittanceDirection = "inbound" | "outbound";

/**
 * Remittance → gain matching (brief §3.3).
 *
 * Model: the cash available to remit comes from sale proceeds, which split into
 * returned principal (cost basis) and realized gain. We track a running pool of
 * each, accumulated from sales whose date is on/before the remittance date —
 * you can only remit gains you've already realized. Each remittance consumes
 * from the pool according to the chosen apportionment method; only the GAIN
 * portion is taxable, converted to THB at that remittance's FX rate.
 *
 * The principal base is the cost basis returned by sells (a defensible default
 * since we track trades, not raw cash deposits) — it only affects pro_rata /
 * principal_first; gain_first depends solely on the gain pool.
 */
export interface SaleEvent {
  date: string; // ISO / YYYY-MM-DD; compared lexicographically
  gainUsd: Decimal;
  principalUsd: Decimal; // cost basis returned by this sale
}

export interface RemittanceInput {
  id: string;
  date: string;
  amountUsd: Decimal;
  fxRate: Decimal; // THB per USD
}

export interface RemittanceLine extends RemittanceInput {
  gainUsdMatched: Decimal;
  principalUsd: Decimal; // principal portion of this remittance
  taxableThb: Decimal; // gainUsdMatched × fxRate
}

/** Stored remittance shape (decimals as strings) for filtering to taxable ones. */
export interface StoredRemittanceLike {
  id: string;
  date: string;
  amountUsd: string;
  fxRate: string;
  direction?: RemittanceDirection;
}

/**
 * Map stored remittances to engine inputs, keeping ONLY inbound (to-Thailand)
 * transfers. A missing direction defaults to inbound (legacy data, before the
 * in/out split existed).
 */
export function toTaxableInputs(rs: StoredRemittanceLike[]): RemittanceInput[] {
  return rs
    .filter((r) => (r.direction ?? "inbound") === "inbound")
    .map((r) => ({
      id: r.id,
      date: r.date,
      amountUsd: D(r.amountUsd),
      fxRate: D(r.fxRate),
    }));
}

export function matchRemittances(
  sales: SaleEvent[],
  remittances: RemittanceInput[],
  method: ApportionmentMethod,
): RemittanceLine[] {
  const sortedRems = [...remittances].sort((a, b) => (a.date < b.date ? -1 : 1));

  let consumedGain = ZERO;
  let consumedPrincipal = ZERO;
  const lines: RemittanceLine[] = [];

  for (const r of sortedRems) {
    // pools realized on/before this remittance date
    let poolGain = ZERO;
    let poolPrincipal = ZERO;
    for (const s of sales) {
      if (s.date <= r.date) {
        poolGain = poolGain.plus(s.gainUsd);
        poolPrincipal = poolPrincipal.plus(s.principalUsd);
      }
    }
    const availGain = Decimal.max(poolGain.minus(consumedGain), 0);
    const availPrincipal = Decimal.max(poolPrincipal.minus(consumedPrincipal), 0);
    const amount = r.amountUsd;

    let gainPortion: Decimal;
    if (method === "gain_first") {
      gainPortion = Decimal.min(availGain, amount);
    } else if (method === "principal_first") {
      const excess = Decimal.max(amount.minus(availPrincipal), 0);
      gainPortion = Decimal.min(availGain, excess);
    } else {
      // pro_rata
      const totalPool = availGain.plus(availPrincipal);
      gainPortion = totalPool.gt(0)
        ? Decimal.min(availGain, amount.times(availGain).div(totalPool))
        : ZERO;
    }

    const principalPortion = amount.minus(gainPortion);
    consumedGain = consumedGain.plus(gainPortion);
    consumedPrincipal = consumedPrincipal.plus(
      Decimal.min(principalPortion, availPrincipal),
    );

    lines.push({
      ...r,
      gainUsdMatched: gainPortion,
      principalUsd: principalPortion,
      taxableThb: gainPortion.times(r.fxRate),
    });
  }

  return lines;
}
