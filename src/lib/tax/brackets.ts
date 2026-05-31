import { Decimal, D } from "@/lib/money/decimal";
import { PROGRESSIVE_BRACKETS } from "./config";

export interface BracketLine {
  from: number;
  to: number | null;
  rate: number;
  taxableInBracket: Decimal;
  taxInBracket: Decimal;
}

export interface ProgressiveResult {
  total: Decimal;
  lines: BracketLine[];
}

/**
 * Progressive tax over the configured brackets (brief §3.4). Each bracket is
 * taxed only on the slice of income that falls within it. Negative income is
 * clamped to 0. All math is Decimal.
 */
export function calcProgressiveTax(netIncome: Decimal): ProgressiveResult {
  const income = Decimal.max(netIncome, 0);
  let lower = new Decimal(0);
  let total = new Decimal(0);
  const lines: BracketLine[] = [];

  for (const b of PROGRESSIVE_BRACKETS) {
    const upper = b.upTo === null ? null : D(b.upTo);
    const cap = upper === null ? income : Decimal.min(income, upper);
    const taxable = Decimal.max(cap.minus(lower), 0);
    const tax = taxable.times(b.rate);

    if (taxable.gt(0)) {
      lines.push({
        from: Number(lower.toString()),
        to: b.upTo,
        rate: b.rate,
        taxableInBracket: taxable,
        taxInBracket: tax,
      });
    }
    total = total.plus(tax);

    if (upper === null || income.lte(upper)) break;
    lower = upper;
  }

  return { total, lines };
}
