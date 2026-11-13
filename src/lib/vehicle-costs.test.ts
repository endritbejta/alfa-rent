import { describe, expect, it } from "vitest";
import {
  MIN_MONTHS_TO_AVERAGE,
  historyStartDay,
  monthsOfHistory,
  vehicleCosts,
} from "./vehicle-costs";

const DAYS_PER_MONTH = 365.25 / 12;

describe("vehicleCosts", () => {
  it("counts every repair and every service, and nets them off earnings", () => {
    const c = vehicleCosts({
      earned: 5000,
      repairs: 500.75,
      services: 300.25,
      months: 24,
    });
    expect(c.recorded).toBeCloseTo(801, 2);
    expect(c.net).toBeCloseTo(4199, 2);
  });

  it("averages all recorded costs, services included, over the history", () => {
    const c = vehicleCosts({
      earned: 0,
      repairs: 600,
      services: 600,
      months: 24,
    });
    expect(c.perMonth).toBeCloseTo(50, 6);
    expect(c.perYear).toBeCloseTo(600, 6);
  });

  /**
   * The bug this guards: the divisor used to be floored at one month, so a
   * car added this month with one €400 bill showed €4,800 a year.
   */
  it("shows no average under three months of history", () => {
    const early = vehicleCosts({
      earned: 0,
      repairs: 400,
      services: 0,
      months: 0.4,
    });
    expect(early.perMonth).toBeNull();
    expect(early.perYear).toBeNull();
    // The lifetime figures are still there.
    expect(early.recorded).toBe(400);
    expect(early.net).toBe(-400);
  });

  it("starts averaging at exactly the threshold", () => {
    expect(MIN_MONTHS_TO_AVERAGE).toBe(3);
    const below = vehicleCosts({
      earned: 0,
      repairs: 300,
      services: 0,
      months: 2.99,
    });
    const at = vehicleCosts({
      earned: 0,
      repairs: 300,
      services: 0,
      months: 3,
    });
    expect(below.perYear).toBeNull();
    expect(at.perMonth).toBeCloseTo(100, 6);
    expect(at.perYear).toBeCloseTo(1200, 6);
  });

  it("reports a car with no costs as zero, not as missing", () => {
    const c = vehicleCosts({ earned: 0, repairs: 0, services: 0, months: 12 });
    expect(c.perYear).toBe(0);
    expect(c.recorded).toBe(0);
  });
});

describe("historyStartDay", () => {
  // 23:30 UTC on 31 March is already 1 April at the branch (UTC+2).
  const addedLateEvening = new Date("2026-03-31T23:30:00.000Z");

  it("reads the day a car was added on the branch's calendar", () => {
    expect(historyStartDay(addedLateEvening, [])).toBe("2026-04-01");
  });

  it("starts at an earlier repair or service, read as a calendar value", () => {
    expect(
      historyStartDay(addedLateEvening, [
        new Date("2025-06-10T00:00:00.000Z"),
        null,
        new Date("2025-09-01T00:00:00.000Z"),
      ])
    ).toBe("2025-06-10");
  });

  it("ignores costs dated after the car was added", () => {
    expect(
      historyStartDay(addedLateEvening, [new Date("2026-05-01T00:00:00.000Z")])
    ).toBe("2026-04-01");
  });
});

describe("monthsOfHistory", () => {
  it("counts calendar days to the branch's today", () => {
    // 10:00 UTC on 1 July is 1 July at the branch: 91 days after 1 April.
    const months = monthsOfHistory(
      "2026-04-01",
      new Date("2026-07-01T10:00:00.000Z")
    );
    expect(months).toBeCloseTo(91 / DAYS_PER_MONTH, 6);
  });

  it("uses the branch's day, not UTC's, around midnight", () => {
    // 22:30 UTC on 30 June is already 1 July in Belgrade.
    expect(
      monthsOfHistory("2026-04-01", new Date("2026-06-30T22:30:00.000Z"))
    ).toBeCloseTo(91 / DAYS_PER_MONTH, 6);
  });

  it("is never negative", () => {
    expect(
      monthsOfHistory("2026-12-01", new Date("2026-11-13T10:00:00.000Z"))
    ).toBe(0);
  });
});
