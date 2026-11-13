import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { getVehicleDetail } from "@/services/fleet.service";

/**
 * The vehicle drawer is where the owner decides whether a car is worth
 * keeping. Its "Earned" used to sum the 12 reservations the drawer lists, so
 * a busy car's takings froze after its twelfth rental while its costs kept
 * climbing. Its "Total spend" added a lifetime of repairs to the cost of one
 * service, then annualised the mix (P2-5c): services were a single pair of
 * columns, so each new one erased the last from the car's costs.
 *
 * This car has 15 completed rentals and one active one, more than the list
 * shows, plus rentals that have earned nothing; three repairs and three
 * services, one of them this year. A second car, just added, has one bill.
 */
const suffix = randomUUID().slice(0, 8);
const ids = {
  customer: `fin-customer-${suffix}`,
  vehicle: `fin-vehicle-${suffix}`,
  newCar: `fin-new-${suffix}`,
};

/** A fixed "now", so the year boundary and the averages are deterministic. */
const NOW = new Date("2026-11-13T12:00:00.000Z");
const ADDED = new Date("2025-01-15T09:00:00.000Z");

const COMPLETED = 15;
const PRICE = 100;
const ACTIVE_PRICE = 70;
/** Dated 10 May 2023, 2024 and 2025 — the first is before the car was added. */
const REPAIRS = [120.5, 80.25, 300];
const SERVICES = [
  { date: "2024-03-01", cost: 90 },
  { date: "2025-03-01", cost: 110.5 },
  { date: "2026-02-01", cost: 60 },
];
/** The frozen column: must not be counted on top of the rows. */
const STALE_SERVICE_COST = 999;

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
      serviceCost: STALE_SERVICE_COST,
      description: "Integration-test vehicle for the drawer's money figures.",
      createdAt: ADDED,
    },
  });
  await prisma.vehicle.create({
    data: {
      id: ids.newCar,
      slug: `fin-new-${suffix}`,
      brand: "Test",
      model: "New arrival",
      year: 2027,
      category: "SEDAN",
      transmission: "AUTOMATIC",
      fuelType: "PETROL",
      seats: 5,
      pricePerDay: 25,
      description: "Integration-test vehicle added this month.",
      createdAt: new Date("2026-11-02T09:00:00.000Z"),
    },
  });
  await prisma.repair.create({
    data: {
      vehicleId: ids.newCar,
      date: new Date("2026-11-05T00:00:00.000Z"),
      cost: 400,
      description: "Windscreen",
    },
  });
  await prisma.vehicleService.createMany({
    data: SERVICES.map((s) => ({
      vehicleId: ids.vehicle,
      date: new Date(`${s.date}T00:00:00.000Z`),
      cost: s.cost,
    })),
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
  const vehicleIds = [ids.vehicle, ids.newCar];
  await prisma.reservation.deleteMany({ where: { vehicleId: ids.vehicle } });
  await prisma.repair.deleteMany({ where: { vehicleId: { in: vehicleIds } } });
  await prisma.vehicleService.deleteMany({
    where: { vehicleId: { in: vehicleIds } },
  });
  await prisma.vehicle.deleteMany({ where: { id: { in: vehicleIds } } });
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

  it("counts every repair and every service, summed in the database", async () => {
    const { costs } = await getVehicleDetail(ids.vehicle, NOW);
    const repairs = REPAIRS.reduce((a, b) => a + b, 0);
    const services = SERVICES.reduce((a, s) => a + s.cost, 0);

    expect(costs.repairs).toBeCloseTo(repairs, 2);
    expect(costs.repairCount).toBe(REPAIRS.length);
    expect(costs.services).toBeCloseTo(services, 2);
    expect(costs.serviceCount).toBe(SERVICES.length);
    // Not the frozen serviceCost column, and not only the last service.
    expect(costs.recorded).toBeCloseTo(repairs + services, 2);
    expect(costs.net).toBeCloseTo(
      COMPLETED * PRICE + ACTIVE_PRICE - repairs - services,
      2
    );
  });

  it("takes the last service from the newest row", async () => {
    const { costs, vehicle } = await getVehicleDetail(ids.vehicle, NOW);
    expect(costs.lastService).toEqual({
      date: new Date("2026-02-01T00:00:00.000Z"),
      cost: 60,
    });
    expect(vehicle.services.map((s) => Number(s.cost))).toEqual([
      60, 110.5, 90,
    ]);
  });

  it("counts this calendar year's repairs and services", async () => {
    const { costs } = await getVehicleDetail(ids.vehicle, NOW);
    // Only the February 2026 service; every repair is from an earlier year.
    expect(costs.thisYear).toBe(60);
  });

  it("averages all costs from the earliest dated one, not from when the car was added", async () => {
    const { costs } = await getVehicleDetail(ids.vehicle, NOW);
    const recorded =
      REPAIRS.reduce((a, b) => a + b, 0) +
      SERVICES.reduce((a, s) => a + s.cost, 0);
    // The 2023 repair predates createdAt (January 2025).
    expect(costs.since).toBe("2023-05-10");
    const days =
      (Date.UTC(2026, 10, 13) - Date.UTC(2023, 4, 10)) / (24 * 60 * 60 * 1000);
    const months = days / (365.25 / 12);
    expect(costs.perMonth).toBeCloseTo(recorded / months, 6);
    expect(costs.perYear).toBeCloseTo((recorded / months) * 12, 6);
  });

  it("does not annualise a car added this month", async () => {
    const { costs } = await getVehicleDetail(ids.newCar, NOW);
    // It used to show 400 × 12 = 4,800 a year.
    expect(costs.recorded).toBe(400);
    expect(costs.perYear).toBeNull();
    expect(costs.perMonth).toBeNull();
    expect(costs.lastService).toBeNull();
  });
});
