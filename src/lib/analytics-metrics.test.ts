import { describe, expect, it } from "vitest";
import {
  averageFleet,
  cents,
  change,
  extreme,
  fleetWindow,
  overlapDays,
  ratio,
  trend,
} from "./analytics-metrics";

describe("ratio", () => {
  it("is undefined, not zero, without a denominator", () => {
    expect(ratio(3, 4)).toBe(0.75);
    expect(ratio(0, 0)).toBeNull();
  });
});

describe("change", () => {
  it("reports the difference and the percentage", () => {
    expect(change(1180, 1000)).toEqual({
      previous: 1000,
      delta: 180,
      pct: 0.18,
      direction: "up",
    });
    expect(change(50, 100)).toMatchObject({ pct: -0.5, direction: "down" });
  });

  it("has no percentage from zero", () => {
    expect(change(340, 0)).toMatchObject({ pct: null, direction: "up" });
  });

  it("treats sub-cent noise as flat", () => {
    expect(change(100.004, 100).direction).toBe("flat");
  });

  it("sees a rate move that is small in money terms", () => {
    // 8.4% → 8.8%: under the money threshold, well over the rate one.
    expect(change(0.088, 0.084).direction).toBe("flat");
    expect(change(0.088, 0.084, 0.0005).direction).toBe("up");
  });
});

describe("cents", () => {
  it("rounds to the stored precision", () => {
    expect(cents(33.333333)).toBe(33.33);
    expect(cents(66.666667)).toBe(66.67);
  });
});

describe("fleetWindow", () => {
  it("starts at the record, or at an earlier first rental", () => {
    expect(
      fleetWindow({
        added: "2026-03-10",
        firstRental: null,
        retired: null,
        lastRental: null,
      })
    ).toEqual({ start: "2026-03-10", end: null });
    expect(
      fleetWindow({
        added: "2026-03-10",
        firstRental: "2026-01-05",
        retired: null,
        lastRental: "2026-02-01",
      })
    ).toEqual({ start: "2026-01-05", end: null });
  });

  it("ends a retired car at retirement, or at a later last rental", () => {
    expect(
      fleetWindow({
        added: "2026-01-01",
        firstRental: "2026-02-01",
        retired: "2026-06-30",
        lastRental: "2026-05-10",
      })
    ).toEqual({ start: "2026-01-01", end: "2026-06-30" });
    expect(
      fleetWindow({
        added: "2026-01-01",
        firstRental: "2026-02-01",
        retired: "2026-04-01",
        lastRental: "2026-04-03",
      })
    ).toEqual({ start: "2026-01-01", end: "2026-04-03" });
  });
});

describe("overlapDays", () => {
  const november = { from: "2026-11-01", to: "2026-11-30" };

  it("counts a whole month for a car there throughout", () => {
    expect(overlapDays({ start: "2025-01-01", end: null }, november)).toBe(30);
  });

  it("counts a car added mid-period from the day it arrived", () => {
    expect(overlapDays({ start: "2026-11-21", end: null }, november)).toBe(10);
  });

  it("counts a car retired mid-period up to its last day", () => {
    expect(
      overlapDays({ start: "2025-01-01", end: "2026-11-10" }, november)
    ).toBe(10);
  });

  it("counts nothing for a car outside the period", () => {
    expect(
      overlapDays({ start: "2025-01-01", end: "2026-10-31" }, november)
    ).toBe(0);
    expect(overlapDays({ start: "2026-12-01", end: null }, november)).toBe(0);
  });
});

describe("averageFleet", () => {
  it("weighs each car by its days in the period", () => {
    // 30 days with two cars and one that arrived for the last 15 days.
    expect(
      averageFleet(30 + 30 + 15, { from: "2026-11-01", to: "2026-11-30" })
    ).toBe(2.5);
    expect(averageFleet(10, null)).toBe(0);
  });
});

describe("extreme", () => {
  const points = [
    { key: "a", value: 0 },
    { key: "b", value: 5 },
    { key: "c", value: 9 },
  ];

  it("finds the highest, and the lowest month that had any data", () => {
    expect(extreme(points, "max")?.key).toBe("c");
    expect(extreme(points, "min")?.key).toBe("b");
    expect(extreme([{ key: "a", value: 0 }], "min")).toBeNull();
  });
});

describe("trend", () => {
  it("says nothing on thin or flat data", () => {
    expect(trend([1, 2, 3])).toBeNull();
    expect(trend([0, 0, 0, 0, 5, 6])).toBeNull();
    expect(trend([10, 10, 10, 10.5, 10, 10])).toBeNull();
  });

  it("calls a clear move", () => {
    expect(trend([10, 12, 11, 20, 22, 25])).toBe("up");
    expect(trend([30, 28, 25, 10, 9, 8])).toBe("down");
  });
});
