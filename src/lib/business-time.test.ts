import { afterAll, describe, expect, it } from "vitest";
import {
  atBusinessPickupTime,
  businessDayStart,
  businessDayStartOf,
  businessMonthStartAsRentalDate,
  businessRentalDays,
  businessTodayAsRentalDate,
  businessYearStartAsRentalDate,
  rentalDateParam,
} from "@/lib/business-time";
import { isOverdueRental } from "@/lib/reservation-occupancy";
import {
  availabilitySchema,
  createBookingSchema,
} from "@/lib/validations/reservation";

/*
 * The rental-day ↔ instant boundary (audit finding P3-3), under both server
 * time zones the app actually runs in: UTC on Vercel, Europe/Belgrade on a
 * developer's machine. None of these may depend on which one it is. Node
 * re-reads process.env.TZ when it changes, so one run covers both.
 */
const originalTz = process.env.TZ;
afterAll(() => {
  process.env.TZ = originalTz;
});

describe.each(["UTC", "Europe/Belgrade"])("with the server in %s", (tz) => {
  const at = (iso: string) => {
    process.env.TZ = tz;
    return new Date(iso);
  };

  describe("atBusinessPickupTime", () => {
    it.each([
      ["2027-10-01T10:00:00.000Z", "2027-10-01T10:00:00.000Z"],
      ["2027-10-01T00:00:00.000Z", "2027-10-01T10:00:00.000Z"],
      ["2027-10-01T23:59:59.999Z", "2027-10-01T10:00:00.000Z"],
      ["2027-10-01T07:15:00.000Z", "2027-10-01T10:00:00.000Z"],
    ])("pins %s to %s", (input, expected) => {
      expect(atBusinessPickupTime(at(input)).toISOString()).toBe(expected);
    });

    it("matches what the forms send", () => {
      expect(new Date(rentalDateParam("2027-10-01")).toISOString()).toBe(
        "2027-10-01T10:00:00.000Z"
      );
    });
  });

  describe("today, in each time model", () => {
    // 00:30 on 14 Nov at the branch (winter, UTC+1).
    const justAfterMidnight = "2026-11-13T23:30:00.000Z";

    it("is the branch's calendar day for rental dates", () => {
      const today = businessRentalDays(at(justAfterMidnight));
      expect(today.gte.toISOString()).toBe("2026-11-14T00:00:00.000Z");
      expect(today.lt.toISOString()).toBe("2026-11-15T00:00:00.000Z");
      expect(
        businessTodayAsRentalDate(at(justAfterMidnight)).toISOString()
      ).toBe("2026-11-14T00:00:00.000Z");
    });

    it("is the instant the branch's day began for timestamps", () => {
      expect(businessDayStart(at(justAfterMidnight)).toISOString()).toBe(
        "2026-11-13T23:00:00.000Z"
      );
      // Summer: UTC+2.
      expect(businessDayStartOf("2027-07-01").toISOString()).toBe(
        "2027-06-30T22:00:00.000Z"
      );
    });

    /**
     * The analytics bug: "today's pickups" filtered rental dates with the
     * instant boundary, so a rental date late on the previous calendar day
     * (here 13 Nov, 23:45 in the naive model) counted as today's.
     */
    it("keeps yesterday's late rental date out of today's", () => {
      const now = at("2026-11-14T08:00:00.000Z");
      const lateYesterday = at("2026-11-13T23:45:00.000Z");
      const { gte, lt } = businessRentalDays(now);
      expect(lateYesterday >= gte && lateYesterday < lt).toBe(false);
      // What the old bound would have said:
      expect(lateYesterday >= businessDayStart(now)).toBe(true);
    });

    it("spans whole calendar days for a multi-day window", () => {
      const week = businessRentalDays(at("2026-11-14T08:00:00.000Z"), 7);
      expect(week.gte.toISOString()).toBe("2026-11-14T00:00:00.000Z");
      expect(week.lt.toISOString()).toBe("2026-11-21T00:00:00.000Z");
    });
  });

  describe("period starts for calendar-dated rows", () => {
    // 00:30 on 1 Jan at the branch, still 31 Dec in UTC.
    const newYear = "2026-12-31T23:30:00.000Z";

    it("follows the branch's year and month, not the server's", () => {
      expect(businessYearStartAsRentalDate(at(newYear)).toISOString()).toBe(
        "2027-01-01T00:00:00.000Z"
      );
      expect(businessMonthStartAsRentalDate(at(newYear)).toISOString()).toBe(
        "2027-01-01T00:00:00.000Z"
      );
    });
  });

  describe("overdue returns", () => {
    const rental = {
      status: "ACTIVE",
      returnDate: new Date("2026-11-13T10:00:00.000Z"),
    };

    it("is not overdue at 23:59 on the return day at the branch", () => {
      expect(isOverdueRental(rental, at("2026-11-13T22:59:00.000Z"))).toBe(
        false
      );
    });

    it("is overdue from the branch's midnight, not an hour later", () => {
      expect(isOverdueRental(rental, at("2026-11-13T23:00:00.000Z"))).toBe(
        true
      );
    });
  });

  describe("the public API's dates", () => {
    const booking = {
      vehicleId: "v1",
      customer: {
        firstName: "A",
        lastName: "B",
        email: "a@example.test",
        phone: "+383 44 000 000",
      },
    };

    it("normalises any instant to the business pickup time", () => {
      const parsed = createBookingSchema.parse({
        ...booking,
        pickupDate: "2027-10-01T23:30:00Z",
        returnDate: "2027-10-03",
      });
      expect(parsed.pickupDate.toISOString()).toBe("2027-10-01T10:00:00.000Z");
      expect(parsed.returnDate.toISOString()).toBe("2027-10-03T10:00:00.000Z");
    });

    it("normalises availability queries the same way", () => {
      const parsed = availabilitySchema.parse({
        vehicleId: "v1",
        pickupDate: "2027-10-01T00:00:00Z",
        returnDate: "2027-10-01T18:00:00Z",
      });
      expect(parsed.pickupDate.toISOString()).toBe("2027-10-01T10:00:00.000Z");
      expect(parsed.returnDate.toISOString()).toBe("2027-10-01T10:00:00.000Z");
    });
  });
});
