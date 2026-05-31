import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { Decimal, roundUsd, roundQty, type DecimalInput } from "@/lib/money/decimal";

dayjs.extend(utc);
dayjs.extend(timezone);

const BANGKOK_TZ = "Asia/Bangkok";

/** Format a USD amount as $1,234.56. */
export function fmtUsd(v: DecimalInput): string {
  return Number(roundUsd(v).toString()).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

/** Format a THB amount as ฿1,234.56. */
export function fmtThb(v: DecimalInput): string {
  return Number(new Decimal(v).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toString()).toLocaleString(
    "th-TH",
    { style: "currency", currency: "THB" },
  );
}

/** Format a USD amount with an explicit + / − sign. */
export function fmtSignedUsd(v: DecimalInput): string {
  const d = roundUsd(v);
  const sign = d.gt(0) ? "+" : "";
  return `${sign}${fmtUsd(d)}`;
}

/** Format a share quantity (up to 7 dp, trailing zeros trimmed). */
export function fmtQty(v: DecimalInput): string {
  return roundQty(v).toString();
}

/** Format a per-share USD price (kept to a readable 4 dp). */
export function fmtPrice(v: DecimalInput): string {
  return `$${new Decimal(roundQty(v)).toDecimalPlaces(4, Decimal.ROUND_HALF_UP).toFixed(4)}`;
}

/** Render an ISO timestamp in Asia/Bangkok local time. */
export function fmtDateTimeBangkok(iso: string): string {
  return dayjs(iso).tz(BANGKOK_TZ).format("DD/MM/YYYY HH:mm");
}

/** ISO → US market date (YYYY-MM-DD in America/New_York) for chart markers. */
export function isoToNyDate(iso: string): string {
  return dayjs(iso).tz("America/New_York").format("YYYY-MM-DD");
}

/** ISO → value for a <input type="datetime-local"> (Asia/Bangkok wall time). */
export function isoToLocalInput(iso: string): string {
  return dayjs(iso).tz(BANGKOK_TZ).format("YYYY-MM-DDTHH:mm");
}

/** <input type="datetime-local"> value (Asia/Bangkok wall time) → ISO UTC. */
export function localInputToIso(local: string): string {
  return dayjs.tz(local, BANGKOK_TZ).toISOString();
}

/** Tone helper for gains/losses. */
export function gainTone(v: DecimalInput): "positive" | "negative" | "default" {
  const d = new Decimal(v);
  if (d.gt(0)) return "positive";
  if (d.lt(0)) return "negative";
  return "default";
}
