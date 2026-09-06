import { describe, expect, it } from "vitest";
import { subMonths } from "date-fns";
import {
  businessDayStart,
  businessMonthStart,
  businessWeekStart,
  businessYearStart,
} from "./reservation-lifecycle";

/**
 * The dashboard's "revenue this month" KPI used businessMonthStart while the
 * revenue chart beside it used date-fns startOfMonth, which on Vercel's UTC
 * runtime is a UTC month start. Belgrade is UTC+1/+2, so a booking made in the
 * last hours of a month UTC — already the new month locally — landed in a
 * different month in each, and two numbers on one screen disagreed
 * permanently.
 *
 * Analytics now resolves every period boundary through these helpers, so the
 * KPIs and the series cannot disagree about where a period begins.
 */
const iso = (d: Date) => d.toISOString();
const localTime = (d: Date) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Belgrade",
    dateStyle: "short",
    timeStyle: "short",
  }).format(d);

describe("branch-local period boundaries", () => {
  it("treats the last hours of a UTC month as the next branch month", () => {
    // 22:30 UTC on 31 August is 00:30 on 1 September in Belgrade (UTC+2).
    const lateAugustUtc = new Date("2026-08-31T22:30:00.000Z");
    const monthStart = businessMonthStart(lateAugustUtc);
    expect(iso(monthStart)).toBe("2026-08-31T22:00:00.000Z");
    // Which is local midnight on 1 September — so this booking counts toward
    // September in the KPI and in the chart alike.
    expect(localTime(monthStart)).toBe("01/09/2026, 00:00");
  });

  it("anchors a month to local midnight in both halves of the year", () => {
    // Winter, UTC+1.
    expect(iso(businessMonthStart(new Date("2026-01-15T12:00:00.000Z")))).toBe(
      "2025-12-31T23:00:00.000Z"
    );
    // Summer, UTC+2.
    expect(iso(businessMonthStart(new Date("2026-07-15T12:00:00.000Z")))).toBe(
      "2026-06-30T22:00:00.000Z"
    );
  });

  it("anchors a year to local midnight", () => {
    expect(iso(businessYearStart(new Date("2026-07-15T12:00:00.000Z")))).toBe(
      "2025-12-31T23:00:00.000Z"
    );
  });

  it("starts a week on Monday, local", () => {
    // 6 September 2026 is a Sunday; its week began on Monday the 31st.
    const sunday = new Date("2026-09-06T12:00:00.000Z");
    expect(localTime(businessWeekStart(sunday))).toBe("31/08/2026, 00:00");
  });

  /**
   * Why the series resolve each boundary from the calendar instead of adding a
   * fixed duration to one anchor: consecutive local days are not a constant
   * number of hours apart.
   */
  it("keeps day boundaries on local midnight on ordinary days", () => {
    for (const day of ["2026-02-10", "2026-06-10", "2026-11-10"]) {
      const start = businessDayStart(new Date(`${day}T12:00:00.000Z`));
      expect(localTime(start)).toBe(
        `${day.slice(8)}/${day.slice(5, 7)}/${day.slice(0, 4)}, 00:00`
      );
    }
  });

  it("walks back whole months without drifting or repeating", () => {
    const now = new Date("2026-09-06T12:00:00.000Z");
    const months = [0, 1, 2, 3, 4, 5].map((k) =>
      businessMonthStart(subMonths(now, k))
    );
    // Six distinct, strictly descending starts — no duplicate from a clamped
    // end-of-month, no skipped month.
    expect(new Set(months.map(iso)).size).toBe(6);
    for (let i = 1; i < months.length; i++) {
      expect(months[i]!.getTime()).toBeLessThan(months[i - 1]!.getTime());
    }
  });

  /**
   * Known, separately tracked: on the two daylight-saving transition days a
   * year, businessCalendarStart derives its offset from the target day's noon,
   * and midnight that day has a different offset — so the boundary lands an
   * hour out. Recorded here so the behaviour is visible and a change to it is
   * deliberate, not so that it stays.
   *
   * Effect is one hour, twice a year, on reporting boundaries only. Pickup
   * eligibility is unaffected: getReservationTiming compares calendar-day
   * strings through businessDay(), which does not use this path.
   */
  it("is an hour out on the two DST transition days (documented, not desired)", () => {
    // 29 March 2026 is 23 hours long in Belgrade.
    expect(
      localTime(businessDayStart(new Date("2026-03-29T12:00:00.000Z")))
    ).toBe("28/03/2026, 23:00");
    // 25 October 2026 is 25 hours long.
    expect(
      localTime(businessDayStart(new Date("2026-10-25T12:00:00.000Z")))
    ).toBe("25/10/2026, 01:00");
  });
});
