import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { getCustomerById, getCustomerSpend } from "@/services/customer.service";
import { getReservationDetail } from "@/services/reservation.service";

/**
 * Both drawers used to reduce over a truncated `include` — 20 rows in the
 * reservation drawer, 50 in the customer drawer — so a repeat customer's
 * lifetime spend was understated, and the two screens showed different numbers
 * for the same person one click apart. The one actually labelled "Lifetime"
 * was itself capped at 50.
 *
 * This customer has 25 counting reservations: more than the reservation
 * drawer's old cap, so the old code would have disagreed here.
 */
const suffix = randomUUID().slice(0, 8);
const ids = {
  customer: `spend-customer-${suffix}`,
  vehicle: `spend-vehicle-${suffix}`,
};

const COUNTING = 25; // ACTIVE or COMPLETED — these are spend
const PRICE = 100;
/** Not spend: committed or abandoned, but no money realised. */
const NON_COUNTING: ("PENDING" | "CONFIRMED" | "CANCELLED")[] = [
  "PENDING",
  "CONFIRMED",
  "CANCELLED",
];

let firstReservationId = "";

beforeAll(async () => {
  await prisma.customer.create({
    data: {
      id: ids.customer,
      firstName: "Repeat",
      lastName: "Customer",
      email: `spend-${suffix}@example.test`,
      phone: "-",
    },
  });
  await prisma.vehicle.create({
    data: {
      id: ids.vehicle,
      slug: `spend-car-${suffix}`,
      brand: "Test",
      model: "Spend",
      year: 2027,
      category: "SEDAN",
      transmission: "AUTOMATIC",
      fuelType: "PETROL",
      seats: 5,
      pricePerDay: 25,
      description: "Integration-test vehicle for customer spend aggregation.",
    },
  });

  // Sequential, non-overlapping COMPLETED rentals. The exclusion constraint
  // only covers CONFIRMED/ACTIVE, but keeping them apart is honest anyway.
  for (let i = 0; i < COUNTING; i++) {
    const start = new Date(Date.UTC(2025, 0, 1 + i * 2, 10));
    const end = new Date(Date.UTC(2025, 0, 2 + i * 2, 10));
    const created = await prisma.reservation.create({
      data: {
        vehicleId: ids.vehicle,
        customerId: ids.customer,
        pickupDate: start,
        returnDate: end,
        status: "COMPLETED",
        totalPrice: PRICE,
      },
    });
    if (i === 0) firstReservationId = created.id;
  }

  // Well clear of the completed run above, and of each other.
  for (const [i, status] of NON_COUNTING.entries()) {
    await prisma.reservation.create({
      data: {
        vehicleId: ids.vehicle,
        customerId: ids.customer,
        pickupDate: new Date(Date.UTC(2026, 5, 1 + i * 5, 10)),
        returnDate: new Date(Date.UTC(2026, 5, 3 + i * 5, 10)),
        status,
        totalPrice: 999,
      },
    });
  }
});

afterAll(async () => {
  await prisma.reservation.deleteMany({ where: { customerId: ids.customer } });
  await prisma.vehicle.deleteMany({ where: { id: ids.vehicle } });
  await prisma.customer.deleteMany({ where: { id: ids.customer } });
  await prisma.$disconnect();
});

describe("customer lifetime spend", () => {
  it("counts every realised rental, not just the page that was loaded", async () => {
    // 25 × 100. The reservation drawer used to include only 20 rows, so the
    // old computation would have produced 2000 here.
    expect(await getCustomerSpend(ids.customer)).toBe(COUNTING * PRICE);
  });

  it("excludes reservations where no money was realised", async () => {
    // The three 999 rows are PENDING, CONFIRMED and CANCELLED. If any were
    // counted the total would not be a clean multiple of 100.
    const spend = await getCustomerSpend(ids.customer);
    expect(spend % PRICE).toBe(0);
    expect(spend).not.toBeGreaterThan(COUNTING * PRICE);
  });

  it("reports the same figure in both drawers", async () => {
    const [fromCustomer, fromReservation] = await Promise.all([
      getCustomerById(ids.customer),
      getReservationDetail(firstReservationId),
    ]);

    expect(fromCustomer.spend).toBe(COUNTING * PRICE);
    expect(fromReservation.customer.spend).toBe(COUNTING * PRICE);
    // The point of the fix: one number, not two.
    expect(fromReservation.customer.spend).toBe(fromCustomer.spend);
  });

  it("is zero for a customer who has never completed a rental", async () => {
    const fresh = await prisma.customer.create({
      data: {
        firstName: "New",
        lastName: "Customer",
        email: `fresh-${suffix}@example.test`,
        phone: "-",
      },
    });
    expect(await getCustomerSpend(fresh.id)).toBe(0);
    await prisma.customer.delete({ where: { id: fresh.id } });
  });
});
