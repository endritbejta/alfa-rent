import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { updateVehicle } from "@/services/vehicle.service";

/**
 * `Vehicle.status` is a second source of truth for something the reservations
 * already say, and it had three writers with three different rules. This pins
 * the one that had none: `updateVehicle` used to write whatever it was handed.
 *
 * The failure it allowed: mark a car AVAILABLE while it is out on rental, and
 * the return can no longer release it (that update matches only a RENTED
 * vehicle), so the car can end up off the fleet with nothing reporting it.
 */
const suffix = randomUUID().slice(0, 8);
const ids = {
  customer: `own-customer-${suffix}`,
  rented: `own-rented-${suffix}`,
  idle: `own-idle-${suffix}`,
  reservation: `own-reservation-${suffix}`,
};

const vehicleBase = {
  brand: "Test",
  model: "Ownership",
  year: 2027,
  category: "SEDAN" as const,
  transmission: "AUTOMATIC" as const,
  fuelType: "PETROL" as const,
  seats: 5,
  pricePerDay: 45,
  description: "Integration-test vehicle for status ownership rules.",
};

beforeAll(async () => {
  await prisma.customer.create({
    data: {
      id: ids.customer,
      firstName: "Own",
      lastName: "Tester",
      email: `own-${suffix}@example.test`,
      phone: "-",
    },
  });
  await prisma.vehicle.create({
    data: {
      id: ids.rented,
      slug: `own-rented-${suffix}`,
      status: "RENTED",
      ...vehicleBase,
    },
  });
  await prisma.vehicle.create({
    data: {
      id: ids.idle,
      slug: `own-idle-${suffix}`,
      status: "AVAILABLE",
      ...vehicleBase,
    },
  });
  await prisma.reservation.create({
    data: {
      id: ids.reservation,
      vehicleId: ids.rented,
      customerId: ids.customer,
      pickupDate: new Date("2027-10-01T10:00:00.000Z"),
      returnDate: new Date("2027-10-05T10:00:00.000Z"),
      status: "ACTIVE",
      totalPrice: 180,
    },
  });
});

afterAll(async () => {
  await prisma.reservation.deleteMany({ where: { id: ids.reservation } });
  await prisma.vehicle.deleteMany({
    where: { id: { in: [ids.rented, ids.idle] } },
  });
  await prisma.customer.deleteMany({ where: { id: ids.customer } });
  await prisma.$disconnect();
});

describe("who may write Vehicle.status", () => {
  it("refuses to mark a vehicle available while a rental is out", async () => {
    await expect(
      updateVehicle(ids.rented, { status: "AVAILABLE" })
    ).rejects.toThrow(/active rental/i);

    const unchanged = await prisma.vehicle.findUniqueOrThrow({
      where: { id: ids.rented },
    });
    expect(unchanged.status).toBe("RENTED");
  });

  it("refuses RENTED as a manual choice — only the handover sets it", async () => {
    await expect(updateVehicle(ids.idle, { status: "RENTED" })).rejects.toThrow(
      /pickup inspection/i
    );
  });

  it("still allows SERVICE mid-rental, because a car can break", async () => {
    // The legitimate mid-rental action. The return will then correctly leave
    // it in SERVICE rather than releasing a broken car to the fleet.
    const updated = await updateVehicle(ids.rented, { status: "SERVICE" });
    expect(updated.status).toBe("SERVICE");
    await prisma.vehicle.update({
      where: { id: ids.rented },
      data: { status: "RENTED" },
    });
  });

  it("refuses to retire a vehicle that still has open reservations", async () => {
    await expect(
      updateVehicle(ids.rented, { status: "INACTIVE" })
    ).rejects.toThrow(/open reservations/i);
  });

  it("leaves an unrelated edit on a rented vehicle alone", async () => {
    // The form posts `status` on every submit, so an unchanged status must not
    // be treated as an attempted transition.
    const updated = await updateVehicle(ids.rented, {
      status: "RENTED",
      pricePerDay: 55,
    });
    expect(updated.status).toBe("RENTED");
    expect(Number(updated.pricePerDay)).toBe(55);
  });

  it("allows an ordinary status change on an idle vehicle", async () => {
    const toService = await updateVehicle(ids.idle, { status: "SERVICE" });
    expect(toService.status).toBe("SERVICE");
    const backToAvailable = await updateVehicle(ids.idle, {
      status: "AVAILABLE",
    });
    expect(backToAvailable.status).toBe("AVAILABLE");
  });
});
