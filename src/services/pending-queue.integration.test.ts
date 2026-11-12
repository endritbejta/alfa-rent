import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { businessDay } from "@/lib/reservation-lifecycle";
import {
  getPendingCount,
  getReservations,
  updateReservationStatus,
} from "@/services/reservation.service";
import { getDashboardData } from "@/services/analytics.service";

/**
 * Request-queue hygiene. A PENDING request whose pickup day has passed is
 * expired: it sorts after the real work, drops out of the badge, and can no
 * longer be confirmed. Requests that are still in time confirm as before,
 * with the exclusion constraint still having the last word.
 */
const suffix = randomUUID().slice(0, 8);
const ids = {
  customer: `pq-customer-${suffix}`,
  queueCar: `pq-car-${suffix}`,
  rivalCar: `pq-rival-${suffix}`,
  soon: `pq-soon-${suffix}`,
  later: `pq-later-${suffix}`,
  today: `pq-today-${suffix}`,
  lapsed: `pq-lapsed-${suffix}`,
  ancient: `pq-ancient-${suffix}`,
  rivalA: `pq-rival-a-${suffix}`,
  rivalB: `pq-rival-b-${suffix}`,
};
const extra: string[] = [];

const DAY = 24 * 60 * 60 * 1000;
const today = new Date(`${businessDay(new Date())}T10:00:00.000Z`);
const at = (days: number) => new Date(today.getTime() + days * DAY);

function vehicle(id: string) {
  return {
    id,
    slug: `${id}-slug`,
    plate: id.toUpperCase().slice(0, 15),
    brand: `Queue${suffix}`,
    model: id,
    year: 2026,
    category: "SEDAN" as const,
    transmission: "AUTOMATIC" as const,
    fuelType: "PETROL" as const,
    seats: 5,
    pricePerDay: 40,
    status: "AVAILABLE" as const,
    description: "Integration-test vehicle for the pending queue.",
  };
}

function request(
  id: string,
  vehicleId: string,
  pickupInDays: number,
  nights = 2
) {
  return {
    id,
    vehicleId,
    customerId: ids.customer,
    pickupDate: at(pickupInDays),
    returnDate: at(pickupInDays + nights),
    status: "PENDING" as const,
    totalPrice: 40 * nights,
  };
}

beforeAll(async () => {
  await prisma.customer.create({
    data: {
      id: ids.customer,
      firstName: "Queue",
      lastName: suffix,
      email: `queue-${suffix}@example.test`,
      phone: "-",
    },
  });
  await prisma.vehicle.createMany({
    data: [vehicle(ids.queueCar), vehicle(ids.rivalCar)],
  });
  // Created in an order unlike the expected one, so the sort is what is
  // being tested rather than insertion order.
  await prisma.reservation.createMany({
    data: [
      request(ids.later, ids.queueCar, 30),
      request(ids.ancient, ids.queueCar, -610),
      request(ids.soon, ids.queueCar, 3),
      request(ids.lapsed, ids.queueCar, -2),
      request(ids.today, ids.queueCar, 0, 1),
      request(ids.rivalA, ids.rivalCar, 10, 4),
      request(ids.rivalB, ids.rivalCar, 12, 4),
    ],
  });
});

afterAll(async () => {
  await prisma.reservation.deleteMany({
    where: { vehicleId: { in: [ids.queueCar, ids.rivalCar] } },
  });
  await prisma.vehicle.deleteMany({
    where: { id: { in: [ids.queueCar, ids.rivalCar] } },
  });
  await prisma.customer.deleteMany({ where: { id: ids.customer } });
  await prisma.$disconnect();
});

describe("the pending queue", () => {
  const queue = (page: number, perPage: number) =>
    getReservations({
      status: "PENDING",
      vehicleId: ids.queueCar,
      page,
      perPage,
    });

  it("lists the soonest pickup first, and expired requests after the rest", async () => {
    const { items, total } = await queue(1, 25);
    expect(items.map((r) => r.id)).toEqual([
      ids.today,
      ids.soon,
      ids.later,
      ids.lapsed,
      ids.ancient,
    ]);
    expect(total).toBe(5);
  });

  it("pages across the boundary between the two", async () => {
    expect((await queue(1, 2)).items.map((r) => r.id)).toEqual([
      ids.today,
      ids.soon,
    ]);
    expect((await queue(2, 2)).items.map((r) => r.id)).toEqual([
      ids.later,
      ids.lapsed,
    ]);
    const last = await queue(3, 2);
    expect(last.items.map((r) => r.id)).toEqual([ids.ancient]);
    expect(last.totalPages).toBe(3);
  });

  it("leaves the all-reservations list newest pickup first", async () => {
    const { items } = await getReservations({
      vehicleId: ids.queueCar,
      page: 1,
      perPage: 25,
    });
    expect(items.map((r) => r.id)).toEqual([
      ids.later,
      ids.soon,
      ids.today,
      ids.lapsed,
      ids.ancient,
    ]);
  });
});

describe("the pending count", () => {
  it("counts a request still in time and ignores an expired one", async () => {
    const before = await getPendingCount();
    const kpiBefore = (await getDashboardData()).kpis.pending;

    const fresh = `pq-fresh-${suffix}`;
    const stale = `pq-stale-${suffix}`;
    extra.push(fresh, stale);
    await prisma.reservation.createMany({
      data: [
        request(fresh, ids.queueCar, 60),
        request(stale, ids.queueCar, -1, 1),
      ],
    });

    expect(await getPendingCount()).toBe(before + 1);
    const dashboard = await getDashboardData();
    expect(dashboard.kpis.pending).toBe(kpiBefore + 1);
    expect(dashboard.pendingRequests.map((r) => r.id)).not.toContain(stale);

    await prisma.reservation.deleteMany({ where: { id: { in: extra } } });
  });
});

describe("confirming a request", () => {
  it("refuses one whose pickup day has passed, and leaves it pending", async () => {
    await expect(
      updateReservationStatus(ids.lapsed, "CONFIRMED")
    ).rejects.toMatchObject({
      status: 400,
      text: { key: "err.requestExpired" },
    });
    const after = await prisma.reservation.findUniqueOrThrow({
      where: { id: ids.lapsed },
    });
    expect(after.status).toBe("PENDING");
  });

  it("still lets staff cancel an expired request", async () => {
    const cancelled = await updateReservationStatus(ids.ancient, "CANCELLED");
    expect(cancelled.status).toBe("CANCELLED");
  });

  it("accepts one for today", async () => {
    const confirmed = await updateReservationStatus(ids.today, "CONFIRMED");
    expect(confirmed.status).toBe("CONFIRMED");
  });

  it("confirms a future request, and the exclusion constraint still refuses an overlapping one", async () => {
    const [constraint] = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT count(*) FROM pg_constraint
      WHERE conname = 'reservations_no_overlap' AND contype = 'x'`;
    expect(Number(constraint.count)).toBe(1);

    const confirmed = await updateReservationStatus(ids.rivalA, "CONFIRMED");
    expect(confirmed.status).toBe("CONFIRMED");

    await expect(
      updateReservationStatus(ids.rivalB, "CONFIRMED")
    ).rejects.toThrow(/reservations_no_overlap/);
    const rival = await prisma.reservation.findUniqueOrThrow({
      where: { id: ids.rivalB },
    });
    expect(rival.status).toBe("PENDING");
  });
});
