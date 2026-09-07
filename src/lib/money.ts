import type { Prisma } from "@prisma/client";
import type { Locale } from "@/lib/i18n/config";

/**
 * The one place Decimal becomes a number.
 *
 * Prisma.Decimal cannot cross the server/client boundary, so every value on
 * its way to a page has to be converted. That was happening at roughly 35
 * hand-written call sites in two conventions, and the fleet page proved the
 * cost: its table read `Number(v.pricePerDay).toFixed(2)` and its grid read
 * `String(...)` then `Number(...)`, so the same car showed 45.00 EUR or 45
 * depending on which view the operator had toggled.
 */
export function toMoney(value: Prisma.Decimal | number | string): number {
  return Number(value);
}

/**
 * Money as the app writes it: the amount in the operator's locale, then EUR.
 *
 * Not Intl's `style: "currency"`, which would render "1.234,50 €" and move
 * the symbol around by locale. This app has always written the amount
 * followed by EUR, including inside translated sentences, and that stays.
 *
 * The locale is required because the alternative is what this replaces:
 * `toLocaleString(undefined, …)` means the *viewer's* locale, so an operator
 * with an English OS saw English grouping inside an Albanian interface. The
 * app knows its own locale — `useI18n()` on the client, `getI18n()` on the
 * server.
 */
export function formatEur(
  value: Prisma.Decimal | number | string,
  locale: Locale,
  options: { precision?: 0 | 2 } = {}
): string {
  return `${formatAmount(value, locale, options)} EUR`;
}

/**
 * The amount alone, for the translated sentences that supply their own EUR
 * — "At {rate} EUR/day", "Under {amount} EUR".
 */
export function formatAmount(
  value: Prisma.Decimal | number | string,
  locale: Locale,
  { precision = 2 }: { precision?: 0 | 2 } = {}
): string {
  return numberFormat(locale, precision).format(toMoney(value));
}

// Four possible formatters, built once. These render inside table rows and
// chart legends, where a fresh Intl.NumberFormat per row is measurable.
const formatters = new Map<string, Intl.NumberFormat>();

function numberFormat(locale: Locale, precision: 0 | 2): Intl.NumberFormat {
  const key = `${locale}:${precision}`;
  const existing = formatters.get(key);
  if (existing) return existing;
  const created = new Intl.NumberFormat(locale, {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  });
  formatters.set(key, created);
  return created;
}
