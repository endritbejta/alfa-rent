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
