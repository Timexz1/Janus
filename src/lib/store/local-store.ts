import type {
  Account,
  StoredTransaction,
  TransactionInput,
  Remittance,
  RemittanceInputData,
  TaxSettings,
  IncomeByYear,
  ChartState,
  ChartPeriod,
  ChartTimeframe,
  ChartDrawing,
  ChartIndicators,
  ChartVisibleRange,
} from "./types";
import {
  DEFAULT_APPORTIONMENT,
  DEFAULT_PERSONAL_ALLOWANCE,
} from "@/lib/tax/config";
import { DEFAULT_CLAUDE_MODEL } from "@/lib/ocr/pricing";

/**
 * Browser localStorage-backed store. This is the Phase-1 MVP stand-in for the
 * Supabase repository — the read/write surface below is the interface that the
 * Supabase implementation will satisfy later (brief Phase 1b), so UI code never
 * touches the persistence detail directly.
 */
const ACCOUNTS_KEY = "janus.accounts.v1";
const TXNS_KEY = "janus.transactions.v1";
const REMITTANCES_KEY = "janus.remittances.v1";
const TAX_SETTINGS_KEY = "janus.taxSettings.v1";
const INCOME_KEY = "janus.income.v1";
const CHART_STATES_KEY = "janus.chartStates.v1";
export const STORE_CHANGE_EVENT = "janus:store-change";

export const DEFAULT_ACCOUNTS: Account[] = [
  { id: "acc_webull", broker: "Webull", accountLabel: "Webull Thailand", currency: "USD" },
  { id: "acc_dime", broker: "Dime", accountLabel: "Dime! USD", currency: "USD" },
];

export const DEFAULT_CHART_INDICATORS: ChartIndicators = {
  volume: true,
  ma20: true,
  ma50: false,
  ma200: false,
};

// --- Cloud sync hooks ------------------------------------------------------
// localStorage stays the synchronous cache; when a user is signed in, mutations
// are mirrored to Supabase and the cache is hydrated from it on login.
export type CloudTable =
  | "accounts"
  | "transactions"
  | "remittances"
  | "income_inputs"
  | "tax_settings"
  | "chart_states";

const KEY_TABLE: Record<string, CloudTable> = {
  [ACCOUNTS_KEY]: "accounts",
  [TXNS_KEY]: "transactions",
  [REMITTANCES_KEY]: "remittances",
  [INCOME_KEY]: "income_inputs",
  [TAX_SETTINGS_KEY]: "tax_settings",
  [CHART_STATES_KEY]: "chart_states",
};

let cloudMirror: ((table: CloudTable) => void) | null = null;
let suppressMirror = false;

export function setCloudMirror(fn: ((table: CloudTable) => void) | null): void {
  cloudMirror = fn;
}
export function isCloudActive(): boolean {
  return cloudMirror !== null;
}
/** Run writes without mirroring them back to the cloud (used during hydration). */
export function runSuppressed(fn: () => void): void {
  suppressMirror = true;
  try {
    fn();
  } finally {
    suppressMirror = false;
  }
}

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
  window.dispatchEvent(new Event(STORE_CHANGE_EVENT));
  if (!suppressMirror && cloudMirror && KEY_TABLE[key]) cloudMirror(KEY_TABLE[key]);
}

/** Overwrite the local cache from a cloud snapshot without mirroring back. */
export function loadSnapshot(s: {
  accounts?: Account[];
  transactions?: StoredTransaction[];
  remittances?: Remittance[];
  income?: IncomeByYear;
  taxSettings?: Partial<TaxSettings>;
  chartStates?: Record<string, ChartState>;
}): void {
  if (typeof window === "undefined") return;
  runSuppressed(() => {
    if (s.accounts) write(ACCOUNTS_KEY, s.accounts);
    if (s.transactions) write(TXNS_KEY, s.transactions);
    if (s.remittances) write(REMITTANCES_KEY, s.remittances);
    if (s.income) write(INCOME_KEY, s.income);
    if (s.taxSettings) write(TAX_SETTINGS_KEY, { ...getTaxSettings(), ...s.taxSettings });
    if (s.chartStates) write(CHART_STATES_KEY, s.chartStates);
  });
  window.dispatchEvent(new Event(STORE_CHANGE_EVENT));
}

/** Wipe the local cache (on logout, or before hydrating another user). */
export function clearLocalData(): void {
  if (typeof window === "undefined") return;
  [ACCOUNTS_KEY, TXNS_KEY, REMITTANCES_KEY, INCOME_KEY, TAX_SETTINGS_KEY, CHART_STATES_KEY].forEach((k) =>
    window.localStorage.removeItem(k),
  );
  window.dispatchEvent(new Event(STORE_CHANGE_EVENT));
}

export function getAccounts(): Account[] {
  const accts = read<Account[]>(ACCOUNTS_KEY, []);
  if (accts.length === 0 && !isCloudActive()) {
    write(ACCOUNTS_KEY, DEFAULT_ACCOUNTS);
    return DEFAULT_ACCOUNTS;
  }
  return accts;
}

export function addAccount(input: Omit<Account, "id">): Account {
  const acc: Account = { ...input, id: uid("acc") };
  write(ACCOUNTS_KEY, [...getAccounts(), acc]);
  return acc;
}

export function deleteAccount(id: string): void {
  write(
    ACCOUNTS_KEY,
    getAccounts().filter((a) => a.id !== id),
  );
}

export function getTransactions(): StoredTransaction[] {
  return read<StoredTransaction[]>(TXNS_KEY, []);
}

function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function addTransaction(input: TransactionInput): StoredTransaction {
  const tx: StoredTransaction = {
    ...input,
    id: uid("tx"),
    createdAt: new Date().toISOString(),
  };
  write(TXNS_KEY, [...getTransactions(), tx]);
  return tx;
}

export function updateTransaction(id: string, input: TransactionInput): void {
  write(
    TXNS_KEY,
    getTransactions().map((t) => (t.id === id ? { ...t, ...input } : t)),
  );
}

export function deleteTransaction(id: string): void {
  write(
    TXNS_KEY,
    getTransactions().filter((t) => t.id !== id),
  );
}

export function replaceAllTransactions(txns: StoredTransaction[]): void {
  write(TXNS_KEY, txns);
}

/**
 * Self-heal referential integrity: every transaction must reference an existing
 * account. OCR once mis-read a broker account NUMBER (e.g. "CTH4675306") into
 * accountId, which violated the cloud transactions→accounts foreign key and
 * blocked ALL cloud sync for that user. Remap any such orphan to a valid account
 * (prefer Webull's default). Returns true only if it changed something, so the
 * caller's write/mirror doesn't fire needlessly. No-ops while accounts are empty
 * (mid-hydration) so it never strands data.
 */
export function repairOrphanTransactions(): boolean {
  const accounts = getAccounts();
  if (accounts.length === 0) return false;
  const validIds = new Set(accounts.map((a) => a.id));
  const fallbackId = validIds.has("acc_webull") ? "acc_webull" : accounts[0].id;
  let changed = false;
  const fixed = getTransactions().map((t) => {
    if (validIds.has(t.accountId)) return t;
    changed = true;
    return { ...t, accountId: fallbackId };
  });
  if (changed) write(TXNS_KEY, fixed);
  return changed;
}

// --- Remittances -----------------------------------------------------------

export function getRemittances(): Remittance[] {
  return read<Remittance[]>(REMITTANCES_KEY, []);
}

export function addRemittance(input: RemittanceInputData): Remittance {
  const r: Remittance = {
    ...input,
    id: uid("rm"),
    createdAt: new Date().toISOString(),
  };
  write(REMITTANCES_KEY, [...getRemittances(), r]);
  return r;
}

export function updateRemittance(id: string, input: RemittanceInputData): void {
  write(
    REMITTANCES_KEY,
    getRemittances().map((r) => (r.id === id ? { ...r, ...input } : r)),
  );
}

export function deleteRemittance(id: string): void {
  write(
    REMITTANCES_KEY,
    getRemittances().filter((r) => r.id !== id),
  );
}

// --- Tax settings ----------------------------------------------------------

export function getTaxSettings(): TaxSettings {
  const defaults: TaxSettings = {
    apportionmentMethod: DEFAULT_APPORTIONMENT,
    personalAllowance: String(DEFAULT_PERSONAL_ALLOWANCE),
    taxYear: new Date().getFullYear(),
    showMetrics: true,
    ocrEnabled: true,
    ocrProvider: "claude",
    geminiApiKey: "",
    typhoonApiKey: "",
    claudeApiKey: "",
    claudeModel: DEFAULT_CLAUDE_MODEL,
  };
  const saved = read<Partial<TaxSettings>>(TAX_SETTINGS_KEY, {});
  const validProviders = ["gemini", "typhoon", "claude"];
  const ocrProvider = validProviders.includes(saved.ocrProvider as string)
    ? (saved.ocrProvider as TaxSettings["ocrProvider"])
    : defaults.ocrProvider;
  return { ...defaults, ...saved, ocrProvider };
}

export function saveTaxSettings(settings: Partial<TaxSettings>): void {
  write(TAX_SETTINGS_KEY, { ...getTaxSettings(), ...settings });
}

// --- Other income ----------------------------------------------------------

export function getIncomeByYear(): IncomeByYear {
  return read<IncomeByYear>(INCOME_KEY, {});
}

export function setIncomeForYear(year: number, amountThb: string): void {
  write(INCOME_KEY, { ...getIncomeByYear(), [year]: amountThb });
}

// --- Chart state ----------------------------------------------------------

export function getChartStates(): Record<string, ChartState> {
  const states = read<Record<string, ChartState>>(CHART_STATES_KEY, {});
  return Object.fromEntries(
    Object.entries(states).map(([key, state]) => [
      key,
      {
        ...state,
        indicators: {
          ...DEFAULT_CHART_INDICATORS,
          ...(state.indicators ?? {}),
        },
        visibleRange: state.visibleRange ?? null,
      },
    ]),
  );
}

export function getChartState(ticker: string): ChartState | null {
  const key = ticker.trim().toUpperCase();
  return getChartStates()[key] ?? null;
}

export function saveChartState(
  ticker: string,
  input: {
    period: ChartPeriod;
    timeframe: ChartTimeframe;
    indicators?: ChartIndicators;
    visibleRange?: ChartVisibleRange | null;
    drawings: ChartDrawing[];
  },
): void {
  const key = ticker.trim().toUpperCase();
  if (!key) return;
  write(CHART_STATES_KEY, {
    ...getChartStates(),
    [key]: {
      ticker: key,
      ...input,
      indicators: {
        ...DEFAULT_CHART_INDICATORS,
        ...(input.indicators ?? {}),
      },
      visibleRange: input.visibleRange ?? null,
      updatedAt: new Date().toISOString(),
    },
  });
}
