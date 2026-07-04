// Money helpers. Amounts travel to/from the API as exact decimal strings
// (NUMERIC(20,2)). Never do arithmetic on floats — parse to integer cents when
// a numeric comparison is unavoidable, and only format for display.

// Compliance hold threshold (ADR-003): amount >= $1000.00 is held for review.
export const HOLD_THRESHOLD_USD = 1000;

const usdFormatter = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Format a decimal string like "5000.00" as "US$ 5.000,00" for display. */
export function formatUSD(value: string | number): string {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return "US$ 0,00";
  return usdFormatter.format(n);
}

/** Parse a decimal money string to integer cents (exact, no float rounding). */
export function toCents(value: string): number | null {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  const whole = Number(match[1]);
  const frac = (match[2] ?? "").padEnd(2, "0");
  return whole * 100 + Number(frac);
}

/** True when an amount would be sent to compliance review (>= $1000). */
export function isHoldAmount(value: string): boolean {
  const cents = toCents(value);
  if (cents === null) return false;
  return cents >= HOLD_THRESHOLD_USD * 100;
}

/** Client-side mirror of the API's amount validation (`^\d+(\.\d{1,2})?$` and > 0). */
export function isValidAmount(value: string): boolean {
  const cents = toCents(value);
  return cents !== null && cents > 0;
}
