import { describe, expect, it } from "vitest";
import {
  earlyReturnAmounts,
  earlyReturnDays,
  earlyReturnSummary,
} from "./early-return";

describe("earlyReturnDays", () => {
  it("counts the used days inclusively from the booked pickup day", () => {
    expect(earlyReturnDays("2026-11-13", "2026-11-16", "2026-11-13")).toBe(1);
    expect(earlyReturnDays("2026-11-13", "2026-11-16", "2026-11-15")).toBe(3);
  });

  it("is null on the return day, after it, or with no day", () => {
    expect(earlyReturnDays("2026-11-13", "2026-11-16", "2026-11-16")).toBe(
      null
    );
    expect(earlyReturnDays("2026-11-13", "2026-11-16", "2026-11-18")).toBe(
      null
    );
    expect(earlyReturnDays("2026-11-13", "2026-11-16", "")).toBe(null);
  });

  it("can never apply to a same-day rental", () => {
    expect(earlyReturnDays("2026-11-13", "2026-11-13", "2026-11-13")).toBe(
      null
    );
  });
});

describe("earlyReturnAmounts", () => {
  it("prices each option", () => {
    expect(
      earlyReturnAmounts({ dailyRate: 26, usedDays: 1, bookedTotal: 78 })
    ).toEqual({ ACTUAL_DAYS: 26, FULL_BOOKING: 78 });
  });

  it("caps the used days at the booked amount", () => {
    expect(
      earlyReturnAmounts({ dailyRate: 26, usedDays: 4, bookedTotal: 78 })
        .ACTUAL_DAYS
    ).toBe(78);
  });

  it("rounds to the cent", () => {
    expect(
      earlyReturnAmounts({ dailyRate: 33.33, usedDays: 3, bookedTotal: 133.32 })
        .ACTUAL_DAYS
    ).toBe(99.99);
  });
});

describe("earlyReturnSummary", () => {
  it("is null for a rental that was not returned early", () => {
    expect(
      earlyReturnSummary({
        earlyReturnBilling: null,
        actualDays: 4,
        bookedTotal: 104,
      })
    ).toBe(null);
  });

  it("converts the booked amount to a number", () => {
    expect(
      earlyReturnSummary({
        earlyReturnBilling: "ACTUAL_DAYS",
        actualDays: 1,
        bookedTotal: { toString: () => "78.00" },
      })
    ).toEqual({ billing: "ACTUAL_DAYS", usedDays: 1, bookedTotal: 78 });
  });
});
