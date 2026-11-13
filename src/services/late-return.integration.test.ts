import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { AppError } from "@/lib/errors";
import { businessDay } from "@/lib/business-time";
import { createTestActor, removeTestActor } from "@/lib/testing/audit";
import {
  lateReturnSchema,
  type LateReturnInput,
  type PastRentalInput,
  type RentalInspectionInput,
} from "@/lib/validations/inspection";
import {
  getAnalytics,
  getReservationInsights,
} from "@/services/analytics.service";
import { getCustomerSpend } from "@/services/customer.service";
import { getVehicleDetail } from "@/services/fleet.service";
import {
  recordPastRental,
  recordRentalInspection,
} from "@/services/inspection.service";

/**
 * Late returns (audit P2-4). A car due back Friday that came back Monday
 * used to close at the Friday price: the extra days unbilled, and invisible
 * in revenue, customer spend and what the car earned. Now staff charge the
 * extra days or waive them with a reason, in the same transaction as the
 * return, and the booked dates stay as they were.
 */
const suffix = randomUUID().slice(0, 8);
const ids = {
  customer: `late-customer-${suffix}`,
  cars: [1, 2, 3, 4, 5, 6].map((n) => `late-car${n}-${suffix}`),
  charged: `late-charged-${suffix}`,
  waived: `late-waived-${suffix}`,
  onTime: `late-ontime-${suffix}`,
  rolledBack: `late-rollback-${suffix}`,
  overlapping: `late-overlap-${suffix}`,
  next: `late-next-${suffix}`,
  past: `late-past-${suffix}`,
  quiet: `late-quiet-${suffix}`,
};
let actor = "";

const DAY = 24 * 60 * 60 * 1000;
const now = new Date();
const today = businessDay(now);
const at = (days: number) =>
  new Date(new Date(`${today}T10:00:00.000Z`).getTime() + days * DAY);
const dayOf = (date: Date) => date.toISOString().slice(0, 10);

const returnInput = (
  lateReturn?: LateReturnInput,
  extra: Partial<RentalInspectionInput> = {}
): RentalInspectionInput => ({
  type: "RETURN",
  mileage: 12_000,
  fuelLevel: 80,
  damageFound: false,
  signerName: "Late Customer",
  customerAcknowledged: true,
  photos: [],
  lateReturn,
  ...extra,
});

const giveBack = (
  id: string,
  lateReturn?: LateReturnInput,
  extra?: Partial<RentalInspectionInput>
) => recordRentalInspection(id, actor, returnInput(lateReturn, extra), now);

const WAIVER = "Broke down on the road; agreed with the owner.";

async function refusalKey(promise: Promise<unknown>) {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught
  );
  expect(error).toBeInstanceOf(AppError);
  return (error as AppError).text?.key;
}

const events = (entityId: string) =>
  prisma.auditEvent.findMany({
    where: { entityId },
    orderBy: { createdAt: "asc" },
  });

function car(id: string, pricePerDay: number | string) {
  return {
    id,
    slug: `${id}-slug`,
    plate: id.toUpperCase().slice(0, 15),
    brand: "Test",
    model: "LateReturn",
    year: 2026,
    category: "SEDAN" as const,
    transmission: "AUTOMATIC" as const,
    fuelType: "PETROL" as const,
    seats: 5,
    pricePerDay,
    status: "RENTED" as const,
    description: "Integration-test vehicle for late returns.",
  };
}

const quietAt = (y: number, m: number, d: number) =>
  new Date(Date.UTC(y, m - 1, d, 10));

beforeAll(async () => {
  actor = await createTestActor(`late-${suffix}`);
  await prisma.customer.create({
    data: {
      id: ids.customer,
      firstName: "Late",
      lastName: "Customer",
      email: `late-${suffix}@example.test`,
      phone: "-",
    },
  });
  const [c1, c2, c3, c4, c5, c6] = ids.cars;
  await prisma.vehicle.createMany({
    data: [
      car(c1, 40),
      car(c2, 40),
      car(c3, 40),
      car(c4, "33.33"),
      car(c5, 50),
      { ...car(c6, 100), status: "AVAILABLE" as const },
    ],
  });
  const booking = (
    id: string,
    vehicleId: string,
    from: Date,
    to: Date,
    totalPrice: number | string,
    status: "CONFIRMED" | "ACTIVE" = "ACTIVE"
  ) => ({
    id,
    vehicleId,
    customerId: ids.customer,
    pickupDate: from,
    returnDate: to,
    status,
    totalPrice,
    ...(status === "ACTIVE" && { startedAt: from }),
  });
  await prisma.reservation.createMany({
    data: [
      // Due back three days ago: 4 booked days at 40.
      booking(ids.charged, c1, at(-6), at(-3), 160),
      booking(ids.waived, c2, at(-5), at(-2), 160),
      // Due back today: on time.
      booking(ids.onTime, c3, at(-2), at(0), 120),
      booking(ids.rolledBack, c4, at(-6), at(-3), "133.32"),
      // Kept past its return day, into the next customer's booking.
      booking(ids.overlapping, c5, at(-5), at(-2), 200),
      booking(ids.next, c5, at(-1), at(2), 200, "CONFIRMED"),
      // A whole rental nobody pressed Start on, returned two days late.
      booking(ids.past, c5, at(-20), at(-15), 300, "CONFIRMED"),
      // 2034, where nothing else lives, for the revenue figures.
      booking(
        ids.quiet,
        c6,
        quietAt(2034, 1, 28),
        quietAt(2034, 1, 31),
        400,
        "CONFIRMED"
      ),
    ],
  });
});

afterAll(async () => {
  const reservationIds = await prisma.reservation.findMany({
    where: { customerId: ids.customer },
    select: { id: true },
  });
  await prisma.rentalInspection.deleteMany({
    where: { reservationId: { in: reservationIds.map((r) => r.id) } },
  });
  await prisma.reservation.deleteMany({ where: { customerId: ids.customer } });
  await prisma.vehicle.deleteMany({ where: { id: { in: ids.cars } } });
  await prisma.customer.deleteMany({ where: { id: ids.customer } });
  await removeTestActor(actor);
  await prisma.$disconnect();
});

describe("returning a car after its return day", () => {
  it("asks how to settle it: a late return cannot just close", async () => {
    expect(await refusalKey(giveBack(ids.charged))).toBe(
      "err.lateReturnUnresolved"
    );
    const row = await prisma.reservation.findUniqueOrThrow({
      where: { id: ids.charged },
    });
    expect(row.status).toBe("ACTIVE");
  });

  it("charges the extra days at today's rate, in Decimal, into the total", async () => {
    // A rate change since booking: the late days are priced at today's.
    await prisma.vehicle.update({
      where: { id: ids.cars[0] },
      data: { pricePerDay: 45 },
    });
    await giveBack(ids.charged, { resolution: "CHARGE", days: 3 });

    const row = await prisma.reservation.findUniqueOrThrow({
      where: { id: ids.charged },
    });
    expect(row.status).toBe("COMPLETED");
    expect(row.lateDays).toBe(3);
    expect(row.lateResolution).toBe("CHARGED");
    expect(row.lateCharge?.toFixed(2)).toBe("135.00");
    expect(row.totalPrice.toFixed(2)).toBe("295.00");
    expect(row.lateWaiverReason).toBeNull();
    // The booking as made.
    expect(row.returnDate).toEqual(at(-3));

    const log = await events(ids.charged);
    expect(log.map((event) => event.action)).toEqual([
      "reservation.complete",
      "reservation.lateCharge",
    ]);
    expect(log[1]!.actorId).toBe(actor);
    expect(log[1]!.before).toEqual({ totalPrice: "160.00" });
    expect(log[1]!.after).toEqual({
      lateDays: 3,
      pricePerDay: "45.00",
      lateCharge: "135.00",
      totalPrice: "295.00",
    });
  });

  it("does not stack cents: 3 × 33.33 is 99.99", async () => {
    await giveBack(ids.rolledBack, { resolution: "CHARGE", days: 3 });
    const row = await prisma.reservation.findUniqueOrThrow({
      where: { id: ids.rolledBack },
    });
    expect(row.lateCharge?.toFixed(2)).toBe("99.99");
    expect(row.totalPrice.toFixed(2)).toBe("233.31");
  });

  it("waives only with a reason, and changes no price", async () => {
    // The action's schema refuses an empty or too-short reason.
    expect(
      lateReturnSchema.safeParse({ resolution: "WAIVE", reason: "ok" }).success
    ).toBe(false);

    await giveBack(ids.waived, { resolution: "WAIVE", reason: WAIVER });

    const row = await prisma.reservation.findUniqueOrThrow({
      where: { id: ids.waived },
    });
    expect(row.status).toBe("COMPLETED");
    expect(row.lateDays).toBe(2);
    expect(row.lateResolution).toBe("WAIVED");
    expect(row.lateCharge?.toFixed(2)).toBe("0.00");
    expect(row.totalPrice.toFixed(2)).toBe("160.00");
    expect(row.lateWaiverReason).toBe(WAIVER);

    const waive = (await events(ids.waived)).find(
      (event) => event.action === "reservation.lateWaive"
    );
    expect(waive?.reason).toBe(WAIVER);
    // The free text lives in `reason`, which anonymisation scrubs — never
    // in the field values.
    expect(waive?.after).toEqual({ lateDays: 2, lateResolution: "WAIVED" });
  });

  it("asks nothing of an on-time return, and records nothing late", async () => {
    await giveBack(ids.onTime);
    const row = await prisma.reservation.findUniqueOrThrow({
      where: { id: ids.onTime },
    });
    expect(row.status).toBe("COMPLETED");
    expect(row.lateDays).toBeNull();
    expect(row.lateResolution).toBeNull();
    expect(row.lateCharge).toBeNull();
    expect(row.totalPrice.toFixed(2)).toBe("120.00");
    expect((await events(ids.onTime)).map((event) => event.action)).toEqual([
      "reservation.complete",
    ]);
  });
});

describe("a late return that fails", () => {
  it("rolls back whole: no completion, no inspection, no event", async () => {
    await prisma.reservation.update({
      where: { id: ids.rolledBack },
      data: {
        status: "ACTIVE",
        completedAt: null,
        lateDays: null,
        lateCharge: null,
        lateResolution: null,
        totalPrice: "133.32",
      },
    });
    await prisma.rentalInspection.deleteMany({
      where: { reservationId: ids.rolledBack },
    });
    const eventsBefore = (await events(ids.rolledBack)).length;

    // The dialog showed 2 days; the return is 3 days late.
    expect(
      await refusalKey(
        giveBack(ids.rolledBack, { resolution: "CHARGE", days: 2 })
      )
    ).toBe("err.lateDaysChanged");

    const [row, inspections, after] = await Promise.all([
      prisma.reservation.findUniqueOrThrow({ where: { id: ids.rolledBack } }),
      prisma.rentalInspection.count({
        where: { reservationId: ids.rolledBack },
      }),
      events(ids.rolledBack),
    ]);
    expect(row.status).toBe("ACTIVE");
    expect(row.totalPrice.toFixed(2)).toBe("133.32");
    expect(row.lateDays).toBeNull();
    expect(inspections).toBe(0);
    expect(after).toHaveLength(eventsBefore);
  });
});

describe("a late return that runs into the car's next booking", () => {
  it("is charged without moving the booked dates into the next one", async () => {
    await giveBack(ids.overlapping, { resolution: "CHARGE", days: 2 });

    const [row, next] = await Promise.all([
      prisma.reservation.findUniqueOrThrow({ where: { id: ids.overlapping } }),
      prisma.reservation.findUniqueOrThrow({ where: { id: ids.next } }),
    ]);
    expect(row.status).toBe("COMPLETED");
    expect(row.totalPrice.toFixed(2)).toBe("300.00");
    // Extending the return over the next pickup would have been refused by
    // reservations_no_overlap. The dates stay; the days are recorded.
    expect(row.returnDate).toEqual(at(-2));
    expect(row.lateDays).toBe(2);
    expect(next.status).toBe("CONFIRMED");
    expect(next.pickupDate).toEqual(at(-1));
  });

  it("stops counting as an overdue return once completed", async () => {
    // Every overdue figure reads ACTIVE rows; completing one removes it.
    const before = await getReservationInsights();
    await prisma.reservation.update({
      where: { id: ids.overlapping },
      data: { status: "ACTIVE" },
    });
    const during = await getReservationInsights();
    await prisma.reservation.update({
      where: { id: ids.overlapping },
      data: { status: "COMPLETED" },
    });
    expect(during.overdueReturns).toBe(before.overdueReturns + 1);
  });
});

describe("recording a past rental returned late", () => {
  const record = (id: string, input: Partial<PastRentalInput>, when = now) =>
    recordPastRental(
      id,
      actor,
      {
        startedOn: "",
        returnedOn: "",
        note: "Nobody pressed Start; no odometer readings.",
        confirmed: true,
        ...input,
      },
      when
    );

  it("settles the late days the same way", async () => {
    const dates = { startedOn: dayOf(at(-20)), returnedOn: dayOf(at(-13)) };
    expect(await refusalKey(record(ids.past, dates))).toBe(
      "err.lateReturnUnresolved"
    );

    await record(ids.past, {
      ...dates,
      lateReturn: { resolution: "CHARGE", days: 2 },
    });
    const row = await prisma.reservation.findUniqueOrThrow({
      where: { id: ids.past },
    });
    expect(row.status).toBe("COMPLETED");
    expect(row.lateDays).toBe(2);
    expect(row.lateCharge?.toFixed(2)).toBe("100.00");
    expect(row.totalPrice.toFixed(2)).toBe("400.00");
    expect(row.returnDate).toEqual(at(-15));
    expect((await events(ids.past)).map((event) => event.action)).toEqual([
      "reservation.recordPast",
      "reservation.lateCharge",
    ]);
  });
});

describe("the figures the owner reads", () => {
  it("count the charged late days in revenue, spend and earnings", async () => {
    const before = {
      spend: await getCustomerSpend(ids.customer),
      earned: (await getVehicleDetail(ids.cars[5]!)).costs.earned,
    };
    // Booked 28–31 Jan 2034 (4 days at 100), back on 2 Feb: 2 late days.
    await record2034();

    // The booked days keep the booked price; the late days carry the charge.
    const data = await getAnalytics("month", quietAt(2034, 2, 15));
    const value = (label: string) =>
      data.revenueByMonth.find((point) => point.label === label)?.value;
    expect(value("Jan")).toBe(400);
    expect(value("Feb")).toBe(200);
    expect(data.totalRevenue).toBe(600);

    expect(await getCustomerSpend(ids.customer)).toBe(before.spend + 600);
    expect((await getVehicleDetail(ids.cars[5]!)).costs.earned).toBe(
      before.earned + 600
    );
  });
});

function record2034() {
  return recordPastRental(
    ids.quiet,
    actor,
    {
      startedOn: "2034-01-28",
      returnedOn: "2034-02-02",
      note: "Nobody pressed Start; no odometer readings.",
      confirmed: true,
      lateReturn: { resolution: "CHARGE", days: 2 },
    },
    quietAt(2034, 3, 1)
  );
}
