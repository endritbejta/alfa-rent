import { describe, expect, it } from "vitest";
import { DEFAULT_LOCALE, isLocale } from "./config";
import { dictionaries, translate } from "./translations";

describe("localization", () => {
  it("defaults to Albanian and accepts only supported locales", () => {
    expect(DEFAULT_LOCALE).toBe("sq");
    expect(isLocale("sq")).toBe(true);
    expect(isLocale("en")).toBe(true);
    expect(isLocale("de")).toBe(false);
  });

  it("keeps Albanian and English dictionaries structurally identical", () => {
    expect(Object.keys(dictionaries.sq).sort()).toEqual(
      Object.keys(dictionaries.en).sort()
    );
  });

  it("interpolates translated values", () => {
    expect(translate(dictionaries.sq, "vehicle.seats", { count: 5 })).toBe(
      "5 ulëse"
    );
    expect(translate(dictionaries.en, "vehicle.seats", { count: 5 })).toBe(
      "5 seats"
    );
  });
});
