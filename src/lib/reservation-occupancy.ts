import type { Prisma } from "@prisma/client";
import { rentalDayEnd, rentalDayStart } from "@/lib/rental-dates";
import {
  businessDay,
  businessTodayAsRentalDate,
  rentalCalendarDay,
} from "@/lib/business-time";

/**
 * Which reservations keep a vehicle from being booked for a date range.
 *
 * A CONFIRMED or ACTIVE booking occupies every calendar day from its pickup
 * day through its return day, both included — the same rule the
 * reservations_no_overlap constraint enforces. A pickup on another booking's
 * return day is therefore a clash. On top of that, an ACTIVE rental whose
 * return day has passed occupies the car with no end at all: the car is
 * physically still out, and nobody knows when it will be back. Staff release
 * it by recording the return or by extending the rental to the date it is
 * now expected.
 *
 * The constraint cannot express that second rule (it would need "now"), so
 * this is enforced in the application. Without it, a car three months
 * overdue was offered as available on the storefront and accepted a second
 * confirmed booking, discovered only when the handover failed.
 */
export function occupyingReservationWhere(
  range: { pickupDate: Date; returnDate: Date },
  now = new Date()
): Prisma.ReservationWhereInput {
  return {
    OR: [
      {
        status: { in: ["CONFIRMED", "ACTIVE"] },
        ...sharesRentalDayWhere(range),
      },
      overdueRentalWhere(range.returnDate, now),
    ],
  };
}

/**
 * Reservations with at least one calendar day in common with `range`, both
 * ends inclusive. Times of day are ignored: a booking returned at 10:00 on
 * the 26th still holds the 26th.
 */
export function sharesRentalDayWhere(range: {
  pickupDate: Date;
  returnDate: Date;
}): Prisma.ReservationWhereInput {
  return {
    pickupDate: { lt: rentalDayEnd(range.returnDate) },
    returnDate: { gte: rentalDayStart(range.pickupDate) },
  };
}

/**
 * ACTIVE with its return day behind us, picked up on or before `before`'s
 * day. The return day itself is still the renter's, so a car due back today
 * is not overdue until tomorrow.
 */
export function overdueRentalWhere(
  before: Date,
  now = new Date()
): Prisma.ReservationWhereInput {
  return {
    status: "ACTIVE",
    returnDate: { lt: businessTodayAsRentalDate(now) },
    pickupDate: { lt: rentalDayEnd(before) },
  };
}

export function isOverdueRental(
  reservation: { status: string; returnDate: Date },
  now = new Date()
): boolean {
  return (
    reservation.status === "ACTIVE" &&
    rentalCalendarDay(reservation.returnDate) < businessDay(now)
  );
}
