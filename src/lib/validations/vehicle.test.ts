import { describe, expect, it } from "vitest";
import {
  adminVehicleFilterSchema,
  createVehicleSchema,
  parseVehicleFields,
  updateVehicleSchema,
} from "./vehicle";

/** A complete, valid vehicle form submission. */
const complete: Record<string, string> = {
  brand: "BMW",
  model: "320d",
  plate: "ks-01-abc",
  year: "2023",
  category: "SEDAN",
  transmission: "AUTOMATIC",
  fuelType: "DIESEL",
  seats: "5",
  pricePerDay: "60",
  description: "A comfortable executive saloon for longer journeys.",
  status: "AVAILABLE",
  registrationDate: "2023-04-01",
  registrationExpiry: "2027-04-01",
  lastServiceDate: "2026-05-01",
  nextServiceDate: "2027-05-01",
  serviceNotes: "Oil and filter done at 40k.",
};

const form = (overrides: Record<string, string> = {}) => {
  const data = new FormData();
  for (const [k, v] of Object.entries({ ...complete, ...overrides })) {
    data.set(k, v);
  }
  return data;
};

/** Fields an operator can empty in the edit form. */
const CLEARABLE = [
  "plate",
  "registrationDate",
  "lastServiceDate",
  "nextServiceDate",
  "serviceNotes",
] as const;

describe("parseVehicleFields", () => {
  it("reads a complete submission", () => {
    const input = createVehicleSchema.parse(parseVehicleFields(form()));
    expect(input.brand).toBe("BMW");
    expect(input.plate).toBe("KS-01-ABC"); // upper-cased by the schema
    expect(input.seats).toBe(5);
    expect(input.pricePerDay).toBe(60);
  });

  /**
   * The bug this guards: an emptied field used to become `undefined`, which
   * Prisma reads in an update as "leave this column unchanged". Clearing a
   * plate or a service date appeared to save — the form redirected — and the
   * old value was still there on reload.
   */
  it.each(CLEARABLE)(
    "emits null for a cleared %s, never undefined",
    (field) => {
      const parsed = parseVehicleFields(form({ [field]: "" }));
      expect(parsed[field as keyof typeof parsed]).toBeNull();
    }
  );

  it.each(CLEARABLE)("keeps null through the update schema for %s", (field) => {
    const input = updateVehicleSchema.parse(
      parseVehicleFields(form({ [field]: "" }))
    );
    // Present and null — not absent. An absent key is what Prisma ignores.
    expect(field in input).toBe(true);
    expect(input[field as keyof typeof input]).toBeNull();
  });

  it("leaves status undefined when absent, because it is not clearable", () => {
    const data = form();
    data.delete("status");
    const parsed = parseVehicleFields(data);
    expect(parsed.status).toBeUndefined();
    // A null status would violate the column, so it must never be produced.
    expect(parsed.status).not.toBeNull();
  });

  it("still rejects a submission that is actually invalid", () => {
    expect(() =>
      createVehicleSchema.parse(
        parseVehicleFields(form({ description: "short" }))
      )
    ).toThrow();
    expect(() =>
      createVehicleSchema.parse(parseVehicleFields(form({ pricePerDay: "0" })))
    ).toThrow();
    expect(() =>
      createVehicleSchema.parse(parseVehicleFields(form({ year: "1980" })))
    ).toThrow();
  });

  it("accepts a create with the optional fields left blank", () => {
    const data = form();
    for (const field of CLEARABLE) data.set(field, "");
    const input = createVehicleSchema.parse(parseVehicleFields(data));
    expect(input.plate).toBeNull();
    expect(input.serviceNotes).toBeNull();
  });
});

describe("adminVehicleFilterSchema", () => {
  /**
   * The fleet page hands it the whole query string, which now carries ?view
   * for the grid/list/compact switch as well as the filters. A schema that
   * rejected the extra key would drop every filter with it — the exact shape
   * of the bug that once left the fleet filters completely dead while the
   * service-level test passed.
   */
  it("ignores params that belong to other controls", () => {
    const parsed = adminVehicleFilterSchema.safeParse({
      status: "AVAILABLE",
      brand: "Kia",
      page: "2",
      view: "compact",
      saved: "1",
    });
    expect(parsed.success).toBe(true);
    expect(parsed.data).toMatchObject({
      status: "AVAILABLE",
      brand: "Kia",
      page: 2,
    });
  });
});
