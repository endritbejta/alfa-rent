import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { calculateTotalPrice, rentalDays } from "./pricing";

const d = (iso: string) => new Date(iso);

describe("rentalDays", () => {
  it("counts whole days", () => {
    expect(rentalDays(d("2026-08-01T10:00Z"), d("2026-08-04T10:00Z"))).toBe(3);
  });

  it("rounds a partial day up", () => {
    expect(rentalDays(d("2026-08-01T10:00Z"), d("2026-08-02T15:00Z"))).toBe(2);
  });

  it("charges a minimum of one day", () => {
    expect(rentalDays(d("2026-08-01T10:00Z"), d("2026-08-01T12:00Z"))).toBe(1);
  });

  it("rejects an inverted range", () => {
    expect(() =>
      rentalDays(d("2026-08-04T10:00Z"), d("2026-08-01T10:00Z"))
    ).toThrow(RangeError);
  });

  it("rejects a zero-length range", () => {
    expect(() =>
      rentalDays(d("2026-08-01T10:00Z"), d("2026-08-01T10:00Z"))
    ).toThrow(RangeError);
  });
});

describe("calculateTotalPrice", () => {
  it("multiplies day count by the daily rate without float drift", () => {
    const total = calculateTotalPrice(
      new Prisma.Decimal("49.99"),
      d("2026-08-01T10:00Z"),
      d("2026-08-04T10:00Z")
    );
    expect(total.toFixed(2)).toBe("149.97");
  });
});
