import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { calculateTotalPrice, usedDaysCharge } from "./pricing";

const d = (iso: string) => new Date(iso);

describe("calculateTotalPrice", () => {
  it("charges both the pickup and the return day", () => {
    // The owner's example: 25 → 26 Nov at 53/day is two days, 106 EUR.
    const total = calculateTotalPrice(
      new Prisma.Decimal("53"),
      d("2026-11-25T10:00Z"),
      d("2026-11-26T10:00Z")
    );
    expect(total.toFixed(2)).toBe("106.00");
  });

  it("charges one day for a same-day return", () => {
    const total = calculateTotalPrice(
      new Prisma.Decimal("53"),
      d("2026-11-25T10:00Z"),
      d("2026-11-25T10:00Z")
    );
    expect(total.toFixed(2)).toBe("53.00");
  });

  it("multiplies day count by the daily rate without float drift", () => {
    const total = calculateTotalPrice(
      new Prisma.Decimal("49.99"),
      d("2026-08-01T10:00Z"),
      d("2026-08-04T10:00Z")
    );
    // 1, 2, 3 and 4 August.
    expect(total.toFixed(2)).toBe("199.96");
  });

  it("refuses a return before the pickup", () => {
    expect(() =>
      calculateTotalPrice(
        new Prisma.Decimal("53"),
        d("2026-11-26T10:00Z"),
        d("2026-11-25T10:00Z")
      )
    ).toThrow(RangeError);
  });
});

describe("usedDaysCharge", () => {
  it("charges the used days at the booking's agreed rate", () => {
    // The owner's Kia Rio: 26/day agreed, out and back on 13 Nov.
    const charge = usedDaysCharge(
      new Prisma.Decimal("26"),
      1,
      new Prisma.Decimal("78")
    );
    expect(charge.toFixed(2)).toBe("26.00");
  });

  it("never charges more than the booking", () => {
    // Priced on the old exclusive count: 3 billed days for 13 → 16 Nov.
    // Back on the 15th is 3 inclusive days, which must not exceed 78.
    const charge = usedDaysCharge(
      new Prisma.Decimal("26"),
      4,
      new Prisma.Decimal("78")
    );
    expect(charge.toFixed(2)).toBe("78.00");
  });

  it("refuses a day count below one", () => {
    expect(() =>
      usedDaysCharge(new Prisma.Decimal("26"), 0, new Prisma.Decimal("78"))
    ).toThrow(RangeError);
  });
});
