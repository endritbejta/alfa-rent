import { describe, expect, it } from "vitest";
import {
  latestReturnBefore,
  rentalDayEnd,
  rentalDayStart,
  rentalDays,
  rentalDaysBetween,
  returnDayFor,
  withTimeOfDay,
} from "./rental-dates";

/** Rentals are stored with a 10:00 UTC time of day. */
const at = (iso: string) => new Date(iso);

describe("withTimeOfDay", () => {
  it("moves the calendar day but keeps the agreed time", () => {
    const result = withTimeOfDay(
      at("2026-07-19T10:00:00Z"),
      at("2026-07-25T00:00:00Z")
    );
    expect(result.toISOString()).toBe("2026-07-25T10:00:00.000Z");
  });

  it("ignores the target's own time of day", () => {
    const result = withTimeOfDay(
      at("2026-07-19T10:00:00Z"),
      at("2026-07-25T23:59:59Z")
    );
    expect(result.toISOString()).toBe("2026-07-25T10:00:00.000Z");
  });

  it("reads and writes in UTC regardless of the host's zone", () => {
    // 23:30Z is already "tomorrow" in Kosovo, so a local-time implementation
    // would land a day off here on a developer's machine but not on Vercel.
    const result = withTimeOfDay(
      at("2026-07-19T23:30:00Z"),
      at("2026-07-25T00:00:00Z")
    );
    expect(result.toISOString()).toBe("2026-07-25T23:30:00.000Z");
  });
});

describe("rentalDays", () => {
  it("counts a same-day return as one day", () => {
    expect(rentalDays(at("2026-11-25T10:00Z"), at("2026-11-25T10:00Z"))).toBe(
      1
    );
  });

  it("counts both the pickup and the return day", () => {
    expect(rentalDays(at("2026-11-25T10:00Z"), at("2026-11-26T10:00Z"))).toBe(
      2
    );
  });

  it("counts calendar days, not 24-hour periods", () => {
    // Any time of day on either end: it is the days that are booked.
    expect(rentalDays(at("2026-11-25T08:00Z"), at("2026-11-26T18:00Z"))).toBe(
      2
    );
    expect(rentalDays(at("2026-11-25T18:00Z"), at("2026-11-26T08:00Z"))).toBe(
      2
    );
  });

  it("crosses a month boundary", () => {
    expect(rentalDays(at("2026-01-30T10:00Z"), at("2026-02-02T10:00Z"))).toBe(
      4
    );
  });

  it("crosses a leap February", () => {
    expect(rentalDays(at("2028-02-28T10:00Z"), at("2028-03-01T10:00Z"))).toBe(
      3
    );
  });

  it("crosses a year boundary", () => {
    expect(rentalDays(at("2026-12-31T10:00Z"), at("2027-01-01T10:00Z"))).toBe(
      2
    );
  });

  it("is not moved by a daylight-saving change", () => {
    expect(rentalDays(at("2026-03-28T10:00Z"), at("2026-03-30T10:00Z"))).toBe(
      3
    );
  });

  it("refuses a return before the pickup day", () => {
    expect(() =>
      rentalDays(at("2026-11-26T10:00Z"), at("2026-11-25T10:00Z"))
    ).toThrow(RangeError);
  });
});

describe("rentalDaysBetween and returnDayFor", () => {
  it("reads calendar-day strings the same way", () => {
    expect(rentalDaysBetween("2026-11-25", "2026-11-25")).toBe(1);
    expect(rentalDaysBetween("2026-11-25", "2026-11-26")).toBe(2);
    expect(rentalDaysBetween("2026-12-29", "2027-01-04")).toBe(7);
  });

  it("returns on the pickup day for one day and six days on for a week", () => {
    expect(returnDayFor("2026-11-25", 1)).toBe("2026-11-25");
    expect(returnDayFor("2026-11-25", 7)).toBe("2026-12-01");
    expect(returnDayFor("2026-12-28", 7)).toBe("2027-01-03");
  });

  it("is the inverse of rentalDaysBetween", () => {
    for (const days of [1, 2, 7, 31, 365]) {
      expect(
        rentalDaysBetween("2026-02-20", returnDayFor("2026-02-20", days))
      ).toBe(days);
    }
  });

  it("refuses a duration under one day", () => {
    expect(() => returnDayFor("2026-11-25", 0)).toThrow(RangeError);
  });
});

describe("rentalDayStart and rentalDayEnd", () => {
  it("bound the whole calendar day of a rental date", () => {
    const pickup = at("2026-11-25T10:00:00Z");
    expect(rentalDayStart(pickup).toISOString()).toBe(
      "2026-11-25T00:00:00.000Z"
    );
    expect(rentalDayEnd(pickup).toISOString()).toBe("2026-11-26T00:00:00.000Z");
  });
});

describe("latestReturnBefore", () => {
  it("is the day before the next pickup — the return day is a rental day", () => {
    const result = latestReturnBefore(
      at("2026-07-19T10:00:00Z"),
      at("2026-07-27T10:00:00Z")
    );
    expect(result.toISOString()).toBe("2026-07-26T10:00:00.000Z");
  });

  it("keeps the rental's own time of day whatever the next pickup's is", () => {
    const result = latestReturnBefore(
      at("2026-07-19T10:00:00Z"),
      at("2026-08-01T08:00:00Z")
    );
    expect(result.toISOString()).toBe("2026-07-31T10:00:00.000Z");
  });
});

/**
 * The drawer previews the added cost by counting calendar days, while the
 * service bills the difference of two rentalDays() calls. They must agree,
 * or staff are quoted one figure and the customer charged another.
 */
describe("extension billing agrees with the drawer's preview", () => {
  const pickup = at("2026-07-16T10:00:00Z");
  const currentReturn = at("2026-07-19T10:00:00Z");

  for (const added of [1, 2, 5, 30]) {
    it(`bills exactly ${added} extra day(s)`, () => {
      const target = withTimeOfDay(
        currentReturn,
        new Date(currentReturn.getTime() + added * 24 * 60 * 60 * 1000)
      );
      const billed =
        rentalDays(pickup, target) - rentalDays(pickup, currentReturn);
      expect(billed).toBe(added);
    });
  }

  it("bills a whole day even across a DST-shifting month", () => {
    // Europe/Pristina springs forward in March; UTC arithmetic must not care.
    const springPickup = at("2026-03-27T10:00:00Z");
    const springReturn = at("2026-03-28T10:00:00Z");
    const target = withTimeOfDay(springReturn, at("2026-03-30T00:00:00Z"));
    const billed =
      rentalDays(springPickup, target) - rentalDays(springPickup, springReturn);
    expect(billed).toBe(2);
  });
});
