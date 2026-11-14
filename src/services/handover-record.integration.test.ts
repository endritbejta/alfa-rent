import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { NotFoundError } from "@/lib/errors";
import { createTestActor, removeTestActor } from "@/lib/testing/audit";
import { getHandoverRecord } from "@/services/reservation.service";

/**
 * The printed handover sheet's data: the customer, the car, the days and the
 * recorded condition — and nothing a signed sheet should not carry (no
 * money, no booking history, no audit trail).
 */
const suffix = randomUUID().slice(0, 8);
const ids = {
  customer: `handover-customer-${suffix}`,
  vehicle: `handover-vehicle-${suffix}`,
  reservation: `handover-res-${suffix}`,
};
let actor = "";

beforeAll(async () => {
  actor = await createTestActor("handover");
  await prisma.customer.create({
    data: {
      id: ids.customer,
      firstName: "Hana",
      lastName: "Dorëzimi",
      email: `${ids.customer}@example.test`,
      phone: "+383 44 000 111",
    },
  });
  await prisma.vehicle.create({
    data: {
      id: ids.vehicle,
      slug: ids.vehicle,
      brand: "Test",
      model: "Handover",
      year: 2026,
      plate: `HO-${suffix}`,
      category: "SEDAN",
      transmission: "MANUAL",
      fuelType: "DIESEL",
      seats: 5,
      pricePerDay: 40,
      description: "Integration-test vehicle for the handover sheet.",
    },
  });
  await prisma.reservation.create({
    data: {
      id: ids.reservation,
      vehicleId: ids.vehicle,
      customerId: ids.customer,
      pickupDate: new Date("2041-05-10T10:00:00Z"),
      returnDate: new Date("2041-05-12T10:00:00Z"),
      status: "ACTIVE",
      totalPrice: 120,
      startedAt: new Date("2041-05-10T08:30:00Z"),
      inspections: {
        create: {
          type: "PICKUP",
          createdById: actor,
          mileage: 48210,
          fuelLevel: 75,
          damageFound: true,
          damageNotes: "Scratch on the rear bumper",
          signerName: "Hana Dorëzimi",
          acknowledgedAt: new Date("2041-05-10T08:35:00Z"),
        },
      },
    },
  });
});

afterAll(async () => {
  await prisma.reservation.deleteMany({ where: { id: ids.reservation } });
  await prisma.vehicle.deleteMany({ where: { id: ids.vehicle } });
  await prisma.customer.deleteMany({ where: { id: ids.customer } });
  await removeTestActor(actor);
  await prisma.$disconnect();
});

describe("getHandoverRecord", () => {
  it("carries the parties, the car and the recorded condition", async () => {
    const record = await getHandoverRecord(ids.reservation);
    expect(record.customer).toEqual({
      firstName: "Hana",
      lastName: "Dorëzimi",
      phone: "+383 44 000 111",
      email: `${ids.customer}@example.test`,
    });
    expect(record.vehicle).toMatchObject({
      brand: "Test",
      model: "Handover",
      plate: `HO-${suffix}`,
    });
    expect(record.inspections).toHaveLength(1);
    expect(record.inspections[0]).toMatchObject({
      type: "PICKUP",
      mileage: 48210,
      fuelLevel: 75,
      damageFound: true,
      damageNotes: "Scratch on the rear bumper",
      signerName: "Hana Dorëzimi",
      photos: [],
    });
  });

  it("carries no money, so nothing Decimal reaches the page", async () => {
    const record = await getHandoverRecord(ids.reservation);
    expect(record).not.toHaveProperty("totalPrice");
    expect(JSON.stringify(record)).not.toMatch(/pricePerDay|totalPrice/);
  });

  it("refuses an unknown reservation", async () => {
    await expect(getHandoverRecord(`missing-${suffix}`)).rejects.toBeInstanceOf(
      NotFoundError
    );
  });
});
