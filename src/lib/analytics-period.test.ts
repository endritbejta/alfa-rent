import { describe, expect, it } from "vitest";
import {
  allowedGranularities,
  autoGranularity,
  comparisonPeriod,
  elapsedPart,
  isDayKey,
  monthOptions,
  parseCompareMode,
  parseGranularity,
  parsePeriod,
  periodBuckets,
  stepPeriod,
} from "./analytics-period";

const TODAY = "2026-11-13";
const SPAN = { first: "2025-06-02", last: "2026-12-04" };
const parse = (raw: string | undefined) => parsePeriod(raw, TODAY, SPAN);

describe("parsePeriod", () => {
  it("resolves the month and year presets against today", () => {
    expect(parse("this-month")).toMatchObject({
      kind: "month",
      from: "2026-11-01",
      to: "2026-11-30",
      token: "2026-11",
      preset: "this-month",
    });
    expect(parse("last-month")).toMatchObject({
      from: "2026-10-01",
      to: "2026-10-31",
      token: "2026-10",
    });
    expect(parse("this-year")).toMatchObject({
      kind: "year",
      from: "2026-01-01",
      to: "2026-12-31",
    });
    expect(parse("last-year")).toMatchObject({ token: "2025" });
  });

  it("takes last month across a year boundary", () => {
    expect(parsePeriod("last-month", "2027-01-05", null)).toMatchObject({
      from: "2026-12-01",
      to: "2026-12-31",
    });
  });

  it("makes 'last N months' whole calendar months ending this month", () => {
    expect(parse("3m")).toMatchObject({
      kind: "range",
      from: "2026-09-01",
      to: "2026-11-30",
    });
    expect(parse("12m")).toMatchObject({
      from: "2025-12-01",
      to: "2026-11-30",
    });
    expect(parse("6m")).toMatchObject({ from: "2026-06-01" });
  });

  it("bounds all time by the data, and by today when there is none", () => {
    expect(parse("all")).toMatchObject({
      kind: "all",
      from: "2025-06-02",
      to: "2026-12-04",
    });
    expect(parsePeriod("all", TODAY, null)).toMatchObject({
      from: TODAY,
      to: TODAY,
    });
  });

  it("reads a month, a year and a custom range", () => {
    expect(parse("2024-02")).toMatchObject({
      kind: "month",
      from: "2024-02-01",
      to: "2024-02-29",
    });
    expect(parse("2025-02")).toMatchObject({ to: "2025-02-28" });
    expect(parse("2025")).toMatchObject({ kind: "year", from: "2025-01-01" });
    expect(parse("2026-03-01_2026-08-31")).toMatchObject({
      kind: "range",
      from: "2026-03-01",
      to: "2026-08-31",
      token: "2026-03-01_2026-08-31",
    });
  });

  it("puts a reversed range the right way round", () => {
    expect(parse("2026-08-31_2026-03-01")).toMatchObject({
      from: "2026-03-01",
      to: "2026-08-31",
    });
  });

  it("falls back to this month for anything unreadable", () => {
    for (const raw of [
      undefined,
      "",
      "2026-13",
      "1890",
      "2026-02-30_2026-03-01",
      "2026-01-01_2026-02-01_2026-03-01",
      "yesterday",
    ]) {
      expect(parse(raw).token).toBe("2026-11");
    }
  });
});

describe("isDayKey", () => {
  it("accepts only real calendar days", () => {
    expect(isDayKey("2024-02-29")).toBe(true);
    expect(isDayKey("2025-02-29")).toBe(false);
    expect(isDayKey("2026-4-01")).toBe(false);
  });
});

describe("stepPeriod", () => {
  it("steps months across year boundaries", () => {
    expect(stepPeriod(parse("2026-01"), -1)).toBe("2025-12");
    expect(stepPeriod(parse("2025-12"), 1)).toBe("2026-01");
  });

  it("steps years", () => {
    expect(stepPeriod(parse("2026"), -1)).toBe("2025");
    expect(stepPeriod(parse("this-year"), 1)).toBe("2027");
  });

  it("does not step a range or all time", () => {
    expect(stepPeriod(parse("3m"), 1)).toBeNull();
    expect(stepPeriod(parse("all"), -1)).toBeNull();
  });
});

describe("comparisonPeriod", () => {
  it("compares a month with the month before, whatever its length", () => {
    expect(comparisonPeriod(parse("2026-03"), "prev")).toEqual({
      from: "2026-02-01",
      to: "2026-02-28",
    });
    expect(comparisonPeriod(parse("2026-01"), "prev")).toEqual({
      from: "2025-12-01",
      to: "2025-12-31",
    });
  });

  it("compares a month with the same month a year earlier", () => {
    expect(comparisonPeriod(parse("2026-11"), "yoy")).toEqual({
      from: "2025-11-01",
      to: "2025-11-30",
    });
    // February keeps being a whole month across a leap year.
    expect(comparisonPeriod(parse("2025-02"), "yoy")).toEqual({
      from: "2024-02-01",
      to: "2024-02-29",
    });
    expect(comparisonPeriod(parse("2024-02"), "yoy")).toEqual({
      from: "2023-02-01",
      to: "2023-02-28",
    });
  });

  it("compares a year with the year before both ways", () => {
    const expected = { from: "2025-01-01", to: "2025-12-31" };
    expect(comparisonPeriod(parse("2026"), "prev")).toEqual(expected);
    expect(comparisonPeriod(parse("2026"), "yoy")).toEqual(expected);
  });

  it("compares whole months with as many whole months before", () => {
    expect(comparisonPeriod(parse("3m"), "prev")).toEqual({
      from: "2026-06-01",
      to: "2026-08-31",
    });
  });

  it("compares any other range with as many days just before it", () => {
    expect(comparisonPeriod(parse("2026-03-10_2026-03-19"), "prev")).toEqual({
      from: "2026-02-28",
      to: "2026-03-09",
    });
    expect(comparisonPeriod(parse("2026-03-10_2026-03-19"), "yoy")).toEqual({
      from: "2025-03-10",
      to: "2025-03-19",
    });
  });

  it("never compares all time, or with comparison off", () => {
    expect(comparisonPeriod(parse("all"), "prev")).toBeNull();
    expect(comparisonPeriod(parse("2026"), "none")).toBeNull();
  });
});

describe("parseCompareMode", () => {
  it("defaults to the previous period and turns off for all time", () => {
    expect(parseCompareMode(undefined, parse("2026"))).toBe("prev");
    expect(parseCompareMode("yoy", parse("2026"))).toBe("yoy");
    expect(parseCompareMode("bogus", parse("2026"))).toBe("prev");
    expect(parseCompareMode("yoy", parse("all"))).toBe("none");
  });
});

describe("granularity", () => {
  it("adapts to the period's length", () => {
    expect(autoGranularity(parse("2026-11"))).toBe("day");
    expect(autoGranularity(parse("3m"))).toBe("week");
    expect(autoGranularity(parse("6m"))).toBe("month");
    expect(autoGranularity(parse("2026"))).toBe("month");
    expect(autoGranularity({ from: "2023-01-01", to: "2026-12-31" })).toBe(
      "year"
    );
  });

  it("refuses a granularity coarser than the period or over 400 buckets", () => {
    expect(parseGranularity("year", parse("2026-11"))).toBe("day");
    expect(parseGranularity("week", parse("2026"))).toBe("week");
    expect(
      parseGranularity("day", { from: "2024-01-01", to: "2026-12-31" })
    ).toBe("year");
    expect(allowedGranularities(parse("2026-11"))).toEqual(["day", "week"]);
  });
});

describe("periodBuckets", () => {
  it("clips the first and last week to the period", () => {
    // 1 Nov 2026 is a Sunday: its week began on Monday 26 Oct.
    const weeks = periodBuckets(parse("2026-11"), "week");
    expect(weeks[0]).toEqual({
      key: "2026-10-26",
      from: "2026-11-01",
      to: "2026-11-01",
    });
    expect(weeks.at(-1)).toEqual({
      key: "2026-11-30",
      from: "2026-11-30",
      to: "2026-11-30",
    });
    expect(weeks).toHaveLength(6);
  });

  it("gives a DST month all its calendar days", () => {
    // Belgrade moves its clocks on 29 March and 25 October 2026; calendar
    // days are not instants, so both months have every day once.
    expect(periodBuckets(parse("2026-03"), "day")).toHaveLength(31);
    expect(periodBuckets(parse("2026-10"), "day")).toHaveLength(31);
  });
});

describe("elapsedPart", () => {
  it("cuts a period at today, or drops it when it is all ahead", () => {
    expect(elapsedPart(parse("2026-11"), TODAY)).toEqual({
      from: "2026-11-01",
      to: TODAY,
    });
    expect(elapsedPart(parse("2026-10"), TODAY)).toEqual({
      from: "2026-10-01",
      to: "2026-10-31",
    });
    expect(elapsedPart(parse("2026-12"), TODAY)).toBeNull();
  });
});

describe("monthOptions", () => {
  it("lists months newest first", () => {
    expect(monthOptions("2025-11-20", "2026-02-03")).toEqual([
      "2026-02",
      "2026-01",
      "2025-12",
      "2025-11",
    ]);
  });
});
