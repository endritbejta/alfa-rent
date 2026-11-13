import { format, type Locale as DateLocale } from "date-fns";

/** A `YYYY-MM-DD` calendar day as a Date; noon keeps it on its own day. */
const atNoon = (day: string) => new Date(`${day}T12:00:00`);

/** A `YYYY-MM-DD` calendar day for display. */
export function formatDay(day: string, locale?: DateLocale): string {
  return format(atNoon(day), "dd MMM yyyy", { locale });
}

/**
 * A rental's period as one compact range, saying each part once:
 * "13 Nov 2026", "13–16 Nov 2026", "28 Oct – 1 Nov 2026",
 * "28 Dec 2026 – 2 Jan 2027". Calendar-day strings in, so the server and
 * the browser can never disagree about which day a date falls on.
 */
export function formatRentalPeriod(
  pickupDay: string,
  returnDay: string,
  locale?: DateLocale
): string {
  const from = atNoon(pickupDay);
  const to = atNoon(returnDay);
  const f = (date: Date, pattern: string) => format(date, pattern, { locale });
  if (pickupDay === returnDay) return f(from, "d MMM yyyy");
  if (pickupDay.slice(0, 7) === returnDay.slice(0, 7)) {
    return `${f(from, "d")}–${f(to, "d MMM yyyy")}`;
  }
  if (pickupDay.slice(0, 4) === returnDay.slice(0, 4)) {
    return `${f(from, "d MMM")} – ${f(to, "d MMM yyyy")}`;
  }
  return `${f(from, "d MMM yyyy")} – ${f(to, "d MMM yyyy")}`;
}
