import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { removeTestActor } from "@/lib/testing/audit";
import { AppError } from "@/lib/errors";
import { BUSINESS_TIME_ZONE, businessDay } from "@/lib/reservation-lifecycle";
import type { RentalInspectionInput } from "@/lib/validations/inspection";
import { recordRentalInspection } from "@/services/inspection.service";

/**
 * Staff forgot to press Start, the rental happened anyway, and its whole
 * window is now in the past. It used to be refused ("Rental window has
 * ended") with no way to record it; it can now be started late — once
 * confirmed, dated, and never before the pickup day — and then completed.
 */
const suffix = randomUUID().slice(0, 8);
const ids = {
  user: `late-user-${suffix}`,
  customer: `late-customer-${suffix}`,
  vehicle: `late-vehicle-${suffix}`,
  past: `late-past-${suffix}`,
  future: `late-future-${suffix}`,
};

const DAY = 24 * 60 * 60 * 1000;
const now = new Date();
const today = businessDay(now);
const at = (days: number) =>
  new Date(new Date(`${today}T10:00:00.000Z`).getTime() + days * DAY);
const dayOf = (date: Date) => date.toISOString().slice(0, 10);

// Booked for ten to seven days ago: the whole window has passed.
const pastPickup = at(-10);
const pastReturn = at(-7);

const base = {
  mileage: 10_000,
  fuelLevel: 100,
  damageFound: false,
  signerName: "Late Customer",
  customerAcknowledged: true as const,
  photos: [],
};
const pickup = (extra: Partial<RentalInspectionInput> = {}) =>
  recordRentalInspection(
    ids.past,
    ids.user,
    { ...base, type: "PICKUP", ...extra },
    now
  );

async function refusalKey(promise: Promise<unknown>) {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught
  );
  expect(error).toBeInstanceOf(AppError);
  return (error as AppError).text?.key;
}

const belgradeHour = (date: Date) =>
  new Intl.DateTimeFormat("en", {
    timeZone: BUSINESS_TIME_ZONE,
    hour: "2-digit",
    hourCycle: "h23",
  }).format(date);

beforeAll(async () => {
  await prisma.user.create({
    data: {
      id: ids.user,
      name: "Late Start Tester",
      email: `late-${suffix}@example.test`,
      password: "not-used",
    },
  });
  await prisma.customer.create({
    data: {
      id: ids.customer,
      firstName: "Late",
      lastName: "Customer",
      email: `late-customer-${suffix}@example.test`,
      phone: "-",
    },
  });
  await prisma.vehicle.create({
    data: {
      id: ids.vehicle,
      slug: `late-car-${suffix}`,
      plate: `LATE-${suffix}`.toUpperCase(),
      brand: "Test",
      model: "LateStart",
      year: 2026,
      category: "SEDAN",
      transmission: "AUTOMATIC",
      fuelType: "PETROL",
      seats: 5,
      pricePerDay: 50,
      description: "Integration-test vehicle for late rental starts.",
      registrationExpiry: at(365),
    },
  });
  await prisma.reservation.createMany({
    data: [
      {
        id: ids.past,
        vehicleId: ids.vehicle,
        customerId: ids.customer,
        pickupDate: pastPickup,
        returnDate: pastReturn,
        status: "CONFIRMED",
        totalPrice: 150,
      },
      {
        id: ids.future,
        vehicleId: ids.vehicle,
        customerId: ids.customer,
        pickupDate: at(5),
        returnDate: at(7),
        status: "CONFIRMED",
        totalPrice: 100,
      },
    ],
  });
});

afterAll(async () => {
  const reservationId = { in: [ids.past, ids.future] };
  await prisma.inspectionPhoto.deleteMany({
    where: { inspection: { reservationId } },
  });
  await prisma.rentalInspection.deleteMany({ where: { reservationId } });
  await prisma.reservation.deleteMany({ where: { id: reservationId } });
  await prisma.vehicle.deleteMany({ where: { id: ids.vehicle } });
  await prisma.customer.deleteMany({ where: { id: ids.customer } });
  await removeTestActor(ids.user);
  await prisma.$disconnect();
});

describe("starting a rental after its pickup date", () => {
  it("still refuses a start before the pickup day, confirmed or not", async () => {
    expect(
      await refusalKey(
        recordRentalInspection(
          ids.future,
          ids.user,
          { ...base, type: "PICKUP", lateStartConfirmed: true },
          now
        )
      )
    ).toBe("err.pickupOnPickupDate");
  });

  it("refuses a late start that was not explicitly confirmed", async () => {
    expect(await refusalKey(pickup())).toBe("err.lateStartUnconfirmed");
    expect(await refusalKey(pickup({ lateStartConfirmed: false }))).toBe(
      "err.lateStartUnconfirmed"
    );
  });

  it("refuses a handover dated before the pickup day or in the future", async () => {
    expect(
      await refusalKey(
        pickup({ lateStartConfirmed: true, occurredOn: dayOf(at(-11)) })
      )
    ).toBe("err.handoverBeforePickup");
    expect(
      await refusalKey(
        pickup({ lateStartConfirmed: true, occurredOn: dayOf(at(1)) })
      )
    ).toBe("err.occurredInFuture");

    // Nothing was half-written by the refusals.
    const reservation = await prisma.reservation.findUniqueOrThrow({
      where: { id: ids.past },
      include: { inspections: true },
    });
    expect(reservation.status).toBe("CONFIRMED");
    expect(reservation.startedAt).toBeNull();
    expect(reservation.inspections).toHaveLength(0);
  });

  it("starts once confirmed, recording the day the car actually left", async () => {
    await pickup({ lateStartConfirmed: true, occurredOn: dayOf(pastPickup) });

    const [reservation, vehicle] = await Promise.all([
      prisma.reservation.findUniqueOrThrow({ where: { id: ids.past } }),
      prisma.vehicle.findUniqueOrThrow({ where: { id: ids.vehicle } }),
    ]);
    expect(reservation.status).toBe("ACTIVE");
    // The scheduled time of day, on the day it really happened.
    expect(businessDay(reservation.startedAt!)).toBe(dayOf(pastPickup));
    expect(belgradeHour(reservation.startedAt!)).toBe("10");
    // The booking itself is untouched: the exclusion constraint, revenue
    // and the overdue counts keep reading the dates as booked.
    expect(reservation.pickupDate).toEqual(pastPickup);
    expect(reservation.returnDate).toEqual(pastReturn);
    expect(vehicle.status).toBe("RENTED");
  });

  it("refuses a return dated before the handover", async () => {
    expect(
      await refusalKey(
        recordRentalInspection(
          ids.past,
          ids.user,
          { ...base, type: "RETURN", occurredOn: dayOf(at(-11)) },
          now
        )
      )
    ).toBe("err.returnBeforeHandover");
  });

  it("then completes, on the day the car came back", async () => {
    await recordRentalInspection(
      ids.past,
      ids.user,
      {
        ...base,
        type: "RETURN",
        mileage: 10_400,
        occurredOn: dayOf(pastReturn),
      },
      now
    );

    const [reservation, vehicle] = await Promise.all([
      prisma.reservation.findUniqueOrThrow({ where: { id: ids.past } }),
      prisma.vehicle.findUniqueOrThrow({ where: { id: ids.vehicle } }),
    ]);
    expect(reservation.status).toBe("COMPLETED");
    expect(businessDay(reservation.completedAt!)).toBe(dayOf(pastReturn));
    expect(reservation.completedAt! > reservation.startedAt!).toBe(true);
    expect(vehicle.status).toBe("AVAILABLE");
  });
});
