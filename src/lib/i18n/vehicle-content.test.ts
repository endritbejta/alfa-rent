import { describe, expect, it } from "vitest";
import { getVehicleDescription } from "./vehicle-content";

const vehicle = {
  brand: "Kia",
  model: "Rio",
  description: "Practical and dependable.",
};

describe("localized vehicle content", () => {
  it("uses Albanian copy for the default locale", () => {
    expect(getVehicleDescription(vehicle, "sq")).toBe(
      "Kia Rio është një zgjedhje praktike, e rehatshme dhe e besueshme për udhëtimet tuaja."
    );
  });

  it("uses English copy for the English locale", () => {
    expect(getVehicleDescription(vehicle, "en")).toBe(
      "Practical and dependable."
    );
  });
});
