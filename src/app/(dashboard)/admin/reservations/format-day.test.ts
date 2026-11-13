import { describe, expect, it } from "vitest";
import { formatRentalPeriod } from "./format-day";

describe("formatRentalPeriod", () => {
  it("says each part of the range once", () => {
    expect(formatRentalPeriod("2026-11-13", "2026-11-13")).toBe("13 Nov 2026");
    expect(formatRentalPeriod("2026-11-13", "2026-11-16")).toBe(
      "13–16 Nov 2026"
    );
    expect(formatRentalPeriod("2026-10-28", "2026-11-01")).toBe(
      "28 Oct – 1 Nov 2026"
    );
    expect(formatRentalPeriod("2026-12-28", "2027-01-02")).toBe(
      "28 Dec 2026 – 2 Jan 2027"
    );
  });
});
