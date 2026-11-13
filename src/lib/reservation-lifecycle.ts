import type { ReservationStatus } from "@prisma/client";

export const BUSINESS_TIME_ZONE = "Europe/Belgrade";

export type ReservationTiming = {
  canStart: boolean;
  startBlockedReason: string | null;
  /**
   * CONFIRMED and the pickup day has passed with no handover recorded.
   * Starting it is still allowed — the car may well have gone out and
   * nobody pressed Start — but it needs an explicit confirmation, and staff
   * record the day it actually left.
   */
  lateStart: boolean;
  /**
   * CONFIRMED and the return day has passed too: the whole rental is in the
   * past. It can be recorded after the fact in one step (handover and
   * return together, no inspections), as well as started late if the car is
   * in fact still out.
   */
  canRecordPast: boolean;
  /** Calendar days as `YYYY-MM-DD`, so a client can bound a date input. */
  pickupDay: string;
  returnDay: string;
  today: string;
  attention:
    | "PICKUP_TODAY"
    | "PICKUP_OVERDUE"
    | "RETURN_TODAY"
    | "RETURN_OVERDUE"
    | "REQUEST_EXPIRED"
    | null;
};

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
 * A request whose pickup day has passed without a decision. Nobody can hand
 * the car over on a day that is gone, so it is no longer work to do: it leaves
 * the badge and the counts, and it can no longer be confirmed. The pickup day
 * itself still counts — a request for today can be confirmed this morning.
 *
 * Derived rather than stored, so no sweep has to run for it to be true, and
 * the row stays PENDING for staff to cancel or delete as before.
 */
export function isExpiredRequest(
  reservation: { status: ReservationStatus; pickupDate: Date },
  now = new Date()
): boolean {
  return (
    reservation.status === "PENDING" &&
    rentalCalendarDay(reservation.pickupDate) < businessDay(now)
  );
}

/** The database half of `isExpiredRequest`. */
export function expiredRequestWhere(now = new Date()) {
  return {
    status: "PENDING" as const,
    pickupDate: { lt: businessTodayAsRentalDate(now) },
  };
}

/** PENDING requests that still await a decision — the queue's real work. */
export function actionableRequestWhere(now = new Date()) {
  return {
    status: "PENDING" as const,
    pickupDate: { gte: businessTodayAsRentalDate(now) },
  };
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

export function getReservationTiming(
  reservation: {
    status: ReservationStatus;
    pickupDate: Date;
    returnDate: Date;
  },
  now = new Date()
): ReservationTiming {
  const today = businessDay(now);
  const pickup = rentalCalendarDay(reservation.pickupDate);
  const returnDay = rentalCalendarDay(reservation.returnDate);
  const beforePickup = today < pickup;
  const afterReturn = today > returnDay;

  // Only the start is guarded. A rental whose whole window has passed can
  // still be started — it happened, staff just forgot to press Start — and
  // is then flagged as a late start rather than refused.
  const startBlockedReason =
    reservation.status === "CONFIRMED" && beforePickup
      ? "Available on the pickup date"
      : null;

  let attention: ReservationTiming["attention"] = null;
  if (reservation.status === "CONFIRMED") {
    if (afterReturn || today > pickup) attention = "PICKUP_OVERDUE";
    else if (today === pickup) attention = "PICKUP_TODAY";
  } else if (reservation.status === "PENDING") {
    if (today > pickup) attention = "REQUEST_EXPIRED";
  } else if (reservation.status === "ACTIVE") {
    if (afterReturn) attention = "RETURN_OVERDUE";
    else if (today === returnDay) attention = "RETURN_TODAY";
  }

  return {
    canStart: reservation.status === "CONFIRMED" && !beforePickup,
    startBlockedReason,
    lateStart: reservation.status === "CONFIRMED" && today > pickup,
    canRecordPast: reservation.status === "CONFIRMED" && afterReturn,
    pickupDay: pickup,
    returnDay,
    today,
    attention,
  };
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
