import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { businessDay } from "@/lib/reservation-lifecycle";
import { cancelReservation } from "@/services/reservation.service";
import { recordRentalInspection } from "@/services/inspection.service";

const suffix = randomUUID().slice(0, 8);
const ids = {
  user: `test-user-${suffix}`,
  customer: `test-customer-${suffix}`,
  vehicle: `test-vehicle-${suffix}`,
  reservation: `test-reservation-${suffix}`,
};

const now = new Date();
const pickup = new Date(`${businessDay(now)}T10:00:00.000Z`);
const returnDate = new Date(pickup);
returnDate.setUTCDate(returnDate.getUTCDate() + 2);
const registrationExpiry = new Date(returnDate);
registrationExpiry.setUTCDate(registrationExpiry.getUTCDate() + 30);

describe("reservation transition concurrency", () => {
  beforeAll(async () => {
    await prisma.user.create({
      data: {
        id: ids.user,
        name: "Concurrency Tester",
        email: `concurrency-${suffix}@example.test`,
        password: "not-used",
      },
    });
    await prisma.customer.create({
      data: {
        id: ids.customer,
        firstName: "Test",
        lastName: "Customer",
        email: `customer-${suffix}@example.test`,
        phone: "-",
      },
    });
    await prisma.vehicle.create({
      data: {
        id: ids.vehicle,
        slug: `concurrency-car-${suffix}`,
        plate: `TEST-${suffix}`.toUpperCase(),
        brand: "Test",
        model: "Concurrency",
        year: 2026,
        category: "SEDAN",
        transmission: "AUTOMATIC",
        fuelType: "PETROL",
        seats: 5,
        pricePerDay: 50,
        description: "Integration-test vehicle for transition locking.",
        registrationExpiry,
      },
    });
    await prisma.reservation.create({
      data: {
        id: ids.reservation,
        vehicleId: ids.vehicle,
        customerId: ids.customer,
        pickupDate: pickup,
        returnDate,
        status: "CONFIRMED",
        totalPrice: 100,
      },
    });
  });

  afterAll(async () => {
    await prisma.reservation.deleteMany({ where: { id: ids.reservation } });
    await prisma.vehicle.deleteMany({ where: { id: ids.vehicle } });
    await prisma.customer.deleteMany({ where: { id: ids.customer } });
    await prisma.user.deleteMany({ where: { id: ids.user } });
    await prisma.$disconnect();
  });

  it("allows cancellation or pickup to win, but never both", async () => {
    const results = await Promise.allSettled([
      cancelReservation(ids.reservation),
      recordRentalInspection(
        ids.reservation,
        ids.user,
        {
          type: "PICKUP",
          mileage: 10_000,
          fuelLevel: 100,
          damageFound: false,
          signerName: "Test Customer",
          customerAcknowledged: true,
          photos: [],
        },
        now
      ),
    ]);

    expect(
      results.filter((result) => result.status === "fulfilled")
    ).toHaveLength(1);

    const [reservation, vehicle, inspections] = await Promise.all([
      prisma.reservation.findUniqueOrThrow({ where: { id: ids.reservation } }),
      prisma.vehicle.findUniqueOrThrow({ where: { id: ids.vehicle } }),
      prisma.rentalInspection.count({
        where: { reservationId: ids.reservation },
      }),
    ]);

    if (reservation.status === "ACTIVE") {
      expect(vehicle.status).toBe("RENTED");
      expect(inspections).toBe(1);
    } else {
      expect(reservation.status).toBe("CANCELLED");
      expect(vehicle.status).toBe("AVAILABLE");
      expect(inspections).toBe(0);
    }
  });
});
