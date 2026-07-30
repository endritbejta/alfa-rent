export type BlockedBookingRange = {
  /** Inclusive calendar day, formatted as yyyy-MM-dd. */
  from: string;
  /** Exclusive calendar day, formatted as yyyy-MM-dd. */
  to: string;
};

export type VehicleBookingCalendar = {
  blockedRanges: BlockedBookingRange[];
  /** Latest allowed return day, inclusive. Null means no registration limit. */
  latestReturnDate: string | null;
};

export function isBookingDayBlocked(
  day: string,
  blockedRanges: BlockedBookingRange[]
): boolean {
  return blockedRanges.some((range) => range.from <= day && day < range.to);
}

export function bookingRangeOverlaps(
  from: string,
  to: string,
  blockedRanges: BlockedBookingRange[]
): boolean {
  return blockedRanges.some((range) => range.from < to && range.to > from);
}

export function isBookingRangeAvailable(
  from: string | null | undefined,
  to: string | null | undefined,
  calendar: VehicleBookingCalendar
): boolean {
  if (!from || !to || to <= from) return false;
  if (calendar.latestReturnDate && to > calendar.latestReturnDate) return false;
  return !bookingRangeOverlaps(from, to, calendar.blockedRanges);
}
