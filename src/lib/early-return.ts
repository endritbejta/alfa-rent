import { rentalDaysBetween } from "@/lib/rental-dates";

/**
 * Early returns: a car that comes back before its booked return day. The
 * mirror of lib/late-return, and client-safe for the same reason — no
 * Prisma, no server code — so the return dialog shows the figures the
 * service will record.
 *
 * Staff choose how to bill it:
 *   ACTUAL_DAYS   the days used, at the rate the booking was agreed at,
 *                 never more than the booking itself;
 *   FULL_BOOKING  the booked amount, as every return was billed before.
 */
export const EARLY_RETURN_BILLINGS = ["ACTUAL_DAYS", "FULL_BOOKING"] as const;
export type EarlyReturnBilling = (typeof EARLY_RETURN_BILLINGS)[number];

/**
 * Rental days from the booked pickup day to the day the car came back,
 * both counted — the one convention every rental day count here uses, so a
 * car out and back on its pickup day is one day.
 *
 * From the booked pickup day, not the handover: the car was held for the
 * renter from that day whether or not they collected it on time, and the
 * booking was priced from it.
 */
export function actualRentalDays(
  pickupDay: string,
  returnedOn: string
): number {
  return rentalDaysBetween(pickupDay, returnedOn);
}

/**
 * The days used when the car came back before its booked return day, or
 * null when it did not (on the day, or late). All `yyyy-MM-dd`.
 */
export function earlyReturnDays(
  pickupDay: string,
  returnDay: string,
  returnedOn: string
): number | null {
  if (!returnedOn || returnedOn >= returnDay || returnedOn < pickupDay) {
    return null;
  }
  return actualRentalDays(pickupDay, returnedOn);
}

const cents = (value: number) => Math.round(value * 100) / 100;

/**
 * What each billing choice comes to, for display. The service computes the
 * same in Decimal (lib/pricing's usedDaysCharge); these are plain numbers,
 * rounded to the cent so 3 × 33.33 prints as 99.99.
 */
export function earlyReturnAmounts({
  dailyRate,
  usedDays,
  bookedTotal,
}: {
  dailyRate: number;
  usedDays: number;
  bookedTotal: number;
}): Record<EarlyReturnBilling, number> {
  return {
    ACTUAL_DAYS: Math.min(cents(dailyRate * usedDays), cents(bookedTotal)),
    FULL_BOOKING: cents(bookedTotal),
  };
}

/** The settled outcome as the drawer shows it. Plain numbers only. */
export type EarlyReturnSummary = {
  billing: EarlyReturnBilling;
  usedDays: number;
  /** The booked amount the choice was made against. */
  bookedTotal: number;
};

/** Null for a rental that did not come back early (or predates the columns). */
export function earlyReturnSummary(row: {
  earlyReturnBilling: EarlyReturnBilling | null;
  actualDays: number | null;
  bookedTotal: { toString(): string } | number | null;
}): EarlyReturnSummary | null {
  if (!row.earlyReturnBilling || !row.actualDays || row.bookedTotal === null) {
    return null;
  }
  return {
    billing: row.earlyReturnBilling,
    usedDays: row.actualDays,
    bookedTotal: Number(row.bookedTotal),
  };
}
