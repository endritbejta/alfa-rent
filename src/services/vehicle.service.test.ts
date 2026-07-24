import { describe, expect, it } from "vitest";
import { publicVehicleFields } from "./vehicle.service";
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
    for (const field of ["slug", "brand", "model", "pricePerDay", "status"]) {
      expect(publicVehicleFields).toContain(field);
    }
  });

  it("never lists vehicles that are off-road", () => {
    expect(PUBLIC_BOOKABLE_VEHICLE_STATUSES).toEqual(["AVAILABLE", "RENTED"]);
    expect(isPublicBookableVehicleStatus("SERVICE")).toBe(false);
    expect(isPublicBookableVehicleStatus("INACTIVE")).toBe(false);
  });
});
