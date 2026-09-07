import { describe, expect, it } from "vitest";
import { latestUnder, withTimeOfDay } from "./rental-dates";
import { rentalDays } from "./pricing";

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

describe("latestUnder", () => {
  it("lands exactly on the next pickup — touching is not overlapping", () => {
    // The exclusion constraint compares half-open tsranges, so a return at
    // the next booking's pickup instant is legal.
    const result = latestUnder(
      at("2026-07-19T10:00:00Z"),
      at("2026-07-27T10:00:00Z")
    );
    expect(result.toISOString()).toBe("2026-07-27T10:00:00.000Z");
  });

  it("steps back a day when the rental's time would overshoot the ceiling", () => {
    // Registration expires at midnight on the 1st; a 10:00 return on the 1st
    // would run ten hours past it, so the 31st is the last usable day.
    const result = latestUnder(
      at("2026-07-19T10:00:00Z"),
      at("2026-08-01T00:00:00Z")
    );
    expect(result.toISOString()).toBe("2026-07-31T10:00:00.000Z");
  });

  it("keeps the ceiling's day when the rental's time fits under it", () => {
    const result = latestUnder(
      at("2026-07-19T10:00:00Z"),
      at("2026-08-01T18:00:00Z")
    );
    expect(result.toISOString()).toBe("2026-08-01T10:00:00.000Z");
  });

  it("never returns a value above the ceiling", () => {
    const ceiling = at("2026-08-01T00:00:00Z");
    const result = latestUnder(at("2026-07-19T10:00:00Z"), ceiling);
    expect(result.getTime()).toBeLessThanOrEqual(ceiling.getTime());
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
