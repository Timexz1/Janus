"use client";

import { useT } from "@/lib/i18n/context";

export function Footer() {
  const { t } = useT();
  return (
    <footer className="border-t border-slate-800/80 bg-slate-950/60">
      <div className="mx-auto max-w-[1900px] px-3 py-3 sm:px-5 lg:px-8 2xl:px-10 min-[2400px]:max-w-[calc(100vw-320px)] min-[3400px]:max-w-[3120px]">
        <p className="text-xs leading-relaxed text-slate-500">
          <span className="font-medium text-slate-400">{t("footer.disclaimerLabel")}</span>{" "}
          {t("footer.disclaimer")}
        </p>
      </div>
    </footer>
  );
}
