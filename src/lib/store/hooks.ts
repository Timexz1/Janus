"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  Account,
  StoredTransaction,
  Remittance,
  TaxSettings,
  IncomeByYear,
} from "./types";
import {
  getAccounts,
  getTransactions,
  getRemittances,
  getTaxSettings,
  getIncomeByYear,
  repairOrphanTransactions,
  STORE_CHANGE_EVENT,
} from "./local-store";

/**
 * Loads all store entities and stays in sync. Data is read only after mount so
 * server and first client render both start empty — avoids hydration mismatch
 * (localStorage is unavailable on the server).
 */
export function useStore() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<StoredTransaction[]>([]);
  const [remittances, setRemittances] = useState<Remittance[]>([]);
  const [taxSettings, setTaxSettings] = useState<TaxSettings | null>(null);
  const [incomeByYear, setIncomeByYear] = useState<IncomeByYear>({});
  const [hydrated, setHydrated] = useState(false);

  const refresh = useCallback(() => {
    // self-heal any transaction whose account was mis-read by OCR before reading,
    // so the list and the cloud mirror always see valid account references.
    repairOrphanTransactions();
    setAccounts(getAccounts());
    setTransactions(getTransactions());
    setRemittances(getRemittances());
    setTaxSettings(getTaxSettings());
    setIncomeByYear(getIncomeByYear());
    setHydrated(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) refresh();
    });
    window.addEventListener(STORE_CHANGE_EVENT, refresh);
    window.addEventListener("storage", refresh); // cross-tab sync
    return () => {
      cancelled = true;
      window.removeEventListener(STORE_CHANGE_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [refresh]);

  return { accounts, transactions, remittances, taxSettings, incomeByYear, hydrated };
}
