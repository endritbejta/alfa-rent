import { businessDay, rentalCalendarDay } from "@/lib/business-time";

/**
 * The maths behind a vehicle's cost figures in the admin drawer (audit
 * P2-5c), kept free of the database so it can be tested on its own.
 *
 * The owner reads these to decide which cars to keep, sell or reprice, so
 * each one has to mean exactly what its label says:
 *
 *   recorded   every repair plus every service, lifetime
 *   net        earned minus recorded
 *   perMonth   recorded averaged over the car's history, or null
 *   perYear    perMonth × 12, or null
 */

/**
 * Under this much history the averages are not shown ("—").
 *
 * The average divides everything the car has cost by how long the system has
 * known it. A car added this month with one €400 repair used to show €4,800
 * a year, because the divisor was floored at one month: a single bill, ×12.
 * Under a quarter, one service or repair is most of the history and the
 * "rate" is noise; three months is the shortest span in which a routine
 * service and the odd repair can both have happened. Lifetime totals are
 * still shown — only the annualised figures wait.
 */
export const MIN_MONTHS_TO_AVERAGE = 3;

/** An average Gregorian month, in days. */
const DAYS_PER_MONTH = 365.25 / 12;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole calendar days from one "YYYY-MM-DD" key to another. */
function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS
  );
}

/**
 * The first day the car's costs can be averaged from, as a calendar key.
 *
 * Normally the day the car was added (`createdAt`, an instant, read on the
 * branch's calendar). But a repair or service dated before that — history
 * entered after the fact, or the backfilled last service — proves the car was
 * costing money earlier, and averaging it over fewer months would inflate
 * the rate. So the span starts at whichever is earlier. Cost dates are
 * calendar values (00:00 UTC) and are read as such, never through a zone.
 */
export function historyStartDay(
  createdAt: Date,
  earliestCostDates: (Date | null | undefined)[]
): string {
  let start = businessDay(createdAt);
  for (const date of earliestCostDates) {
    if (!date) continue;
    const day = rentalCalendarDay(date);
    if (day < start) start = day;
  }
  return start;
}

/** Months of history from `startDay` to the branch's today, fractional. */
export function monthsOfHistory(startDay: string, now: Date): number {
  return Math.max(0, daysBetween(startDay, businessDay(now))) / DAYS_PER_MONTH;
}

export type VehicleCostInput = {
  /** Every ACTIVE and COMPLETED rental, lifetime. */
  earned: number;
  /** Every repair, lifetime. */
  repairs: number;
  /** Every service, lifetime. */
  services: number;
  /** From `monthsOfHistory`. */
  months: number;
};

export type VehicleCosts = {
  recorded: number;
  net: number;
  perMonth: number | null;
  perYear: number | null;
};

export function vehicleCosts(input: VehicleCostInput): VehicleCosts {
  const recorded = input.repairs + input.services;
  const averaged = input.months >= MIN_MONTHS_TO_AVERAGE;
  const perMonth = averaged ? recorded / input.months : null;
  return {
    recorded,
    net: input.earned - recorded,
    perMonth,
    perYear: perMonth === null ? null : perMonth * 12,
  };
}
