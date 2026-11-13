import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { AppError } from "@/lib/errors";
import { businessDay } from "@/lib/business-time";
import { createTestActor, removeTestActor } from "@/lib/testing/audit";
import {
  earlyReturnSchema,
  type EarlyReturnInput,
  type RentalInspectionInput,
} from "@/lib/validations/inspection";
import { getAnalytics } from "@/services/analytics.service";
import { getCustomerSpend } from "@/services/customer.service";
import { getVehicleDetail } from "@/services/fleet.service";
import {
  recordPastRental,
  recordRentalInspection,
} from "@/services/inspection.service";
import { getReservationDetail } from "@/services/reservation.service";

/**
 * Early returns. A car booked 13 → 16 Nov that came back on the 13th used
 * to close at the full booked total, with no way to bill the day it was
 * actually out. Now staff choose: the days used, at the rate the booking
 * was agreed at, or the full booking. The original amount, the days used
 * and the choice are all kept, and every money figure reads what was
 * charged.
 */
const suffix = randomUUID().slice(0, 8);
const ids = {
  customer: `early-customer-${suffix}`,
  cars: [1, 2, 3, 4, 5, 6, 7].map((n) => `early-car${n}-${suffix}`),
  actual: `early-actual-${suffix}`,
  full: `early-full-${suffix}`,
  onTime: `early-ontime-${suffix}`,
  sameDay: `early-sameday-${suffix}`,
  historical: `early-history-${suffix}`,
  quietActual: `early-quiet-actual-${suffix}`,
  quietFull: `early-quiet-full-${suffix}`,
};
let actor = "";

const DAY = 24 * 60 * 60 * 1000;
const now = new Date();
const today = businessDay(now);
const at = (days: number) =>
  new Date(new Date(`${today}T10:00:00.000Z`).getTime() + days * DAY);
const quietAt = (y: number, m: number, d: number) =>
  new Date(Date.UTC(y, m - 1, d, 10));

const giveBack = (
  id: string,
  earlyReturn?: EarlyReturnInput,
  extra: Partial<RentalInspectionInput> = {}
) =>
  recordRentalInspection(
    id,
    actor,
    {
      type: "RETURN",
      mileage: 12_000,
      fuelLevel: 80,
      damageFound: false,
      signerName: "Early Customer",
      customerAcknowledged: true,
      photos: [],
      earlyReturn,
      ...extra,
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

const row = (id: string) =>
  prisma.reservation.findUniqueOrThrow({ where: { id } });

function car(id: string, pricePerDay: number) {
  return {
    id,
    slug: `${id}-slug`,
    plate: id.toUpperCase().slice(0, 15),
    brand: "Test",
    model: "EarlyReturn",
    year: 2026,
    category: "ECONOMY" as const,
    transmission: "MANUAL" as const,
    fuelType: "PETROL" as const,
    seats: 5,
    pricePerDay,
    status: "RENTED" as const,
    description: "Integration-test vehicle for early returns.",
  };
}

beforeAll(async () => {
  actor = await createTestActor(`early-${suffix}`);
  await prisma.customer.create({
    data: {
      id: ids.customer,
      firstName: "Early",
      lastName: "Customer",
      email: `early-${suffix}@example.test`,
      phone: "-",
    },
  });
  const [c1, c2, c3, c4, c5, c6, c7] = ids.cars;
  await prisma.vehicle.createMany({
    data: [
      // Rates today differ from the agreed 26 on purpose: neither the car's
      // rate now nor total ÷ days is what an early return is billed at.
      car(c1, 30),
      car(c2, 30),
      car(c3, 26),
      car(c4, 26),
      { ...car(c5, 26), status: "AVAILABLE" as const },
      { ...car(c6, 10), status: "AVAILABLE" as const },
      { ...car(c7, 10), status: "AVAILABLE" as const },
    ],
  });
  const booking = (
    id: string,
    vehicleId: string,
    from: Date,
    to: Date,
    totalPrice: number,
    dailyRate: number,
    status: "CONFIRMED" | "ACTIVE" | "COMPLETED" = "ACTIVE"
  ) => ({
    id,
    vehicleId,
    customerId: ids.customer,
    pickupDate: from,
    returnDate: to,
    status,
    totalPrice,
    dailyRate,
    ...(status !== "CONFIRMED" && { startedAt: from }),
  });
  await prisma.reservation.createMany({
    data: [
      // The owner's Kia Rio: picked up today, due back in three days, 78 EUR
      // — priced on the old exclusive count, 3 days at 26. Four inclusive
      // days, so total ÷ days would say 19.50 a day.
      booking(ids.actual, c1, at(0), at(3), 78, 26),
      booking(ids.full, c2, at(0), at(3), 78, 26),
      // Due back today: 4 inclusive days at 26.
      booking(ids.onTime, c3, at(-3), at(0), 104, 26),
      // Out and back the same day.
      booking(ids.sameDay, c4, at(0), at(0), 26, 26),
      // Completed before any of this existed: no bookedTotal, no days.
      {
        ...booking(ids.historical, c5, at(-30), at(-27), 120, 30, "COMPLETED"),
        completedAt: at(-27),
      },
      // 2037, where nothing else lives, for the revenue figures.
      booking(
        ids.quietActual,
        c6,
        quietAt(2037, 1, 28),
        quietAt(2037, 2, 3),
        70,
        10,
        "CONFIRMED"
      ),
      booking(
        ids.quietFull,
        c7,
        quietAt(2037, 1, 30),
        quietAt(2037, 2, 2),
        40,
        10,
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

describe("returning a car before its return day", () => {
  it("asks how to bill it: an early return cannot just close", async () => {
    expect(await refusalKey(giveBack(ids.actual))).toBe(
      "err.earlyReturnUnresolved"
    );
    const r = await row(ids.actual);
    expect(r.status).toBe("ACTIVE");
    expect(r.earlyReturnBilling).toBeNull();
  });

  it("refuses to bill a day count other than the one shown", async () => {
    expect(
      await refusalKey(
        giveBack(ids.actual, { billing: "ACTUAL_DAYS", days: 2 })
      )
    ).toBe("err.earlyDaysChanged");
    expect((await row(ids.actual)).status).toBe("ACTIVE");
  });

  it("scenario 1: bills the days used at the agreed rate (26, not 78)", async () => {
    await giveBack(ids.actual, { billing: "ACTUAL_DAYS", days: 1 });
    const r = await row(ids.actual);
    expect(r.status).toBe("COMPLETED");
    expect(r.totalPrice.toFixed(2)).toBe("26.00");
    // The original is kept beside what was charged.
    expect(r.bookedTotal?.toFixed(2)).toBe("78.00");
    expect(r.actualDays).toBe(1);
    expect(r.earlyReturnBilling).toBe("ACTUAL_DAYS");
    expect(r.completedAt).not.toBeNull();
    // The booked dates never move.
    expect(r.returnDate.toISOString()).toBe(at(3).toISOString());
    expect(r.lateDays).toBeNull();

    const events = await prisma.auditEvent.findMany({
      where: { entityId: ids.actual },
      orderBy: { createdAt: "asc" },
    });
    expect(events.map((e) => e.action)).toEqual([
      "reservation.complete",
      "reservation.earlyReturn",
    ]);
    expect(events[1]?.after).toMatchObject({
      earlyReturnBilling: "ACTUAL_DAYS",
      actualDays: 1,
      bookedDays: 4,
      dailyRate: "26.00",
      bookedTotal: "78.00",
      totalPrice: "26.00",
    });
  });

  it("cannot be completed — or billed — twice", async () => {
    const second = await refusalKey(
      giveBack(ids.actual, { billing: "ACTUAL_DAYS", days: 1 })
    );
    expect(second).toBe("err.notInspectable");
    const r = await row(ids.actual);
    expect(r.totalPrice.toFixed(2)).toBe("26.00");
    expect(r.bookedTotal?.toFixed(2)).toBe("78.00");
    expect(
      await prisma.auditEvent.count({
        where: { entityId: ids.actual, action: "reservation.earlyReturn" },
      })
    ).toBe(1);
  });

  it("scenario 2: keeps the full booking when staff choose it", async () => {
    await giveBack(ids.full, { billing: "FULL_BOOKING" });
    const r = await row(ids.full);
    expect(r.status).toBe("COMPLETED");
    expect(r.totalPrice.toFixed(2)).toBe("78.00");
    expect(r.bookedTotal?.toFixed(2)).toBe("78.00");
    expect(r.actualDays).toBe(1);
    expect(r.earlyReturnBilling).toBe("FULL_BOOKING");
  });

  it("validates the choice at the boundary", () => {
    expect(
      earlyReturnSchema.safeParse({ billing: "ACTUAL_DAYS" }).success
    ).toBe(false);
    expect(earlyReturnSchema.safeParse({ billing: "HALF_PRICE" }).success).toBe(
      false
    );
    expect(
      earlyReturnSchema.safeParse({ billing: "ACTUAL_DAYS", days: "1" }).data
    ).toEqual({ billing: "ACTUAL_DAYS", days: 1 });
  });
});

describe("returns that are not early", () => {
  it("scenario 3: an on-time return keeps the booked price and asks nothing", async () => {
    // A stray choice is ignored rather than applied.
    await giveBack(ids.onTime, { billing: "ACTUAL_DAYS", days: 1 });
    const r = await row(ids.onTime);
    expect(r.status).toBe("COMPLETED");
    expect(r.totalPrice.toFixed(2)).toBe("104.00");
    expect(r.bookedTotal?.toFixed(2)).toBe("104.00");
    expect(r.actualDays).toBe(4);
    expect(r.earlyReturnBilling).toBeNull();
  });

  it("scenario 4: a same-day rental is one day, and never early", async () => {
    await giveBack(ids.sameDay);
    const r = await row(ids.sameDay);
    expect(r.status).toBe("COMPLETED");
    expect(r.totalPrice.toFixed(2)).toBe("26.00");
    expect(r.actualDays).toBe(1);
    expect(r.earlyReturnBilling).toBeNull();
  });
});

describe("history", () => {
  it("scenario 5: a rental completed before this keeps its amount", async () => {
    const detail = await getReservationDetail(ids.historical);
    expect(detail.totalPrice.toFixed(2)).toBe("120.00");
    expect(detail.earlyReturnBilling).toBeNull();
    expect(detail.actualDays).toBeNull();
  });

  it("scenario 5: the backfill gave every earlier completed rental its original amount", async () => {
    // Whatever this database held when the migration ran: every completed
    // row from before it has bookedTotal = what it was billed less any late
    // charge, and no early-return billing was invented for it.
    const [{ wrong }] = await prisma.$queryRaw<{ wrong: number }[]>`
      SELECT count(*)::int AS wrong
      FROM reservations r
      WHERE r.status = 'COMPLETED'
        AND r."createdAt" < (
          SELECT finished_at AT TIME ZONE 'UTC' FROM "_prisma_migrations"
          WHERE migration_name = '20261117130000_early_return_billing'
        )
        AND (
          r."bookedTotal" IS DISTINCT FROM r."totalPrice" - COALESCE(r."lateCharge", 0)
          OR r."earlyReturnBilling" IS NOT NULL
        )
    `;
    expect(wrong).toBe(0);
  });
});

describe("money figures", () => {
  it("scenario 6: revenue, spend and earnings read the amount billed", async () => {
    const before = {
      spend: await getCustomerSpend(ids.customer),
      actual: (await getVehicleDetail(ids.cars[5]!)).costs.earned,
      full: (await getVehicleDetail(ids.cars[6]!)).costs.earned,
    };
    const record = (
      id: string,
      startedOn: string,
      returnedOn: string,
      earlyReturn: EarlyReturnInput
    ) =>
      recordPastRental(
        id,
        actor,
        {
          startedOn,
          returnedOn,
          note: "Nobody pressed Start; recorded afterwards.",
          confirmed: true,
          earlyReturn,
        },
        quietAt(2037, 3, 1)
      );

    // The past-rental path asks the same question.
    expect(
      await refusalKey(
        recordPastRental(
          ids.quietActual,
          actor,
          {
            startedOn: "2037-01-28",
            returnedOn: "2037-01-29",
            note: "Nobody pressed Start; recorded afterwards.",
            confirmed: true,
          },
          quietAt(2037, 3, 1)
        )
      )
    ).toBe("err.earlyReturnUnresolved");

    // 28 Jan → 3 Feb, 70 at 10/day, back on the 29th: 2 days, 20.
    await record(ids.quietActual, "2037-01-28", "2037-01-29", {
      billing: "ACTUAL_DAYS",
      days: 2,
    });
    // 30 Jan → 2 Feb, 40, back on the 30th, billed in full.
    await record(ids.quietFull, "2037-01-30", "2037-01-30", {
      billing: "FULL_BOOKING",
    });

    const actual = await row(ids.quietActual);
    expect(actual.totalPrice.toFixed(2)).toBe("20.00");
    expect(actual.bookedTotal?.toFixed(2)).toBe("70.00");

    // Days used carry what was charged for them (28, 29 Jan); a full
    // booking stays spread over its booked days (30, 31 Jan, 1, 2 Feb).
    const data = await getAnalytics("month", quietAt(2037, 2, 15));
    const value = (label: string) =>
      data.revenueByMonth.find((point) => point.label === label)?.value;
    expect(value("Jan")).toBe(40);
    expect(value("Feb")).toBe(20);
    expect(data.totalRevenue).toBe(60);

    expect(await getCustomerSpend(ids.customer)).toBe(before.spend + 60);
    expect((await getVehicleDetail(ids.cars[5]!)).costs.earned).toBe(
      before.actual + 20
    );
    expect((await getVehicleDetail(ids.cars[6]!)).costs.earned).toBe(
      before.full + 40
    );
  });
});
