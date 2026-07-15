import { Prisma } from "@prisma/client";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Rental billing counts started days: any partial day rounds up,
 * and the minimum charge is one day.
 */
export function rentalDays(pickupDate: Date, returnDate: Date): number {
  const ms = returnDate.getTime() - pickupDate.getTime();
  if (ms <= 0) {
    throw new RangeError("returnDate must be after pickupDate");
  }
  return Math.max(1, Math.ceil(ms / MS_PER_DAY));
}

export function calculateTotalPrice(
  pricePerDay: Prisma.Decimal,
  pickupDate: Date,
  returnDate: Date
): Prisma.Decimal {
  return pricePerDay.mul(rentalDays(pickupDate, returnDate));
}
