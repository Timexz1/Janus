/**
 * SINGLE source of tax constants (brief §10: no scattered rates).
 *
 * ⚠️ VERIFY before filing: Thai Personal Income Tax progressive brackets and the
 * personal allowance below reflect the rates in the brief (§3.4) and should be
 * re-checked against the Revenue Department (1161) each tax year. The foreign-
 * income "remittance" rule (ป.161/162) may be relaxed — keep `apportionment`
 * configurable.
 */

export type ApportionmentMethod = "gain_first" | "pro_rata" | "principal_first";

export interface TaxBracket {
  /** Upper bound of this bracket in THB net income; null = no upper bound. */
  upTo: number | null;
  rate: number;
}

/** Thai PIT progressive brackets (net income, THB). */
export const PROGRESSIVE_BRACKETS: TaxBracket[] = [
  { upTo: 150_000, rate: 0 },
  { upTo: 300_000, rate: 0.05 },
  { upTo: 500_000, rate: 0.1 },
  { upTo: 750_000, rate: 0.15 },
  { upTo: 1_000_000, rate: 0.2 },
  { upTo: 2_000_000, rate: 0.25 },
  { upTo: 5_000_000, rate: 0.3 },
  { upTo: null, rate: 0.35 },
];

/** Personal allowance (ลดหย่อนส่วนตัว) — simple mode (brief §3.4). */
export const DEFAULT_PERSONAL_ALLOWANCE = 60_000;

export const DEFAULT_APPORTIONMENT: ApportionmentMethod = "gain_first";

export const APPORTIONMENT_LABELS: Record<ApportionmentMethod, string> = {
  gain_first: "กำไรก่อน (Gain-first)",
  pro_rata: "เฉลี่ยตามสัดส่วน (Pro-rata)",
  principal_first: "เงินต้นก่อน (Principal-first)",
};

export const DISCLAIMER =
  "แอปนี้เป็นเครื่องมือประมาณการ ไม่ใช่คำแนะนำทางภาษีหรือกฎหมาย โปรดตรวจสอบกับกรมสรรพากร (1161) หรือนักบัญชีก่อนยื่นจริง หลักเกณฑ์ภาษีเงินได้จากต่างประเทศอาจเปลี่ยนแปลง";
