import { describe, expect, it } from "vitest";
import {
  bucketLabel,
  bucketStart,
  businessBuckets,
  shiftBucket,
} from "./business-buckets";

describe("bucketStart", () => {
  it("starts weeks on Monday, like date_trunc('week')", () => {
    // 2026-11-12 is a Thursday; 2026-11-15 a Sunday.
    expect(bucketStart("week", "2026-11-12")).toBe("2026-11-09");
    expect(bucketStart("week", "2026-11-15")).toBe("2026-11-09");
    expect(bucketStart("week", "2026-11-16")).toBe("2026-11-16");
    // Across a year boundary.
    expect(bucketStart("week", "2027-01-01")).toBe("2026-12-28");
  });

  it("starts months and years on their first day", () => {
    expect(bucketStart("month", "2026-02-28")).toBe("2026-02-01");
    expect(bucketStart("year", "2026-11-12")).toBe("2026-01-01");
  });
});

describe("shiftBucket", () => {
  it("moves by whole calendar months, whatever their length", () => {
    expect(shiftBucket("month", "2026-01-01", 1)).toBe("2026-02-01");
    expect(shiftBucket("month", "2026-03-01", -1)).toBe("2026-02-01");
    expect(shiftBucket("month", "2026-11-01", -11)).toBe("2025-12-01");
    expect(shiftBucket("month", "2026-12-01", 1)).toBe("2027-01-01");
  });

  it("moves weeks by seven calendar days across daylight saving", () => {
    // Belgrade leaves summer time on 25 Oct 2026; a calendar key has no
    // timezone, so nothing drifts.
    expect(shiftBucket("week", "2026-10-19", 1)).toBe("2026-10-26");
    expect(shiftBucket("week", "2026-03-30", -1)).toBe("2026-03-23");
  });

  it("moves years", () => {
    expect(shiftBucket("year", "2026-01-01", -4)).toBe("2022-01-01");
  });
});

describe("businessBuckets", () => {
  it("ends with the bucket holding today and includes it in full", () => {
    const now = new Date("2026-11-12T09:00:00.000Z");
    const { starts, end } = businessBuckets("month", 6, now);
    expect(starts).toEqual([
      "2026-06-01",
      "2026-07-01",
      "2026-08-01",
      "2026-09-01",
      "2026-10-01",
      "2026-11-01",
    ]);
    expect(end).toBe("2026-12-01");
  });

  it("uses the branch's day, not UTC's", () => {
    // 23:30 UTC on 31 Oct is already 1 Nov in Belgrade (UTC+1 in winter).
    const now = new Date("2026-10-31T23:30:00.000Z");
    expect(businessBuckets("month", 1, now).starts).toEqual(["2026-11-01"]);
    // And 22:30 UTC on Sunday 15 Nov is Sunday 23:30 locally: still that week.
    const sunday = new Date("2026-11-15T22:30:00.000Z");
    expect(businessBuckets("week", 1, sunday)).toEqual({
      starts: ["2026-11-09"],
      end: "2026-11-16",
    });
  });
});

describe("bucketLabel", () => {
  it("names the bucket's own month on any server timezone", () => {
    expect(bucketLabel("month", "2026-11-01")).toBe("Nov");
    expect(bucketLabel("week", "2026-11-09")).toBe("09 Nov");
    expect(bucketLabel("year", "2026-01-01")).toBe("2026");
  });
});
