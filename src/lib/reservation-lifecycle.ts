import type { ReservationStatus } from "@prisma/client";
import {
  businessDay,
  businessTodayAsRentalDate,
  rentalCalendarDay,
} from "@/lib/business-time";

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
