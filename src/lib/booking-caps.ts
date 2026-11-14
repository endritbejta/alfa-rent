import { rentalCalendarDay } from "@/lib/business-time";
import { ConflictError } from "@/lib/errors";

/**
 * Caps on open website booking requests (audit finding P2-1b).
 *
 * The per-IP limiter bounds how fast one address can file requests; it says
 * nothing about how many pile up for one person or one car, and an attacker
 * with many addresses gets around it anyway. These count what actually
 * lands in the pending queue staff work through.
 *
 * Only the public booking path applies them. Staff creating a reservation in
 * the admin are the people the queue is for, and are never capped.
 */

/**
 * Open requests (PENDING, pickup today or later) one email or phone may have
 * at once. Three covers a family asking for two cars plus a change of plan;
 * past that the customer is waiting on an answer, not missing a form.
 */
export const MAX_OPEN_REQUESTS_PER_CONTACT = 3;

/**
 * Open requests one car may have on any single day. Requests do not block
 * each other (only CONFIRMED and ACTIVE do), so a busy August weekend can
 * honestly gather a few; past five, staff can only refuse the rest.
 */
export const MAX_OPEN_REQUESTS_PER_VEHICLE_DAY = 5;

const DAY_MS = 24 * 60 * 60 * 1000;

type Range = { pickupDate: Date; returnDate: Date };

/**
 * The most requests in `others` that hold any one calendar day of `range`,
 * both ends inclusive. `others` are the car's open requests sharing a day
 * with it.
 */
export function busiestDayCount(range: Range, others: Range[]): number {
  const spans = others.map((other) => ({
    from: rentalCalendarDay(other.pickupDate),
    to: rentalCalendarDay(other.returnDate),
  }));
  const last = rentalCalendarDay(range.returnDate);
  let busiest = 0;
  // Rental dates sit at the business pickup time, so whole days of
  // milliseconds step through calendar days; the 365-day maximum bounds it.
  for (
    let at = range.pickupDate.getTime();
    rentalCalendarDay(new Date(at)) <= last;
    at += DAY_MS
  ) {
    const day = rentalCalendarDay(new Date(at));
    const holding = spans.filter((s) => s.from <= day && day <= s.to).length;
    busiest = Math.max(busiest, holding);
  }
  return busiest;
}

/** Refuses a request past either cap, in the customer's own language. */
export function assertWithinRequestCaps({
  openForContact,
  busiestVehicleDay,
}: {
  openForContact: number;
  busiestVehicleDay: number;
}): void {
  if (openForContact >= MAX_OPEN_REQUESTS_PER_CONTACT) {
    throw new ConflictError(
      `You already have ${MAX_OPEN_REQUESTS_PER_CONTACT} booking requests waiting for an answer`,
      {
        key: "err.pendingLimitContact",
        values: { count: MAX_OPEN_REQUESTS_PER_CONTACT },
      }
    );
  }
  if (busiestVehicleDay >= MAX_OPEN_REQUESTS_PER_VEHICLE_DAY) {
    throw new ConflictError(
      "This vehicle already has several requests waiting for those dates",
      { key: "err.pendingLimitVehicle" }
    );
  }
}
