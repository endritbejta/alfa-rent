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
  latestReturnDate: "2026-09-01",
};

describe("booking calendar", () => {
  it("treats blocked ranges as half-open calendar intervals", () => {
    expect(isBookingDayBlocked("2026-08-10", calendar.blockedRanges)).toBe(
      true
    );
    expect(isBookingDayBlocked("2026-08-12", calendar.blockedRanges)).toBe(
      true
    );
    expect(isBookingDayBlocked("2026-08-13", calendar.blockedRanges)).toBe(
      false
    );
  });

  it("allows a return exactly when the next reservation starts", () => {
    expect(isBookingRangeAvailable("2026-08-07", "2026-08-10", calendar)).toBe(
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

  it("allows a new pickup on the previous reservation's return day", () => {
    expect(isBookingRangeAvailable("2026-08-13", "2026-08-15", calendar)).toBe(
      true
    );
  });

  it("enforces the inclusive registration return limit", () => {
    expect(isBookingRangeAvailable("2026-08-28", "2026-09-01", calendar)).toBe(
      true
    );
    expect(isBookingRangeAvailable("2026-08-28", "2026-09-02", calendar)).toBe(
      false
    );
  });
});
