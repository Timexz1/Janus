"use client";

import { useState } from "react";

const COLORS = [
  "bg-indigo-900 text-indigo-300",
  "bg-emerald-900 text-emerald-300",
  "bg-amber-900 text-amber-300",
  "bg-sky-900 text-sky-300",
  "bg-rose-900 text-rose-300",
  "bg-violet-900 text-violet-300",
];

function colorFor(ticker: string) {
  let n = 0;
  for (let i = 0; i < ticker.length; i++) n = (n * 31 + ticker.charCodeAt(i)) & 0xffff;
  return COLORS[n % COLORS.length];
}

export function StockLogo({ ticker, size = 32 }: { ticker: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const abbr = ticker.slice(0, 2).toUpperCase();
  const src = `https://s3-symbol-logo.tradingview.com/${ticker.toLowerCase()}.svg`;

  if (failed) {
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center rounded-full text-xs font-bold ${colorFor(ticker)}`}
        style={{ width: size, height: size }}
        aria-hidden
      >
        {abbr}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={ticker}
      width={size}
      height={size}
      className="shrink-0 rounded-full object-contain"
      onError={() => setFailed(true)}
    />
  );
}
