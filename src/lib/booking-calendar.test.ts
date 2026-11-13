import { describe, expect, it } from "vitest";
import {
  bookingRangeOverlaps,
  isBookingDayBlocked,
  isBookingRangeAvailable,
  type VehicleBookingCalendar,
} from "./booking-calendar";

const calendar: VehicleBookingCalendar = {
  blockedRanges: [
    { from: "2026-08-10", to: "2026-08-13" },
    { from: "2026-08-20", to: "2026-08-22" },
  ],
};

describe("booking calendar", () => {
  it("treats blocked ranges as inclusive calendar days", () => {
    for (const day of ["2026-08-10", "2026-08-12", "2026-08-13"]) {
      expect(isBookingDayBlocked(day, calendar.blockedRanges)).toBe(true);
    }
    expect(isBookingDayBlocked("2026-08-09", calendar.blockedRanges)).toBe(
      false
    );
    expect(isBookingDayBlocked("2026-08-14", calendar.blockedRanges)).toBe(
      false
    );
  });

  it("refuses a return on the day the next reservation starts", () => {
    expect(isBookingRangeAvailable("2026-08-07", "2026-08-10", calendar)).toBe(
      false
    );
    expect(isBookingRangeAvailable("2026-08-07", "2026-08-09", calendar)).toBe(
      true
    );
  });

  it("rejects ranges that cross an unavailable day", () => {
    expect(
      bookingRangeOverlaps("2026-08-07", "2026-08-11", calendar.blockedRanges)
    ).toBe(true);
    expect(isBookingRangeAvailable("2026-08-07", "2026-08-11", calendar)).toBe(
      false
    );
  });

  it("refuses a pickup on the previous reservation's return day", () => {
    expect(isBookingRangeAvailable("2026-08-13", "2026-08-15", calendar)).toBe(
      false
    );
    expect(isBookingRangeAvailable("2026-08-14", "2026-08-15", calendar)).toBe(
      true
    );
  });

  it("accepts a same-day return as one day", () => {
    expect(isBookingRangeAvailable("2026-08-15", "2026-08-15", calendar)).toBe(
      true
    );
    expect(isBookingRangeAvailable("2026-08-13", "2026-08-13", calendar)).toBe(
      false
    );
    expect(isBookingRangeAvailable("2026-08-16", "2026-08-15", calendar)).toBe(
      false
    );
  });
});
