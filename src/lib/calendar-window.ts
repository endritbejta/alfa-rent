import { businessDay, rentalCalendarDay } from "@/lib/reservation-lifecycle";

/**
 * The admin calendar's date window, and where each reservation's bar sits in
 * it.
 *
 * The window is anchored on today — one month back, twelve ahead — rather
 * than on the data. It used to start at the oldest open reservation and stop
 * fourteen months later, so a single request nobody actioned eventually
 * pushed today, and every upcoming booking, off the end of the calendar.
 *
 * Everything here is calendar-day arithmetic on UTC dates, the same naive
 * model rental dates are stored in (`T10:00:00Z` means 10:00 at the branch),
 * with "today" taken from the business day in Europe/Belgrade. Nothing
 * depends on the server's own timezone.
 */
export const CALENDAR_MONTHS_BACK = 1;
export const CALENDAR_MONTHS_AHEAD = 12;

const DAY_MS = 24 * 60 * 60 * 1000;

export type CalendarMonth = {
  /** `yyyy-MM` */
  key: string;
  /** Index of the month's first day within the window. */
  start: number;
  days: number;
};

export type CalendarWindow = {
  /** Midnight UTC of the first day shown. */
  start: Date;
  /** Midnight UTC of the day after the last day shown (exclusive). */
  end: Date;
  /** `yyyy-MM-dd` for every day shown, in order. */
  days: string[];
  months: CalendarMonth[];
  /** Always inside the window, by construction. */
  todayIndex: number;
};

export function calendarWindow(now = new Date()): CalendarWindow {
  const [year, month] = businessDay(now).split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1 - CALENDAR_MONTHS_BACK, 1));
  const end = new Date(Date.UTC(year, month + CALENDAR_MONTHS_AHEAD, 1));

  const days: string[] = [];
  for (let t = start.getTime(); t < end.getTime(); t += DAY_MS) {
    days.push(rentalCalendarDay(new Date(t)));
  }

  const months: CalendarMonth[] = [];
  for (
    let cursor = start;
    cursor < end;
    cursor = new Date(
      Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1)
    )
  ) {
    const next = Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1);
    months.push({
      key: rentalCalendarDay(cursor).slice(0, 7),
      start: dayIndex(start, cursor),
      days: Math.round((next - cursor.getTime()) / DAY_MS),
    });
  }

  return {
    start,
    end,
    days,
    months,
    todayIndex: dayIndex(start, new Date(`${businessDay(now)}T00:00:00Z`)),
  };
}

/**
 * Where a reservation's bar sits in the window, or null if none of it is
 * inside.
 *
 * A booking occupies its pickup day up to, not including, its return day —
 * the same half-open range the exclusion constraint enforces. An ACTIVE
 * rental occupies at least through today: the car is out until staff record
 * its return, so an overdue one stays visible, running to today, however old
 * its scheduled return is. Bars are clamped to the window at both ends.
 */
export function calendarBar(
  reservation: { status: string; pickupDate: Date; returnDate: Date },
  window: Pick<CalendarWindow, "start" | "days" | "todayIndex">
): { start: number; span: number } | null {
  const pickup = dayIndex(window.start, reservation.pickupDate);
  let endExclusive = dayIndex(window.start, reservation.returnDate);
  if (reservation.status === "ACTIVE") {
    endExclusive = Math.max(endExclusive, window.todayIndex + 1);
  }

  const from = Math.max(0, pickup);
  const to = Math.min(window.days.length, endExclusive);
  if (from >= window.days.length || to <= 0) return null;
  return { start: from, span: Math.max(1, to - from) };
}

/** Calendar days from the window's first day to `date`'s calendar day. */
function dayIndex(start: Date, date: Date): number {
  const day = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate()
  );
  return Math.round((day - start.getTime()) / DAY_MS);
}
