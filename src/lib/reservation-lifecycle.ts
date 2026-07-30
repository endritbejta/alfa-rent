import type { ReservationStatus } from "@prisma/client";

export const BUSINESS_TIME_ZONE = "Europe/Belgrade";

export type ReservationTiming = {
  canStart: boolean;
  startBlockedReason: string | null;
  attention:
    | "PICKUP_TODAY"
    | "PICKUP_OVERDUE"
    | "RETURN_TODAY"
    | "RETURN_OVERDUE"
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
 * Exact UTC instant at the start of a branch-local calendar day. This is
 * safe across Vercel's UTC runtime and Belgrade daylight-saving changes.
 */
export function businessDayStart(date: Date): Date {
  return businessCalendarStart(businessDay(date));
}

export function businessMonthStart(date: Date): Date {
  return businessCalendarStart(`${businessDay(date).slice(0, 7)}-01`);
}

export function businessWeekStart(date: Date): Date {
  const key = businessDay(date);
  const calendar = new Date(`${key}T12:00:00.000Z`);
  const daysSinceMonday = (calendar.getUTCDay() + 6) % 7;
  calendar.setUTCDate(calendar.getUTCDate() - daysSinceMonday);
  return businessCalendarStart(calendar.toISOString().slice(0, 10));
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

  let startBlockedReason: string | null = null;
  if (reservation.status === "CONFIRMED" && beforePickup) {
    startBlockedReason = "Available on the pickup date";
  } else if (reservation.status === "CONFIRMED" && afterReturn) {
    startBlockedReason = "Rental window has ended";
  }

  let attention: ReservationTiming["attention"] = null;
  if (reservation.status === "CONFIRMED") {
    if (afterReturn || today > pickup) attention = "PICKUP_OVERDUE";
    else if (today === pickup) attention = "PICKUP_TODAY";
  } else if (reservation.status === "ACTIVE") {
    if (afterReturn) attention = "RETURN_OVERDUE";
    else if (today === returnDay) attention = "RETURN_TODAY";
  }

  return {
    canStart:
      reservation.status === "CONFIRMED" && !beforePickup && !afterReturn,
    startBlockedReason,
    attention,
  };
}
