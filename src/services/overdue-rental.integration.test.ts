import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { AppError } from "@/lib/errors";
import { businessDay } from "@/lib/reservation-lifecycle";
import { adminVehicleFilterSchema } from "@/lib/validations/vehicle";
import {
  checkAvailability,
  createManualReservation,
  getVehicleBookingCalendar,
  updateReservationStatus,
} from "@/services/reservation.service";
import { getVehicles } from "@/services/vehicle.service";

/**
 * A rental that is ACTIVE past its scheduled return means the car is still
 * out. The exclusion constraint only compares scheduled ranges, so before
 * this rule such a car was reported available and accepted a second
 * confirmed booking. These tests pin every path that answers "is it free?".
 */
const suffix = randomUUID().slice(0, 8);
const brand = `Overdue${suffix}`;
const ids = {
  customer: `od-customer-${suffix}`,
  overdueCar: `od-car-${suffix}`,
  onTimeCar: `od-ontime-${suffix}`,
  overdue: `od-overdue-${suffix}`,
  onTime: `od-ontime-res-${suffix}`,
  pending: `od-pending-${suffix}`,
};

const DAY = 24 * 60 * 60 * 1000;
const today = new Date(`${businessDay(new Date())}T10:00:00.000Z`);
const at = (days: number) => new Date(today.getTime() + days * DAY);

// The window being asked about: well after the overdue return, and after the
// on-time rental is due back.
const windowStart = at(10);
const windowEnd = at(13);
const walkInCustomers: string[] = [];

function vehicle(id: string, status: "RENTED" | "AVAILABLE") {
  return {
    id,
    slug: `${id}-slug`,
    plate: id.toUpperCase().slice(0, 15),
    brand,
    model: status === "RENTED" ? "Overdue" : "OnTime",
    year: 2026,
    category: "SEDAN" as const,
    transmission: "AUTOMATIC" as const,
    fuelType: "PETROL" as const,
    seats: 5,
    pricePerDay: 40,
    status,
    description: "Integration-test vehicle for overdue rentals.",
  };
}

beforeAll(async () => {
  await prisma.customer.create({
    data: {
      id: ids.customer,
      firstName: "Overdue",
      lastName: "Tester",
      email: `overdue-${suffix}@example.test`,
      phone: "-",
    },
  });
  await prisma.vehicle.createMany({
    data: [vehicle(ids.overdueCar, "RENTED"), vehicle(ids.onTimeCar, "RENTED")],
  });
  await prisma.reservation.createMany({
    data: [
      {
        id: ids.overdue,
        vehicleId: ids.overdueCar,
        customerId: ids.customer,
        pickupDate: at(-10),
        returnDate: at(-5),
        status: "ACTIVE",
        totalPrice: 200,
      },
      {
        id: ids.onTime,
        vehicleId: ids.onTimeCar,
        customerId: ids.customer,
        pickupDate: at(-2),
        returnDate: at(3),
        status: "ACTIVE",
        totalPrice: 200,
      },
      {
        id: ids.pending,
        vehicleId: ids.overdueCar,
        customerId: ids.customer,
        pickupDate: windowStart,
        returnDate: windowEnd,
        status: "PENDING",
        totalPrice: 120,
      },
    ],
  });
});

afterAll(async () => {
  await prisma.reservation.deleteMany({
    where: { vehicleId: { in: [ids.overdueCar, ids.onTimeCar] } },
  });
  await prisma.vehicle.deleteMany({
    where: { id: { in: [ids.overdueCar, ids.onTimeCar] } },
  });
  await prisma.customer.deleteMany({
    where: { id: { in: [ids.customer, ...walkInCustomers] } },
  });
  await prisma.$disconnect();
});

describe("an overdue rental keeps its car occupied", () => {
  it("reports the car unavailable for any later dates", async () => {
    const range = { pickupDate: windowStart, returnDate: windowEnd };
    expect(
      await checkAvailability({ vehicleId: ids.overdueCar, ...range })
    ).toEqual({ available: false });
    // A rental that is merely out, but not late, frees the car after it.
    expect(
      await checkAvailability({ vehicleId: ids.onTimeCar, ...range })
    ).toEqual({ available: true });
  });

  it("blocks the storefront date picker with an open-ended range", async () => {
    const calendar = await getVehicleBookingCalendar(ids.overdueCar);
    expect(calendar.blockedRanges).toContainEqual({
      from: businessDay(at(-10)),
      to: "9999-12-31",
    });
  });

  it("drops the car from the fleet's date-range filter", async () => {
    const filters = adminVehicleFilterSchema.parse({
      from: windowStart.toISOString(),
      to: windowEnd.toISOString(),
    });
    const { items } = await getVehicles(filters, { brand });
    expect(items.map((v) => v.id)).toEqual([ids.onTimeCar]);
  });

  it("refuses a staff booking confirmed on the car, leaving no customer", async () => {
    const before = await prisma.customer.count({
      where: { firstName: "Walkin", lastName: suffix },
    });
    const attempt = createManualReservation({
      vehicleId: ids.overdueCar,
      customerName: `Walkin ${suffix}`,
      pickupDate: windowStart,
      returnDate: windowEnd,
      status: "CONFIRMED",
    });
    await expect(attempt).rejects.toBeInstanceOf(AppError);
    await expect(attempt).rejects.toMatchObject({
      status: 409,
      text: { key: "err.overdueRental" },
    });
    expect(
      await prisma.customer.count({
        where: { firstName: "Walkin", lastName: suffix },
      })
    ).toBe(before);
  });

  it("still accepts a pending request, which commits nothing", async () => {
    const created = await createManualReservation({
      vehicleId: ids.overdueCar,
      customerName: `Walkin ${suffix}`,
      pickupDate: at(20),
      returnDate: at(22),
      status: "PENDING",
    });
    walkInCustomers.push(created.customerId);
    expect(created.status).toBe("PENDING");
  });

  it("refuses to confirm a pending request on the car", async () => {
    await expect(
      updateReservationStatus(ids.pending, "CONFIRMED")
    ).rejects.toMatchObject({ text: { key: "err.overdueRental" } });
    const after = await prisma.reservation.findUniqueOrThrow({
      where: { id: ids.pending },
    });
    expect(after.status).toBe("PENDING");
  });

  it("frees the car once the return is recorded", async () => {
    await prisma.reservation.update({
      where: { id: ids.overdue },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
    expect(
      await checkAvailability({
        vehicleId: ids.overdueCar,
        pickupDate: windowStart,
        returnDate: windowEnd,
      })
    ).toEqual({ available: true });
  });
});
