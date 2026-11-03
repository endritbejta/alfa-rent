import { describe, expect, it } from "vitest";
import { formatNumber } from "@/lib/number-format";

/**
 * Amounts that exercise every rule: no grouping below five integer digits,
 * groups of three above, negatives, values that round in both directions,
 * and the halfway cases where rounding the stored double and rounding its
 * shortest decimal disagree (1.005 is stored as 1.00499…, yet Intl writes
 * 1.01).
 */
const SAMPLES = [
  0,
  7,
  45.5,
  65.5,
  92,
  162,
  999,
  999.995,
  1000,
  1748,
  9999.99,
  10000,
  12345,
  12345.678,
  99999.5,
  123456,
  1234567.891,
  1e9 + 0.5,
  -45.5,
  -1234.5,
  -12345.678,
  1.005,
  2.675,
  0.125,
];

describe("formatNumber", () => {
  /**
   * The point of writing Albanian by hand is that it must never drift from
   * what full ICU writes, which is what the server sent before this change.
   * Node ships full ICU, so it is the reference here; the guard keeps the
   * comparison from passing vacuously on a runtime without Albanian.
   */
  it("writes Albanian exactly as full ICU does", () => {
    expect(Intl.NumberFormat.supportedLocalesOf(["sq"])).toEqual(["sq"]);
    for (const fractionDigits of [0, 2] as const) {
      const icu = new Intl.NumberFormat("sq", {
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits,
      });
      for (const value of SAMPLES) {
        expect(formatNumber(value, "sq", fractionDigits), String(value)).toBe(
          icu.format(value)
        );
      }
    }
  });

  it("groups Albanian from five digits, with a no-break space", () => {
    expect(formatNumber(1748, "sq")).toBe("1748");
    expect(formatNumber(12345, "sq")).toBe("12 345");
    expect(formatNumber(1234567.891, "sq", 2)).toBe("1 234 567,89");
    expect(formatNumber(-1234.5, "sq", 2)).toBe("-1234,50");
  });

  it("leaves English to Intl", () => {
    expect(formatNumber(1748, "en")).toBe("1,748");
    expect(formatNumber(1234567.891, "en", 2)).toBe("1,234,567.89");
  });

  it("writes counts without decimals by default", () => {
    // Odometer readings on the inspection screens.
    expect(formatNumber(84250, "sq")).toBe("84 250");
    expect(formatNumber(84250, "en")).toBe("84,250");
  });
});
