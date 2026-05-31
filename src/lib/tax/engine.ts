import { Decimal, ZERO } from "@/lib/money/decimal";
import type { ApportionmentMethod } from "./config";
import { calcProgressiveTax, type ProgressiveResult } from "./brackets";
import {
  matchRemittances,
  type SaleEvent,
  type RemittanceInput,
  type RemittanceLine,
} from "./remittance";

export interface TaxInput {
  saleEvents: SaleEvent[];
  remittances: RemittanceInput[];
  otherIncomeThb: Decimal;
  personalAllowance: Decimal;
  method: ApportionmentMethod;
  taxYear: number; // Gregorian
}

export interface TaxComputation {
  taxableRemittedThb: Decimal; // taxable remitted gain in the tax year
  netIncomeThb: Decimal;
  tax: ProgressiveResult;
  remittanceLines: RemittanceLine[];
  unremittedGainUsd: Decimal; // realized gain not yet matched by any remittance
}

function yearOf(date: string): number {
  return Number(date.slice(0, 4));
}

/** Compute estimated personal income tax for a tax year (brief §3.4). */
export function computeTax(input: TaxInput): TaxComputation {
  const remittanceLines = matchRemittances(
    input.saleEvents,
    input.remittances,
    input.method,
  );

  const taxableRemittedThb = remittanceLines
    .filter((l) => yearOf(l.date) === input.taxYear)
    .reduce((s, l) => s.plus(l.taxableThb), ZERO);

  const netIncomeThb = Decimal.max(
    input.otherIncomeThb.plus(taxableRemittedThb).minus(input.personalAllowance),
    0,
  );
  const tax = calcProgressiveTax(netIncomeThb);

  const totalGain = input.saleEvents.reduce((s, e) => s.plus(e.gainUsd), ZERO);
  const matchedGain = remittanceLines.reduce(
    (s, l) => s.plus(l.gainUsdMatched),
    ZERO,
  );
  const unremittedGainUsd = Decimal.max(totalGain.minus(matchedGain), 0);

  return { taxableRemittedThb, netIncomeThb, tax, remittanceLines, unremittedGainUsd };
}

export interface WhatIfResult {
  currentTax: Decimal;
  newTax: Decimal;
  marginalTax: Decimal;
  extraTaxableThb: Decimal;
}

/** Marginal tax of remitting an extra amount today (brief §3.4 What-if). */
export function whatIfRemittance(
  input: TaxInput,
  extra: RemittanceInput,
): WhatIfResult {
  const current = computeTax(input);
  const withExtra = computeTax({
    ...input,
    remittances: [...input.remittances, extra],
  });
  return {
    currentTax: current.tax.total,
    newTax: withExtra.tax.total,
    marginalTax: withExtra.tax.total.minus(current.tax.total),
    extraTaxableThb: withExtra.taxableRemittedThb.minus(current.taxableRemittedThb),
  };
}

export type { SaleEvent, RemittanceInput, RemittanceLine, ApportionmentMethod };
