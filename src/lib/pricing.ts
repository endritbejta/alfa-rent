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
