import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { getVehicleDetail } from "@/services/fleet.service";

/**
 * The vehicle drawer is where the owner decides whether a car is worth
 * keeping. Its "Earned" used to sum the 12 reservations the drawer lists, so
 * a busy car's takings froze after its twelfth rental while its costs kept
 * climbing. Its "Total spend" added a lifetime of repairs to the cost of one
 * service, then annualised the mix.
 *
 * This car has 15 completed rentals and one active one, more than the list
 * shows, plus rentals that have earned nothing.
 */
const suffix = randomUUID().slice(0, 8);
const ids = {
  customer: `fin-customer-${suffix}`,
  vehicle: `fin-vehicle-${suffix}`,
};

const COMPLETED = 15;
const PRICE = 100;
const ACTIVE_PRICE = 70;
const REPAIRS = [120.5, 80.25, 300];
const LAST_SERVICE = 90;

beforeAll(async () => {
  await prisma.customer.create({
    data: {
      id: ids.customer,
      firstName: "Fleet",
      lastName: "Financials",
      email: `fin-${suffix}@example.test`,
      phone: "-",
    },
  });
  await prisma.vehicle.create({
    data: {
      id: ids.vehicle,
      slug: `fin-car-${suffix}`,
      brand: "Test",
      model: "Financials",
      year: 2027,
      category: "SEDAN",
      transmission: "AUTOMATIC",
      fuelType: "PETROL",
      seats: 5,
      pricePerDay: 25,
      serviceCost: LAST_SERVICE,
      description: "Integration-test vehicle for the drawer's money figures.",
    },
  });

  // Sequential, non-overlapping. The exclusion constraint covers
  // CONFIRMED/ACTIVE only, but keeping every row apart is honest anyway.
  for (let i = 0; i < COMPLETED; i++) {
    await prisma.reservation.create({
      data: {
        vehicleId: ids.vehicle,
        customerId: ids.customer,
        pickupDate: new Date(Date.UTC(2024, 0, 1 + i * 3, 10)),
        returnDate: new Date(Date.UTC(2024, 0, 2 + i * 3, 10)),
        status: "COMPLETED",
        totalPrice: PRICE,
      },
    });
  }
  await prisma.reservation.create({
    data: {
      vehicleId: ids.vehicle,
      customerId: ids.customer,
      pickupDate: new Date(Date.UTC(2025, 2, 1, 10)),
      returnDate: new Date(Date.UTC(2025, 2, 3, 10)),
      status: "ACTIVE",
      totalPrice: ACTIVE_PRICE,
    },
  });
  // Earned nothing: not started, never decided, or abandoned.
  for (const [i, status] of (
    ["PENDING", "CONFIRMED", "CANCELLED"] as const
  ).entries()) {
    await prisma.reservation.create({
      data: {
        vehicleId: ids.vehicle,
        customerId: ids.customer,
        pickupDate: new Date(Date.UTC(2025, 5, 1 + i * 5, 10)),
        returnDate: new Date(Date.UTC(2025, 5, 3 + i * 5, 10)),
        status,
        totalPrice: 999,
      },
    });
  }

  for (const [i, cost] of REPAIRS.entries()) {
    await prisma.repair.create({
      data: {
        vehicleId: ids.vehicle,
        date: new Date(Date.UTC(2023 + i, 4, 10)),
        cost,
        description: `Repair ${i}`,
      },
    });
  }
});

afterAll(async () => {
  await prisma.reservation.deleteMany({ where: { vehicleId: ids.vehicle } });
  await prisma.repair.deleteMany({ where: { vehicleId: ids.vehicle } });
  await prisma.vehicle.deleteMany({ where: { id: ids.vehicle } });
  await prisma.customer.deleteMany({ where: { id: ids.customer } });
  await prisma.$disconnect();
});

describe("a vehicle's money figures", () => {
  it("earns from every active and completed rental, not the 12 it lists", async () => {
    const { vehicle, costs } = await getVehicleDetail(ids.vehicle);

    // The list is still capped for display...
    expect(vehicle.reservations).toHaveLength(12);
    // ...but the figure is not. The old code summed the listed rows: the
    // three non-earning ones, the active one and the 8 newest completed.
    expect(costs.earned).toBe(COMPLETED * PRICE + ACTIVE_PRICE);
  });

  it("reports recorded costs as repairs plus the last service", async () => {
    const { costs } = await getVehicleDetail(ids.vehicle);
    const repairs = REPAIRS.reduce((a, b) => a + b, 0);

    expect(costs.repairs).toBeCloseTo(repairs, 2);
    expect(costs.repairCount).toBe(REPAIRS.length);
    expect(costs.lastService).toBe(LAST_SERVICE);
    expect(costs.recorded).toBeCloseTo(repairs + LAST_SERVICE, 2);
    expect(costs.net).toBeCloseTo(
      COMPLETED * PRICE + ACTIVE_PRICE - repairs - LAST_SERVICE,
      2
    );
  });

  it("annualises only the repair history, never the one-off service", async () => {
    const { costs } = await getVehicleDetail(ids.vehicle);
    // Created moments ago, so the floor of one month applies: a year of
    // repairs is twelve times the history, and the service is not in it.
    const repairs = REPAIRS.reduce((a, b) => a + b, 0);
    expect(costs.repairsPerMonth).toBeCloseTo(repairs, 2);
    expect(costs.repairsPerYear).toBeCloseTo(repairs * 12, 2);
    // Every repair here is dated before this year.
    expect(costs.repairsThisYear).toBe(0);
  });
});
