import type { Prisma } from "@prisma/client";

/**
 * Which reservations keep a vehicle from being booked for a date range.
 *
 * A CONFIRMED or ACTIVE booking occupies its scheduled half-open range — the
 * same rule the reservations_no_overlap constraint enforces. On top of that,
 * an ACTIVE rental whose scheduled return has passed occupies the car with no
 * end at all: the car is physically still out, and nobody knows when it will
 * be back. Staff release it by recording the return or by extending the
 * rental to the date it is now expected.
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
        pickupDate: { lt: range.returnDate },
        returnDate: { gt: range.pickupDate },
      },
      overdueRentalWhere(range.returnDate, now),
    ],
  };
}

/** ACTIVE past its scheduled return, already started before `before`. */
export function overdueRentalWhere(
  before: Date,
  now = new Date()
): Prisma.ReservationWhereInput {
  return {
    status: "ACTIVE",
    returnDate: { lt: now },
    pickupDate: { lt: before },
  };
}

export function isOverdueRental(
  reservation: { status: string; returnDate: Date },
  now = new Date()
): boolean {
  return (
    reservation.status === "ACTIVE" &&
    reservation.returnDate.getTime() < now.getTime()
  );
}
