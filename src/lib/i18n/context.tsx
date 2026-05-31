"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { dict, type Lang } from "./dictionary";

const LANG_KEY = "janus.lang";

interface LangCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string) => string;
}

const Ctx = createContext<LangCtx | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  // Default "th" on both server and first client render → no hydration mismatch.
  const [lang, setLangState] = useState<Lang>("th");

  useEffect(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem(LANG_KEY) : null;
    if (saved === "en" || saved === "th") {
      queueMicrotask(() => setLangState(saved));
    }
  }, []);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    if (typeof window !== "undefined") window.localStorage.setItem(LANG_KEY, l);
  }, []);

  const t = useCallback(
    (key: string) => dict[lang][key] ?? dict.th[key] ?? key,
    [lang],
  );

  return <Ctx.Provider value={{ lang, setLang, t }}>{children}</Ctx.Provider>;
}

export function useT(): LangCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useT must be used within LanguageProvider");
  return ctx;
}
