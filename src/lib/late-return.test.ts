import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { lateReturnDays, lateReturnSummary } from "@/lib/late-return";
import { additionalDaysCharge } from "@/lib/pricing";
import { rentalDaysBetween } from "@/lib/rental-dates";
import { lateReturnSchema } from "@/lib/validations/inspection";

describe("lateReturnDays", () => {
  it("is 0 for a return on the booked return day, or earlier", () => {
    expect(lateReturnDays("2026-11-13", "2026-11-13")).toBe(0);
    expect(lateReturnDays("2026-11-13", "2026-11-10")).toBe(0);
  });

  it("counts the days past the return day: due Friday, back Monday is 3", () => {
    // Fri 13 Nov 2026 → Mon 16 Nov: Saturday, Sunday and Monday.
    expect(lateReturnDays("2026-11-13", "2026-11-16")).toBe(3);
    expect(lateReturnDays("2026-11-13", "2026-11-14")).toBe(1);
  });

  it("charges exactly the days an extension to the same day would add", () => {
    const pickup = "2026-11-10";
    const due = "2026-11-13";
    const back = "2026-11-16";
    expect(lateReturnDays(due, back)).toBe(
      rentalDaysBetween(pickup, back) - rentalDaysBetween(pickup, due)
    );
  });

  it("crosses month and year boundaries", () => {
    expect(lateReturnDays("2026-11-30", "2026-12-02")).toBe(2);
    expect(lateReturnDays("2027-02-28", "2027-03-01")).toBe(1);
    expect(lateReturnDays("2028-02-28", "2028-03-01")).toBe(2); // leap year
    expect(lateReturnDays("2026-12-31", "2027-01-03")).toBe(3);
  });

  it("is unaffected by the clock change at the end of October", () => {
    expect(lateReturnDays("2026-10-24", "2026-10-26")).toBe(2);
  });
});

describe("additionalDaysCharge", () => {
  it("prices the days at the rate in Decimal, without float drift", () => {
    expect(
      additionalDaysCharge(new Prisma.Decimal("33.33"), 3).toFixed(2)
    ).toBe("99.99");
    expect(additionalDaysCharge(new Prisma.Decimal("40"), 0).toFixed(2)).toBe(
      "0.00"
    );
  });

  it("refuses a fractional or negative day count", () => {
    expect(() => additionalDaysCharge(new Prisma.Decimal(40), 1.5)).toThrow();
    expect(() => additionalDaysCharge(new Prisma.Decimal(40), -1)).toThrow();
  });
});

describe("lateReturnSchema", () => {
  it("needs a reason of at least ten characters to waive", () => {
    expect(
      lateReturnSchema.safeParse({ resolution: "WAIVE", reason: "  ok  " })
        .success
    ).toBe(false);
    expect(
      lateReturnSchema.safeParse({
        resolution: "WAIVE",
        reason: "Broke down; agreed with the owner.",
      }).success
    ).toBe(true);
  });

  it("needs a positive whole number of days to charge", () => {
    expect(
      lateReturnSchema.safeParse({ resolution: "CHARGE", days: "3" }).data
    ).toEqual({ resolution: "CHARGE", days: 3 });
    expect(
      lateReturnSchema.safeParse({ resolution: "CHARGE", days: 0 }).success
    ).toBe(false);
  });
});

describe("lateReturnSummary", () => {
  it("is null for a rental that was not late", () => {
    expect(
      lateReturnSummary({
        lateDays: null,
        lateResolution: null,
        lateCharge: null,
        lateWaiverReason: null,
      })
    ).toBeNull();
  });

  it("turns a Decimal charge into a plain number", () => {
    expect(
      lateReturnSummary({
        lateDays: 3,
        lateResolution: "CHARGED",
        lateCharge: new Prisma.Decimal("120.00"),
        lateWaiverReason: null,
      })
    ).toEqual({
      days: 3,
      resolution: "CHARGED",
      charge: 120,
      waiverReason: null,
    });
  });
});
