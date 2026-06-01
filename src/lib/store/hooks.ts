"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  StoredTransaction,
  Remittance,
  TaxSettings,
  IncomeByYear,
  CashBalanceMap,
} from "./types";
import {
  getTransactions,
  getRemittances,
  getTaxSettings,
  getIncomeByYear,
  getCashBalances,
  STORE_CHANGE_EVENT,
} from "./local-store";

export function useStore() {
  const [transactions, setTransactions] = useState<StoredTransaction[]>([]);
  const [remittances, setRemittances] = useState<Remittance[]>([]);
  const [taxSettings, setTaxSettings] = useState<TaxSettings | null>(null);
  const [incomeByYear, setIncomeByYear] = useState<IncomeByYear>({});
  const [cashBalances, setCashBalances] = useState<CashBalanceMap>({});
  const [hydrated, setHydrated] = useState(false);

  const refresh = useCallback(() => {
    setTransactions(getTransactions());
    setRemittances(getRemittances());
    setTaxSettings(getTaxSettings());
    setIncomeByYear(getIncomeByYear());
    setCashBalances(getCashBalances());
    setHydrated(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) refresh();
    });
    window.addEventListener(STORE_CHANGE_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      cancelled = true;
      window.removeEventListener(STORE_CHANGE_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [refresh]);

  return { transactions, remittances, taxSettings, incomeByYear, cashBalances, hydrated };
}
