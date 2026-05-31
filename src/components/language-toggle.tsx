"use client";

import { useT } from "@/lib/i18n/context";

export function LanguageToggle() {
  const { lang, setLang } = useT();
  return (
    <button
      type="button"
      aria-label="สลับภาษา ไทย/อังกฤษ"
      onClick={() => setLang(lang === "th" ? "en" : "th")}
      className="rounded-md px-2 py-1.5 text-xs font-semibold text-slate-400 transition-colors hover:bg-slate-800/60 hover:text-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400"
    >
      {lang === "th" ? "TH" : "EN"}
    </button>
  );
}
