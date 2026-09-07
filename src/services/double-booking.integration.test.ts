import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { normalizeError } from "@/lib/errors";
import { updateReservationStatus } from "@/services/reservation.service";

/**
 * The exclusion constraint is the only real guarantee against double-booking,
 * and the friendly 409 it produces depends on `normalizeError` recognising the
 * violation by substring-matching `reservations_no_overlap` in a Postgres
 * message surfaced through Prisma — which nothing tested.
 *
 * If that match ever stops working (a Prisma release rewording its wrapper, a
 * constraint rename), every double-booking becomes an opaque 500 and the app
 * gives no indication why. These tests pin both halves: that the database
 * refuses the overlap, and that the refusal is still translated into a 409.
 */
const suffix = randomUUID().slice(0, 8);
const ids = {
  customer: `dbl-customer-${suffix}`,
  vehicle: `dbl-vehicle-${suffix}`,
  first: `dbl-first-${suffix}`,
  second: `dbl-second-${suffix}`,
};

const pickup = new Date("2027-06-01T10:00:00.000Z");
const returnDate = new Date("2027-06-08T10:00:00.000Z");
// Starts inside the first rental, so the ranges genuinely overlap.
const overlapPickup = new Date("2027-06-04T10:00:00.000Z");
const overlapReturn = new Date("2027-06-11T10:00:00.000Z");

beforeAll(async () => {
  await prisma.customer.create({
    data: {
      id: ids.customer,
      firstName: "Overlap",
      lastName: "Tester",
      email: `overlap-${suffix}@example.test`,
      phone: "-",
    },
  });
  await prisma.vehicle.create({
    data: {
      id: ids.vehicle,
      slug: `overlap-car-${suffix}`,
      plate: `DBL-${suffix}`.toUpperCase(),
      brand: "Test",
      model: "Overlap",
      year: 2027,
      category: "SEDAN",
      transmission: "AUTOMATIC",
      fuelType: "PETROL",
      seats: 5,
      pricePerDay: 40,
      description: "Integration-test vehicle for the overlap constraint.",
    },
  });
  await prisma.reservation.create({
    data: {
      id: ids.first,
      vehicleId: ids.vehicle,
      customerId: ids.customer,
      pickupDate: pickup,
      returnDate,
      status: "CONFIRMED",
      totalPrice: 280,
    },
  });
});

afterAll(async () => {
  await prisma.reservation.deleteMany({
    where: { vehicleId: ids.vehicle },
  });
  await prisma.vehicle.deleteMany({ where: { id: ids.vehicle } });
  await prisma.customer.deleteMany({ where: { id: ids.customer } });
  await prisma.$disconnect();
});

describe("double-booking is refused by the database, not the application", () => {
  it("rejects a second CONFIRMED reservation overlapping the first", async () => {
    await expect(
      prisma.reservation.create({
        data: {
          vehicleId: ids.vehicle,
          customerId: ids.customer,
          pickupDate: overlapPickup,
          returnDate: overlapReturn,
          status: "CONFIRMED",
          totalPrice: 280,
        },
      })
    ).rejects.toThrow();
  });

  it("still names the constraint, which is how the 409 is recognised", async () => {
    let caught: unknown;
    try {
      await prisma.reservation.create({
        data: {
          vehicleId: ids.vehicle,
          customerId: ids.customer,
          pickupDate: overlapPickup,
          returnDate: overlapReturn,
          status: "CONFIRMED",
          totalPrice: 280,
        },
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Error);
    // The assumption normalizeError depends on. If this fails, the mapping
    // below is dead and every double-booking returns a 500.
    expect((caught as Error).message).toContain("reservations_no_overlap");
  });

  it("maps the violation to a 409 with a message a customer can act on", async () => {
    let caught: unknown;
    try {
      await prisma.reservation.create({
        data: {
          vehicleId: ids.vehicle,
          customerId: ids.customer,
          pickupDate: overlapPickup,
          returnDate: overlapReturn,
          status: "CONFIRMED",
          totalPrice: 280,
        },
      });
    } catch (error) {
      caught = error;
    }

    const { status, body } = normalizeError(caught);
    expect(status).toBe(409);
    expect(body.error.code).toBe("CONFLICT");
    expect(body.error.message).toBe(
      "Vehicle is already booked for the selected dates"
    );
  });

  it("allows a PENDING request to overlap, because only commitments block", async () => {
    // The constraint is scoped to CONFIRMED/ACTIVE on purpose: several
    // customers may request the same car and staff decide between them.
    const pendingOverlap = await prisma.reservation.create({
      data: {
        id: ids.second,
        vehicleId: ids.vehicle,
        customerId: ids.customer,
        pickupDate: overlapPickup,
        returnDate: overlapReturn,
        status: "PENDING",
        totalPrice: 280,
      },
    });
    expect(pendingOverlap.status).toBe("PENDING");
  });

  it("refuses to confirm that PENDING request while the first still holds the dates", async () => {
    // The transition the business actually performs, through the service, so
    // the whole path is covered rather than a raw insert.
    await expect(
      updateReservationStatus(ids.second, "CONFIRMED")
    ).rejects.toThrow();

    const unchanged = await prisma.reservation.findUniqueOrThrow({
      where: { id: ids.second },
    });
    expect(unchanged.status).toBe("PENDING");
  });
});
