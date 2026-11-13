import { describe, expect, it } from "vitest";
import { newVehicleSlug, publicVehicleFields } from "./vehicle.service";
import {
  isPublicBookableVehicleStatus,
  PUBLIC_BOOKABLE_VEHICLE_STATUSES,
} from "@/lib/vehicle-policy";

/**
 * Guards the shape of the anonymous payload.
 *
 * Registration and service costs once reached the public API because the
 * query used `include`, which publishes every column added to the model.
 * This test fails the build if a sensitive field is ever added back.
 */
describe("public vehicle payload", () => {
  const SENSITIVE = [
    "plate",
    "registrationDate",
    "registrationExpiry",
    "registrationCost",
    "lastServiceDate",
    "nextServiceDate",
    "serviceCost",
    "serviceNotes",
  ];

  it("never exposes internal fleet or cost data", () => {
    for (const field of SENSITIVE) {
      expect(publicVehicleFields).not.toContain(field);
    }
  });

  it("still exposes what the storefront needs", () => {
    for (const field of [
      "slug",
      "brand",
      "model",
      "pricePerDay",
      "description",
      "status",
    ]) {
      expect(publicVehicleFields).toContain(field);
    }
  });

  it("never lists vehicles that are off-road", () => {
    expect(PUBLIC_BOOKABLE_VEHICLE_STATUSES).toEqual(["AVAILABLE", "RENTED"]);
    expect(isPublicBookableVehicleStatus("SERVICE")).toBe(false);
    expect(isPublicBookableVehicleStatus("INACTIVE")).toBe(false);
  });
});

/**
 * Audit finding P3-2: a plate in the slug published it through every public
 * URL, the sitemap and the API, whatever the allowlist above said.
 */
describe("new vehicle slugs", () => {
  const car = { brand: "Volkswagen", model: "Golf 8", year: 2022 };

  it("never carry the plate, even when the vehicle has one", () => {
    const withPlate = { ...car, plate: "01-234-AB" };
    const slug = newVehicleSlug(withPlate);
    expect(slug).not.toContain("01-234-ab");
  });

  it("are the readable name plus a random eight-character suffix", () => {
    expect(newVehicleSlug(car)).toMatch(/^volkswagen-golf-8-2022-[a-z0-9]{8}$/);
  });

  it("differ between two identical cars", () => {
    expect(newVehicleSlug(car)).not.toBe(newVehicleSlug(car));
  });
});
