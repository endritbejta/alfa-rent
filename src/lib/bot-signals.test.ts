import { describe, expect, it } from "vitest";
import { botVerdict, MIN_FILL_MS } from "@/lib/bot-signals";

describe("botVerdict", () => {
  it("passes the storefront form filled by a person", () => {
    expect(botVerdict({ website: "", formMs: 42_000 })).toBe("human");
  });

  it("passes a public API caller that sends neither field", () => {
    expect(botVerdict({ vehicleId: "v" })).toBe("human");
    expect(botVerdict(null)).toBe("human");
    expect(botVerdict("text")).toBe("human");
  });

  it.each(["https://spam.example", " ", "0"])(
    "catches a filled honeypot (%j)",
    (website) => {
      expect(botVerdict({ website, formMs: 60_000 })).toBe("honeypot");
    }
  );

  it("catches a non-string honeypot value too", () => {
    expect(botVerdict({ website: 1 })).toBe("honeypot");
  });

  it("catches a form sent faster than a person can fill it", () => {
    expect(botVerdict({ website: "", formMs: 0 })).toBe("too-fast");
    expect(botVerdict({ website: "", formMs: MIN_FILL_MS - 1 })).toBe(
      "too-fast"
    );
    expect(botVerdict({ website: "", formMs: MIN_FILL_MS })).toBe("human");
  });

  it.each(["5000", -1, Number.NaN, Number.POSITIVE_INFINITY, true])(
    "treats a nonsensical fill time (%j) as a script",
    (formMs) => {
      const verdict = botVerdict({ website: "", formMs });
      // -1 is a number, simply too fast; the rest are not durations at all.
      expect(verdict).toBe("too-fast");
    }
  );
});
