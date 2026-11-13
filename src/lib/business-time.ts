import { rentalDayEnd, rentalDayStart } from "@/lib/rental-dates";

/**
 * The one place rental days and real instants meet (audit finding P3-3).
 *
 * Two time models are in use, deliberately, and they must not be mixed:
 *
 * - **Instants** — createdAt, audit times, handover and return records,
 *   rate-limit expiries. Real moments. "Today" for them is
 *   `businessDayStart(now)`: the instant the branch's day began, which is
 *   22:00 or 23:00 UTC the evening before.
 * - **Rental (calendar) dates** — pickupDate, returnDate, repair dates.
 *   Naive values stored in `timestamp without time zone`: `T10:00:00Z`
 *   means 10:00 *at the branch*, whatever zone the server runs in. "Today"
 *   for them is `businessTodayAsRentalDate(now)`: midnight "UTC" of the
 *   branch's calendar day.
 *
 * Comparing a rental date with an instant boundary works on most days by
 * coincidence and is wrong near midnight, so every boundary a query or
 * filter needs comes from here, already in the right model. Day arithmetic
 * within the rental model (inclusive day counts, day ends) stays in
 * rental-dates.ts and is built on, not repeated.
 *
 * Moving to timestamptz with real pickup and return times is a separate
 * owner decision (HANDOFF §6.4); this module is where it would land.
 */

export const BUSINESS_TIME_ZONE = "Europe/Belgrade";

/**
 * The time of day every rental date carries: 10:00 at the branch, written
 * as T10:00:00Z in the naive model. The booking form, the availability
 * widget and the staff dialog all send it; the API normalises anything else
 * to it, so two requests for the same days are the same booking.
 */
export const BUSINESS_PICKUP_HOUR = 10;

/**
 * A calendar day (`yyyy-MM-dd`) as the rental-date string every form sends.
 */
export function rentalDateParam(day: string): string {
  return `${day}T${String(BUSINESS_PICKUP_HOUR).padStart(2, "0")}:00:00Z`;
}

/**
 * A submitted pickup or return value as a rental date: its calendar day
 * (read in the naive model, i.e. its UTC day, like rentalCalendarDay) at
 * the business pickup time.
 *
 * The public API used to store whatever instant arrived, so `T23:30Z` and
 * `T10:00Z` for the same day were different bookings to the idempotency
 * check and sat at different points of the day in every comparison.
 */
export function atBusinessPickupTime(date: Date): Date {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      BUSINESS_PICKUP_HOUR
    )
  );
}

export function rentalCalendarDay(date: Date): string {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

/**
 * Rental dates are stored as UTC calendar values, while "today" follows the
 * branch's local business day. Keeping those concepts explicit avoids a
 * Vercel UTC deployment changing when a handover becomes eligible.
 */
export function businessDay(date: Date): string {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/**
 * The branch's wall-clock reading of an instant, as a Date whose *local*
 * fields hold it, for date-fns to format. Staff in another time zone (or a
 * laptop left on UTC) still read when something happened at the branch.
 * Only for display: the returned Date is not the same instant.
 */
export function businessWallClock(date: Date): Date {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((item) => item.type === type)?.value ?? 0);
  return new Date(
    part("year"),
    part("month") - 1,
    part("day"),
    part("hour"),
    part("minute"),
    part("second")
  );
}

/**
 * Exact UTC instant at the start of a branch-local calendar day. This is
 * safe across Vercel's UTC runtime and Belgrade daylight-saving changes.
 */
export function businessDayStart(date: Date): Date {
  return businessCalendarStart(businessDay(date));
}

export function businessMonthStart(date: Date): Date {
  return businessCalendarStart(`${businessDay(date).slice(0, 7)}-01`);
}

export function businessYearStart(date: Date): Date {
  return businessCalendarStart(`${businessDay(date).slice(0, 4)}-01-01`);
}

export function businessWeekStart(date: Date): Date {
  const key = businessDay(date);
  const calendar = new Date(`${key}T12:00:00.000Z`);
  const daysSinceMonday = (calendar.getUTCDay() + 6) % 7;
  calendar.setUTCDate(calendar.getUTCDate() - daysSinceMonday);
  return businessCalendarStart(calendar.toISOString().slice(0, 10));
}

/**
 * Today's business day expressed in the rental-date model: midnight "UTC" of
 * the branch-local calendar day. Rental dates are naive calendar values
 * (`T10:00:00Z` means 10:00 at the branch), so comparing one with this is a
 * comparison of calendar days, not of instants.
 */
export function businessTodayAsRentalDate(now = new Date()): Date {
  return new Date(`${businessDay(now)}T00:00:00.000Z`);
}

/**
 * Rental dates falling on the branch's next `days` calendar days, starting
 * today: `{ gte, lt }` for a Prisma filter on pickupDate or returnDate.
 *
 * "Today's pickups" used to filter rental dates with the instant the
 * branch's day began, which is the previous evening in UTC — so a pickup
 * stored at 22:30 the day before counted as today's.
 */
export function businessRentalDays(
  now = new Date(),
  days = 1
): { gte: Date; lt: Date } {
  const gte = businessTodayAsRentalDate(now);
  const last = new Date(gte.getTime() + (days - 1) * 24 * 60 * 60 * 1000);
  return { gte: rentalDayStart(gte), lt: rentalDayEnd(last) };
}

/**
 * The instant a given branch calendar day (`yyyy-MM-dd`) began: the
 * day-key form of businessDayStart, for bucket bounds already held as keys.
 */
export function businessDayStartOf(day: string): Date {
  return businessCalendarStart(day);
}

/** The first day of the branch's current month, in the rental-date model. */
export function businessMonthStartAsRentalDate(now = new Date()): Date {
  return new Date(`${businessDay(now).slice(0, 7)}-01T00:00:00.000Z`);
}

/** The first day of the branch's current year, in the rental-date model. */
export function businessYearStartAsRentalDate(now = new Date()): Date {
  return new Date(`${businessDay(now).slice(0, 4)}-01-01T00:00:00.000Z`);
}

/**
 * The instant to record for a handover or return staff enter after the
 * fact, given only the day it happened.
 *
 * Today means now. An earlier day takes the scheduled time of day (rental
 * dates are naive calendar values: `T10:00:00Z` is 10:00 at the branch),
 * which is the best guess there is and keeps the record on the right day.
 * On a clock-change day that guess can be an hour out; the day is what
 * matters. Never later than `now`.
 */
export function recordedRentalInstant(
  day: string,
  scheduled: Date,
  now = new Date()
): Date {
  if (day >= businessDay(now)) return now;
  const minutes = scheduled.getUTCHours() * 60 + scheduled.getUTCMinutes();
  const instant = new Date(
    businessCalendarStart(day).getTime() + minutes * 60_000
  );
  return instant > now ? now : instant;
}

function businessCalendarStart(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  const noonUtc = new Date(Date.UTC(year, month - 1, day, 12));
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(noonUtc);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  const representedAsUtc = Date.UTC(
    value("year"),
    value("month") - 1,
    value("day"),
    value("hour"),
    value("minute")
  );
  const offset = representedAsUtc - noonUtc.getTime();
  return new Date(Date.UTC(year, month - 1, day) - offset);
}
