import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import {
  createTestActor,
  removeTestActor,
  purgeAuditEvents,
} from "@/lib/testing/audit";
import { getAnalyticsReport } from "@/services/analytics-report.service";

/**
 * The analytics report against rows it can be checked by hand against.
 *
 * Everything sits in 2039–2040, where no other test writes reservations, so
 * the revenue, reservation and customer figures are exactly these rows. The
 * fleet totals include every car in the database (all of them are "in the
 * fleet" in 2040), so the fleet is checked per car.
 *
 * March 2040, read on 1 April:
 * - car1 (in the fleet all month): an early return billed for 2 of 4 days,
 *   400 → 200; a cancelled booking worth 150.
 * - car2 (added on 16 March): 100 for 20–21 March; a confirmed 120 in April.
 * - car3 (retired on 10 March): 90 for 1–3 March.
 * - Customer A rented in December 2039 too, so is returning; B rents for the
 *   first time; C only made a request that was cancelled.
 */
const suffix = randomUUID().slice(0, 8);
const ids = {
  a: `ar-a-${suffix}`,
  b: `ar-b-${suffix}`,
  c: `ar-c-${suffix}`,
  car1: `ar-car1-${suffix}`,
  car2: `ar-car2-${suffix}`,
  car3: `ar-car3-${suffix}`,
};
let actor = "";

const at = (y: number, m: number, d: number) =>
  new Date(Date.UTC(y, m - 1, d, 10));
const instant = (iso: string) => new Date(iso);

beforeAll(async () => {
  actor = await createTestActor("analytics-report");
  for (const [id, created] of [
    [ids.a, "2039-06-01T09:00:00Z"],
    [ids.b, "2039-06-01T09:00:00Z"],
    [ids.c, "2040-03-05T09:00:00Z"],
  ] as const) {
    await prisma.customer.create({
      data: {
        id,
        firstName: "Report",
        lastName: id,
        email: `${id}@example.test`,
        phone: "-",
        createdAt: instant(created),
      },
    });
  }
  const car = (id: string, created: string, status: "AVAILABLE" | "INACTIVE") =>
    prisma.vehicle.create({
      data: {
        id,
        slug: id,
        brand: "Report",
        model: id,
        year: 2039,
        category: "SEDAN",
        transmission: "MANUAL",
        fuelType: "PETROL",
        seats: 5,
        pricePerDay: 100,
        description: "Integration-test vehicle for the analytics report.",
        status,
        createdAt: instant(created),
      },
    });
  await car(ids.car1, "2039-01-01T09:00:00Z", "AVAILABLE");
  // Created at 23:30 UTC on the 15th: already the 16th in Belgrade.
  await car(ids.car2, "2040-03-15T23:30:00Z", "AVAILABLE");
  await car(ids.car3, "2039-01-01T09:00:00Z", "INACTIVE");
  // The retirement as the app records it.
  await prisma.auditEvent.create({
    data: {
      actorId: actor,
      action: "vehicle.retire",
      entity: "vehicle",
      entityId: ids.car3,
      before: { status: "AVAILABLE" },
      after: { status: "INACTIVE" },
      createdAt: instant("2040-03-10T12:00:00Z"),
    },
  });

  const rows = [
    {
      vehicleId: ids.car1,
      customerId: ids.a,
      pickupDate: at(2039, 12, 10),
      returnDate: at(2039, 12, 11),
      status: "COMPLETED" as const,
      totalPrice: 200,
      actualDays: 2,
    },
    {
      vehicleId: ids.car1,
      customerId: ids.a,
      pickupDate: at(2040, 3, 2),
      returnDate: at(2040, 3, 5),
      status: "COMPLETED" as const,
      totalPrice: 200,
      bookedTotal: 400,
      dailyRate: 100,
      actualDays: 2,
      earlyReturnBilling: "ACTUAL_DAYS" as const,
    },
    {
      vehicleId: ids.car3,
      customerId: ids.a,
      pickupDate: at(2040, 3, 1),
      returnDate: at(2040, 3, 3),
      status: "COMPLETED" as const,
      totalPrice: 90,
      actualDays: 3,
    },
    {
      vehicleId: ids.car2,
      customerId: ids.b,
      pickupDate: at(2040, 3, 20),
      returnDate: at(2040, 3, 21),
      status: "COMPLETED" as const,
      totalPrice: 100,
      actualDays: 2,
    },
    {
      vehicleId: ids.car1,
      customerId: ids.c,
      pickupDate: at(2040, 3, 25),
      returnDate: at(2040, 3, 26),
      status: "CANCELLED" as const,
      totalPrice: 150,
    },
    {
      vehicleId: ids.car2,
      customerId: ids.b,
      pickupDate: at(2040, 4, 2),
      returnDate: at(2040, 4, 3),
      status: "CONFIRMED" as const,
      totalPrice: 120,
    },
  ];
  for (const row of rows) await prisma.reservation.create({ data: row });
});

afterAll(async () => {
  const cars = [ids.car1, ids.car2, ids.car3];
  await prisma.reservation.deleteMany({ where: { vehicleId: { in: cars } } });
  await purgeAuditEvents({ entityIds: cars });
  await prisma.vehicle.deleteMany({ where: { id: { in: cars } } });
  await prisma.customer.deleteMany({
    where: { id: { in: [ids.a, ids.b, ids.c] } },
  });
  await removeTestActor(actor);
  await prisma.$disconnect();
});

const march = () =>
  getAnalyticsReport({
    range: { from: "2040-03-01", to: "2040-03-31" },
    unit: "day",
    today: "2040-04-01",
    comparison: { from: "2039-12-01", to: "2039-12-31" },
    span: null,
  });

describe("the analytics report", () => {
  it("counts what was charged, and keeps the early-return reduction apart", async () => {
    const { current } = await march();
    expect(current.revenue).toMatchObject({
      realised: 390,
      accruing: 0,
      upcoming: 0,
      earned: 390,
      cancelled: 150,
      earlyReturnAdjustment: 200,
    });
    // The early return's 200 lands on the two days the car was out.
    const day = (key: string) =>
      current.buckets.find((b) => b.key === key)!.revenue.realised;
    expect(day("2040-03-02")).toBe(130); // 100 (car1) + 30 (car3)
    expect(day("2040-03-03")).toBe(130);
    expect(day("2040-03-04")).toBe(0);
    // 390 over the 7 rental days that earned it; 3 rentals picked up.
    expect(current.revenue.dailyRate).toBeCloseTo(390 / 7, 6);
    expect(current.revenue.perRental).toBe(130);
  });

  it("counts reservations by pickup day, once", async () => {
    const { current } = await march();
    expect(current.reservations).toMatchObject({
      total: 4,
      status: { COMPLETED: 3, CANCELLED: 1 },
      cancellationRate: 0.25,
      lapsed: 0,
    });
    // 2 + 3 + 2 days out; the cancelled booking is not a rental.
    expect(current.reservations.averageDuration).toBeCloseTo(7 / 3, 6);
  });

  it("measures each car only over the days it was in the fleet", async () => {
    const { vehicles } = await march();
    const car = (id: string) => vehicles.find((v) => v.id === id)!;
    expect(car(ids.car1)).toMatchObject({
      fleetDays: 31,
      rentedDays: 2,
      revenue: 200,
      rentals: 1,
    });
    // Added on 16 March (Belgrade): 16 days, 2 of them rented.
    expect(car(ids.car2)).toMatchObject({ fleetDays: 16, rentedDays: 2 });
    expect(car(ids.car2).utilization).toBe(2 / 16);
    // Retired on 10 March: 10 days, not 31.
    expect(car(ids.car3)).toMatchObject({ fleetDays: 10, rentedDays: 3 });
    expect(car(ids.car3).utilization).toBe(3 / 10);
  });

  it("tells renters from customer records, and returning from first-time", async () => {
    const { current, topCustomers } = await march();
    expect(current.customers).toMatchObject({
      renting: 2,
      firstTime: 1,
      returning: 1,
      rentals: 3,
      multi: 1,
      newRecords: 1,
      repeatRate: 0.5,
    });
    expect(topCustomers.map((c) => [c.id, c.value])).toEqual([
      [ids.a, 290],
      [ids.b, 100],
    ]);
  });

  it("reads the comparison period through the same rules", async () => {
    const { previous } = await march();
    expect(previous!.revenue.realised).toBe(200);
    expect(previous!.reservations.total).toBe(1);
    // A had not rented before December: first-time then.
    expect(previous!.customers).toMatchObject({ renting: 1, firstTime: 1 });
  });

  it("shows a confirmed booking as upcoming, never earned", async () => {
    const { current } = await getAnalyticsReport({
      range: { from: "2040-04-01", to: "2040-04-30" },
      unit: "week",
      today: "2040-04-01",
      comparison: null,
      span: null,
    });
    expect(current.revenue).toMatchObject({ earned: 0, upcoming: 120 });
    expect(current.reservations.status).toEqual({ CONFIRMED: 1 });
  });
});
