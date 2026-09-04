import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import {
  parseVehicleFields,
  updateVehicleSchema,
} from "@/lib/validations/vehicle";
import { updateVehicle } from "@/services/vehicle.service";

/**
 * Covers the whole path a cleared field takes: form data → parse → schema →
 * service → column.
 *
 * The unit tests pin that an emptied field becomes `null` and survives the
 * schema. This is the link they cannot see — that the update actually writes
 * NULL. Before the fix the parse produced `undefined`, Prisma read that as
 * "leave unchanged", and clearing a field appeared to save while changing
 * nothing.
 */
const id = `clear-vehicle-${randomUUID().slice(0, 8)}`;

const populated = {
  slug: `clear-car-${id}`,
  plate: `CLR-${id.slice(-6)}`.toUpperCase(),
  brand: "Test",
  model: "Clearable",
  year: 2026,
  category: "SEDAN" as const,
  transmission: "AUTOMATIC" as const,
  fuelType: "PETROL" as const,
  seats: 5,
  pricePerDay: 50,
  description: "Integration-test vehicle for field clearing behaviour.",
  registrationDate: new Date("2026-01-01T00:00:00.000Z"),
  registrationExpiry: new Date("2027-01-01T00:00:00.000Z"),
  lastServiceDate: new Date("2026-06-01T00:00:00.000Z"),
  nextServiceDate: new Date("2027-06-01T00:00:00.000Z"),
  serviceNotes: "Oil and filter done at 40k.",
};

beforeAll(async () => {
  await prisma.vehicle.create({ data: { id, ...populated } });
});

afterAll(async () => {
  await prisma.vehicle.deleteMany({ where: { id } });
  await prisma.$disconnect();
});

/** What the edit form posts when the operator empties the optional fields. */
function submissionWithClearedOptionals() {
  const data = new FormData();
  const fields: Record<string, string> = {
    brand: populated.brand,
    model: populated.model,
    year: String(populated.year),
    category: populated.category,
    transmission: populated.transmission,
    fuelType: populated.fuelType,
    seats: String(populated.seats),
    pricePerDay: String(populated.pricePerDay),
    description: populated.description,
    status: "AVAILABLE",
    // Emptied by the operator:
    plate: "",
    registrationDate: "",
    registrationExpiry: "",
    lastServiceDate: "",
    nextServiceDate: "",
    serviceNotes: "",
  };
  for (const [k, v] of Object.entries(fields)) data.set(k, v);
  return data;
}

describe("clearing an optional vehicle field", () => {
  it("starts from a vehicle that has all of them set", async () => {
    const before = await prisma.vehicle.findUniqueOrThrow({ where: { id } });
    expect(before.plate).not.toBeNull();
    expect(before.serviceNotes).not.toBeNull();
    expect(before.nextServiceDate).not.toBeNull();
  });

  it("writes NULL to every cleared column", async () => {
    await updateVehicle(
      id,
      updateVehicleSchema.parse(
        parseVehicleFields(submissionWithClearedOptionals())
      )
    );

    const after = await prisma.vehicle.findUniqueOrThrow({ where: { id } });
    expect(after.plate).toBeNull();
    expect(after.registrationDate).toBeNull();
    expect(after.registrationExpiry).toBeNull();
    expect(after.lastServiceDate).toBeNull();
    expect(after.nextServiceDate).toBeNull();
    expect(after.serviceNotes).toBeNull();
  });

  it("leaves the fields that were not cleared alone", async () => {
    const after = await prisma.vehicle.findUniqueOrThrow({ where: { id } });
    expect(after.brand).toBe(populated.brand);
    expect(after.description).toBe(populated.description);
    expect(after.seats).toBe(populated.seats);
    expect(Number(after.pricePerDay)).toBe(populated.pricePerDay);
  });
});
