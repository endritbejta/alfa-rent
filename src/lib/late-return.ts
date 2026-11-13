import { rentalDaysBetween } from "@/lib/rental-dates";

/**
 * Late returns (audit P2-4): a car that comes back after its booked return
 * day. Client-safe on purpose — no Prisma, no server code — so the return
 * dialog shows the same N the service will charge.
 */

/** Bounds of the reason staff must give to waive the late days. */
export const LATE_WAIVER_REASON_MIN = 10;
export const LATE_WAIVER_REASON_MAX = 500;

/**
 * Days past the booked return day, counted the way rental days are: the
 * return day is already the renter's, so a car due Friday and back Monday is
 * three days late (Saturday, Sunday, Monday) — exactly the days an extension
 * from Friday to Monday would have added. Back on the return day, or before,
 * is 0.
 *
 * Both arguments are calendar days (`yyyy-MM-dd`): the booked return day and
 * the business day the car actually came back.
 */
export function lateReturnDays(returnDay: string, returnedOn: string): number {
  if (returnedOn <= returnDay) return 0;
  return rentalDaysBetween(returnDay, returnedOn) - 1;
}

export type LateResolution = "CHARGED" | "WAIVED";

/** The settled outcome as the drawer and list show it. Plain numbers only. */
export type LateReturnSummary = {
  days: number;
  resolution: LateResolution;
  /** What was added to the total; 0 when waived. */
  charge: number;
  waiverReason: string | null;
};

/** Null for a rental that was never late (or predates the columns). */
export function lateReturnSummary(row: {
  lateDays: number | null;
  lateResolution: LateResolution | null;
  lateCharge: { toString(): string } | number | null;
  lateWaiverReason: string | null;
}): LateReturnSummary | null {
  if (!row.lateDays || !row.lateResolution) return null;
  return {
    days: row.lateDays,
    resolution: row.lateResolution,
    charge: row.lateCharge === null ? 0 : Number(row.lateCharge),
    waiverReason: row.lateWaiverReason,
  };
}
