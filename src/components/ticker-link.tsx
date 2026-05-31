import Link from "next/link";
import { cn } from "@/components/ui";

/**
 * A stock ticker rendered as a link to its price chart. Works for any symbol
 * (even ones not yet traded) so it stays useful as the app grows. Reuse this
 * everywhere a ticker is shown instead of plain text.
 */
export function TickerLink({
  ticker,
  className,
}: {
  ticker: string;
  className?: string;
}) {
  return (
    <Link
      href={`/charts?ticker=${encodeURIComponent(ticker)}`}
      className={cn(
        "rounded transition-colors hover:text-indigo-400 hover:underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400",
        className,
      )}
      title={`ดูกราฟ ${ticker}`}
    >
      {ticker}
    </Link>
  );
}
