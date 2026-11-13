import { Prisma } from "@prisma/client";
import { rentalDays } from "@/lib/rental-dates";

/**
 * A booking's price: the daily rate times its inclusive day count (pickup
 * day and return day both count — see rentalDays).
 */
export function calculateTotalPrice(
  pricePerDay: Prisma.Decimal,
  pickupDate: Date,
  returnDate: Date
): Prisma.Decimal {
  return pricePerDay.mul(rentalDays(pickupDate, returnDate));
}

/**
 * Days added to a rental after it was agreed — an extension, or days kept
 * past the return day — charged at the car's rate today. The days already
 * agreed keep the price they were agreed at; only these are repriced.
 */
export function additionalDaysCharge(
  pricePerDay: Prisma.Decimal,
  days: number
): Prisma.Decimal {
  if (!Number.isInteger(days) || days < 0) {
    throw new RangeError("days must be a non-negative integer");
  }
  return pricePerDay.mul(days);
}

/**
 * An early return billed for the days actually used: those days at the rate
 * the booking was agreed at, never more than the booking itself.
 *
 * The rate is the booking's, not the car's today and not total ÷ days —
 * see `Reservation.dailyRate`. The cap matters for a booking priced on the
 * old exclusive day count, or extended at a lower rate: there the used days
 * at the agreed rate can come to more than was ever booked, and returning
 * early must never cost more than staying.
 */
export function usedDaysCharge(
  dailyRate: Prisma.Decimal,
  days: number,
  bookedTotal: Prisma.Decimal
): Prisma.Decimal {
  if (!Number.isInteger(days) || days < 1) {
    throw new RangeError("days must be a positive integer");
  }
  return Prisma.Decimal.min(dailyRate.mul(days), bookedTotal);
}
