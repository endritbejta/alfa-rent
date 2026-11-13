/**
 * The days a vehicle is taken, for the storefront's date pickers.
 *
 * Both ends are inclusive calendar days (`yyyy-MM-dd`): a booking holds its
 * pickup day through its return day, so a booking 18 → 24 Nov blocks the
 * 24th too and the earliest next pickup is the 25th. Same rule as the
 * reservations_no_overlap constraint.
 */
export type BlockedBookingRange = {
  /** First booked day, inclusive. */
  from: string;
  /** Last booked day (the return day), inclusive. */
  to: string;
};

export type VehicleBookingCalendar = {
  blockedRanges: BlockedBookingRange[];
};

export function isBookingDayBlocked(
  day: string,
  blockedRanges: BlockedBookingRange[]
): boolean {
  return blockedRanges.some((range) => range.from <= day && day <= range.to);
}

/** Whether pickup day `from` through return day `to` touches a taken day. */
export function bookingRangeOverlaps(
  from: string,
  to: string,
  blockedRanges: BlockedBookingRange[]
): boolean {
  return blockedRanges.some((range) => range.from <= to && range.to >= from);
}

/** A same-day return (`from === to`) is a valid one-day rental. */
export function isBookingRangeAvailable(
  from: string | null | undefined,
  to: string | null | undefined,
  calendar: VehicleBookingCalendar
): boolean {
  if (!from || !to || to < from) return false;
  return !bookingRangeOverlaps(from, to, calendar.blockedRanges);
}
