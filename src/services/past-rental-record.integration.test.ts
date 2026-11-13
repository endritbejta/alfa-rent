import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { removeTestActor } from "@/lib/testing/audit";
import { AppError } from "@/lib/errors";
import { businessDay } from "@/lib/reservation-lifecycle";
import type { PastRentalInput } from "@/lib/validations/inspection";
import { recordPastRental } from "@/services/inspection.service";

/**
 * Catching up on rentals that happened while nobody pressed Start. The
 * handover path refused these: it wants mileage nobody has any more, and a
 * car that is AVAILABLE now — so every past rental of a car that is out
 * again today was stuck, and several past rentals of one car had to be
 * entered strictly one after another.
 */
const suffix = randomUUID().slice(0, 8);
const ids = {
  user: `past-user-${suffix}`,
  customer: `past-customer-${suffix}`,
  busyCar: `past-busy-${suffix}`,
  otherCar: `past-other-${suffix}`,
  current: `past-current-${suffix}`,
  older: `past-older-${suffix}`,
  old: `past-old-${suffix}`,
  running: `past-running-${suffix}`,
  beforeNext: `past-before-next-${suffix}`,
  next: `past-next-${suffix}`,
};

const DAY = 24 * 60 * 60 * 1000;
const now = new Date();
const today = businessDay(now);
const at = (days: number) =>
  new Date(new Date(`${today}T10:00:00.000Z`).getTime() + days * DAY);
const dayOf = (date: Date) => date.toISOString().slice(0, 10);

const record = (id: string, input: Partial<PastRentalInput> = {}) =>
  recordPastRental(
    id,
    ids.user,
    {
      startedOn: input.startedOn ?? "",
      returnedOn: input.returnedOn ?? "",
      note: "Forgot to press Start; no odometer readings.",
      confirmed: true,
      ...input,
    },
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

function car(id: string, status: "RENTED" | "AVAILABLE") {
  return {
    id,
    slug: `${id}-slug`,
    plate: id.toUpperCase().slice(0, 15),
    brand: "Test",
    model: "PastRental",
    year: 2026,
    category: "SEDAN" as const,
    transmission: "AUTOMATIC" as const,
    fuelType: "PETROL" as const,
    seats: 5,
    pricePerDay: 40,
    status,
    description: "Integration-test vehicle for past rentals.",
    registrationExpiry: at(365),
  };
}

beforeAll(async () => {
  await prisma.user.create({
    data: {
      id: ids.user,
      name: "Past Rental Tester",
      email: `past-${suffix}@example.test`,
      password: "not-used",
    },
  });
  await prisma.customer.create({
    data: {
      id: ids.customer,
      firstName: "Past",
      lastName: "Customer",
      email: `past-customer-${suffix}@example.test`,
      phone: "-",
    },
  });
  // Out on a rental right now, with two forgotten rentals behind it.
  await prisma.vehicle.create({ data: car(ids.busyCar, "RENTED") });
  await prisma.vehicle.create({ data: car(ids.otherCar, "AVAILABLE") });
  const booking = (
    id: string,
    vehicleId: string,
    from: number,
    to: number,
    status: "CONFIRMED" | "ACTIVE" = "CONFIRMED"
  ) => ({
    id,
    vehicleId,
    customerId: ids.customer,
    pickupDate: at(from),
    returnDate: at(to),
    status,
    totalPrice: 100,
  });
  await prisma.reservation.createMany({
    data: [
      booking(ids.current, ids.busyCar, -2, 3, "ACTIVE"),
      booking(ids.older, ids.busyCar, -30, -25),
      booking(ids.old, ids.busyCar, -20, -15),
      booking(ids.running, ids.otherCar, -3, 2),
      booking(ids.beforeNext, ids.otherCar, -40, -35),
      booking(ids.next, ids.otherCar, -33, -30),
    ],
  });
});

afterAll(async () => {
  await prisma.reservation.deleteMany({
    where: { customerId: ids.customer },
  });
  await prisma.vehicle.deleteMany({
    where: { id: { in: [ids.busyCar, ids.otherCar] } },
  });
  await prisma.customer.deleteMany({ where: { id: ids.customer } });
  await removeTestActor(ids.user);
  await prisma.$disconnect();
});

describe("recording a past rental after the fact", () => {
  it("refuses a rental that is not over yet: that one is started late instead", async () => {
    expect(
      await refusalKey(
        record(ids.running, {
          startedOn: dayOf(at(-3)),
          returnedOn: today,
        })
      )
    ).toBe("err.pastRentalNotOver");
  });

  it("keeps the date bounds: not before pickup, not in the future, return after handover", async () => {
    expect(
      await refusalKey(
        record(ids.old, {
          startedOn: dayOf(at(-21)),
          returnedOn: dayOf(at(-15)),
        })
      )
    ).toBe("err.handoverBeforePickup");
    expect(
      await refusalKey(
        record(ids.old, {
          startedOn: dayOf(at(-20)),
          returnedOn: dayOf(at(1)),
        })
      )
    ).toBe("err.occurredInFuture");
    expect(
      await refusalKey(
        record(ids.old, {
          startedOn: dayOf(at(-17)),
          returnedOn: dayOf(at(-18)),
        })
      )
    ).toBe("err.returnBeforeHandover");
  });

  it("refuses a return that runs into the car's next booking", async () => {
    expect(
      await refusalKey(
        record(ids.beforeNext, {
          startedOn: dayOf(at(-40)),
          returnedOn: dayOf(at(-32)),
        })
      )
    ).toBe("err.backfillOverlapsNext");
  });

  it("records past rentals of a car that is out again today, in any order", async () => {
    // Newer first: nothing about the car's present state is in the way.
    await record(ids.old, {
      startedOn: dayOf(at(-20)),
      returnedOn: dayOf(at(-15)),
    });
    await record(ids.older, {
      startedOn: dayOf(at(-29)),
      returnedOn: dayOf(at(-25)),
    });

    const [old, older, current, vehicle, inspections] = await Promise.all([
      prisma.reservation.findUniqueOrThrow({ where: { id: ids.old } }),
      prisma.reservation.findUniqueOrThrow({ where: { id: ids.older } }),
      prisma.reservation.findUniqueOrThrow({ where: { id: ids.current } }),
      prisma.vehicle.findUniqueOrThrow({ where: { id: ids.busyCar } }),
      prisma.rentalInspection.count({
        where: { reservationId: { in: [ids.old, ids.older] } },
      }),
    ]);

    expect(old.status).toBe("COMPLETED");
    expect(businessDay(old.startedAt!)).toBe(dayOf(at(-20)));
    expect(businessDay(old.completedAt!)).toBe(dayOf(at(-15)));
    expect(older.status).toBe("COMPLETED");
    // The day it really went out, not the booked one.
    expect(businessDay(older.startedAt!)).toBe(dayOf(at(-29)));

    // The audit trace.
    expect(old.backfilledAt).toEqual(now);
    expect(old.backfilledById).toBe(ids.user);
    expect(old.backfillNote).toBe(
      "Forgot to press Start; no odometer readings."
    );

    // The booking as made, the car as it is now, and no invented inspections.
    expect(old.pickupDate).toEqual(at(-20));
    expect(old.returnDate).toEqual(at(-15));
    expect(current.status).toBe("ACTIVE");
    expect(vehicle.status).toBe("RENTED");
    expect(inspections).toBe(0);
  });

  it("does not record the same rental twice", async () => {
    expect(
      await refusalKey(
        record(ids.old, {
          startedOn: dayOf(at(-20)),
          returnedOn: dayOf(at(-15)),
        })
      )
    ).toBe("err.pastRentalNotOver");
  });
});
