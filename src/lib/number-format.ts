import type { Locale } from "@/lib/i18n/config";

/**
 * Numbers in the app's language, written the same on the server and in every
 * browser.
 *
 * Albanian is written here rather than looked up. Intl can only format `sq`
 * where the runtime ships Albanian locale data, and not every one does (the
 * Claude desktop browser does not, nor do some Android WebViews). Without it
 * Intl falls back to English without a word, so the server sent "162,00" and
 * the browser rendered "162.00" for the same reservation: a visibly wrong
 * price, and a hydration mismatch that made React discard the server's HTML
 * and render the tree again.
 *
 * English data is part of every ICU build, so Intl still does the rounding
 * and produces the digits — in English, ungrouped — and Albanian's own rules
 * are laid over them. Those are CLDR's: a no-break space between groups of
 * three, a comma before the decimals, and no grouping until the integer part
 * has five digits ("1748" but "12 345"). That last rule is why this is not a
 * separator swap on English output, which would have printed "1 748".
 */
export function formatNumber(
  value: number,
  locale: Locale,
  fractionDigits: 0 | 2 = 0
): string {
  return formatter(locale, fractionDigits)(value);
}

/** Albanian's group separator: U+00A0, so a number never breaks a line. */
const GROUP = " ";

// Four possible formatters, built once. These render inside table rows and
// chart legends, where a fresh Intl.NumberFormat per row is measurable.
const formatters = new Map<string, (value: number) => string>();

function formatter(
  locale: Locale,
  fractionDigits: 0 | 2
): (value: number) => string {
  const key = `${locale}:${fractionDigits}`;
  const existing = formatters.get(key);
  if (existing) return existing;
  const created =
    locale === "sq" ? albanian(fractionDigits) : intl(locale, fractionDigits);
  formatters.set(key, created);
  return created;
}

function intl(locale: Locale, fractionDigits: 0 | 2) {
  const format = new Intl.NumberFormat(locale, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
  return (value: number) => format.format(value);
}

function albanian(fractionDigits: 0 | 2) {
  const plain = new Intl.NumberFormat("en", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
    useGrouping: false,
  });
  return (value: number) => {
    const [whole, fraction] = plain.format(value).split(".");
    const sign = whole.startsWith("-") ? "-" : "";
    const digits = sign ? whole.slice(1) : whole;
    const grouped =
      digits.length >= 5
        ? digits.replace(/\B(?=(\d{3})+(?!\d))/g, GROUP)
        : digits;
    return fraction === undefined
      ? `${sign}${grouped}`
      : `${sign}${grouped},${fraction}`;
  };
}
