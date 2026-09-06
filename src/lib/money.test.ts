import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { formatAmount, formatEur, toMoney } from "@/lib/money";

describe("money", () => {
  it("takes a Decimal, a string or a number", () => {
    expect(toMoney(new Prisma.Decimal("45.50"))).toBe(45.5);
    expect(toMoney("45.50")).toBe(45.5);
    expect(toMoney(45.5)).toBe(45.5);
  });

  /**
   * The bug this replaces: `toLocaleString(undefined, …)` means the *viewer's*
   * locale, so an operator on an English OS saw English grouping inside an
   * Albanian interface. Albanian groups with a space and uses a comma for the
   * decimal, so the two are unmistakably different.
   */
  it("formats in the app's locale, not the viewer's", () => {
    expect(formatEur(1234567.891, "en")).toBe("1,234,567.89 EUR");
    expect(formatEur(1234567.891, "sq")).not.toBe(formatEur(1234567.891, "en"));
    // Albanian groups with U+00A0 and uses a comma for the decimal.
    expect(formatEur(1234567.891, "sq")).toBe("1\u00a0234\u00a0567,89 EUR");
  });

  it("keeps two decimals by default, whatever the input looks like", () => {
    // The fleet grid used to render Number("9.50") as `9.5`.
    expect(formatEur(new Prisma.Decimal("9.50"), "en")).toBe("9.50 EUR");
    expect(formatEur(45, "en")).toBe("45.00 EUR");
  });

  it("drops the decimals only when asked", () => {
    expect(formatEur(1234.56, "en", { precision: 0 })).toBe("1,235 EUR");
  });

  it("omits the unit for sentences that supply their own", () => {
    // "At {rate} EUR/day" would otherwise read "At 45.00 EUR EUR/day".
    expect(formatAmount(45, "en")).toBe("45.00");
  });
});
