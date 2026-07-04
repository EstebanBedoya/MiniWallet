/**
 * Money helpers. Amounts are decimal strings ("5000.00") to match PostgreSQL
 * NUMERIC(20,2) — never JS floats. For exact comparisons we work in integer
 * cents using BigInt.
 */

/** Parse a decimal string with up to 2 decimals into exact integer cents. */
export function toCents(amount: string): bigint {
  const trimmed = amount.trim();
  const negative = trimmed.startsWith('-');
  const unsigned = trimmed.replace(/^[+-]/, '');
  const [intPart, fracPart = ''] = unsigned.split('.');
  const frac = (fracPart + '00').slice(0, 2);
  const cents = BigInt(intPart || '0') * 100n + BigInt(frac || '0');
  return negative ? -cents : cents;
}

/** Sum decimal-string amounts exactly, in cents. */
export function sumCents(amounts: string[]): bigint {
  return amounts.reduce((acc, a) => acc + toCents(a), 0n);
}

/** Negate a decimal-string amount ("5000.00" -> "-5000.00"). */
export function negate(amount: string): string {
  const trimmed = amount.trim();
  if (trimmed.startsWith('-')) return trimmed.slice(1);
  return '-' + trimmed;
}
