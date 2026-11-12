import { randomUUID } from "node:crypto";
import { Prisma, PrismaClient, type ReservationStatus } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { AppError, ConflictError, normalizeError } from "@/lib/errors";
import { extendReservation } from "@/services/reservation.service";

/**
 * extendReservation's write path. reservation-extension.integration.test.ts
 * covers why an extension is refused as the drawer reads it; this covers what
 * the write itself does: the money it adds, the compare-and-swap that keeps
 * two staff from extending one rental twice, and the refusal when the longer
 * rental would run into another commitment, down to the exclusion constraint
 * that has the final word when the advisory check is raced.
 *
 * The races are made deterministic rather than hoped for: a second
 * connection holds the conflicting change open, the test waits until the
 * extension is visibly blocked on it in pg_stat_activity, and only then lets
 * it commit.
 */
const suffix = randomUUID().slice(0, 8);
const customerId = `extw-customer-${suffix}`;
const vehicleId = `extw-vehicle-${suffix}`;

/** A second client, so a transaction can be held open beside the service's. */
const other = new PrismaClient();

const D = (value: string | number) => new Prisma.Decimal(value);

// Far enough ahead to stay valid for as long as this suite lives.
const pickupDate = new Date("2028-01-10T09:30:00.000Z");
const returnDate = new Date("2028-01-14T09:30:00.000Z");
/** What the customer agreed to for the first four days, discount and all. */
const agreedTotal = "157.35";
/** Today's rate, which is not the rate the agreed days were priced at. */
const pricePerDay = "33.37";

async function rental(
  overrides: Partial<{
    status: ReservationStatus;
    pickupDate: Date;
    returnDate: Date;
    totalPrice: string;
  }> = {}
) {
  return prisma.reservation.create({
    data: {
      vehicleId,
      customerId,
      status: "CONFIRMED",
      pickupDate,
      returnDate,
      totalPrice: agreedTotal,
      ...overrides,
    },
  });
}

/** The error's translation key, which is what the drawer acts on. */
async function refusalKey(run: Promise<unknown>) {
  try {
    await run;
  } catch (error) {
    return error instanceof AppError ? error.text?.key : String(error);
  }
  throw new Error("expected the extension to be refused");
}

/**
 * Resolves once some backend in this database is waiting on a lock, which is
 * the extension's UPDATE queued behind the transaction the test holds open.
 */
async function blockedOnALock() {
  for (let i = 0; i < 200; i++) {
    const [row] = await prisma.$queryRaw<{ waiting: bigint }[]>`
      SELECT count(*) AS waiting FROM pg_stat_activity
      WHERE datname = current_database()
        AND wait_event_type = 'Lock'
        AND pid <> pg_backend_pid()
    `;
    if (row!.waiting > BigInt(0)) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("the extension never blocked on the held transaction");
}

/**
 * Runs `change` in a transaction on the second connection, starts the
 * extension while that transaction is still open, waits for the extension to
 * block on it, then commits. Returns the extension's outcome.
 */
async function extendWhileHeld(
  change: (tx: Prisma.TransactionClient) => Promise<unknown>,
  id: string,
  to: Date
) {
  let extension!: Promise<unknown>;
  await other.$transaction(
    async (tx) => {
      await change(tx);
      extension = extendReservation(id, to);
      // Keep the rejection from being reported as unhandled while it waits.
      extension.catch(() => {});
      await blockedOnALock();
    },
    { timeout: 15_000 }
  );
  return extension;
}

beforeAll(async () => {
  await prisma.customer.create({
    data: {
      id: customerId,
      firstName: "Extend",
      lastName: "Writer",
      email: `extw-${suffix}@example.test`,
      phone: "-",
    },
  });
  await prisma.vehicle.create({
    data: {
      id: vehicleId,
      slug: vehicleId,
      brand: "Test",
      model: "Extend Writes",
      year: 2028,
      category: "SEDAN",
      transmission: "AUTOMATIC",
      fuelType: "PETROL",
      seats: 5,
      pricePerDay,
      description: "Integration-test vehicle for extension writes.",
    },
  });
});

beforeEach(async () => {
  await prisma.reservation.deleteMany({ where: { vehicleId } });
});

afterAll(async () => {
  await prisma.reservation.deleteMany({ where: { vehicleId } });
  await prisma.vehicle.deleteMany({ where: { id: vehicleId } });
  await prisma.customer.deleteMany({ where: { id: customerId } });
  await other.$disconnect();
  await prisma.$disconnect();
});

describe("the price of an extension", () => {
  it("keeps the agreed total and adds only the extra days at today's rate", async () => {
    const { id } = await rental();
    // Midnight on the 17th: the time of day is taken from the booking.
    const extended = await extendReservation(
      id,
      new Date("2028-01-17T00:00:00.000Z")
    );

    expect(extended.returnDate.toISOString()).toBe("2028-01-17T09:30:00.000Z");
    // Decimal arithmetic, compared as Decimal: 157.35 + 3 × 33.37. In
    // floating point the same sum is 257.46000000000004.
    const expected = D(agreedTotal).add(D(pricePerDay).mul(3));
    expect(expected.toFixed(2)).toBe("257.46");
    expect(extended.totalPrice).toBeInstanceOf(Prisma.Decimal);
    expect(extended.totalPrice.equals(expected)).toBe(true);

    const stored = await prisma.reservation.findUniqueOrThrow({
      where: { id },
    });
    expect(stored.totalPrice.toFixed(2)).toBe("257.46");
  });

  it("charges a started day as a whole day", async () => {
    // A rental picked up at 18:00 and returned at 10:00 is billed by started
    // days, so moving the return two calendar days on adds two days.
    const { id } = await rental({
      status: "ACTIVE",
      pickupDate: new Date("2028-02-01T18:00:00.000Z"),
      returnDate: new Date("2028-02-03T10:00:00.000Z"),
      totalPrice: "66.74",
    });
    const extended = await extendReservation(
      id,
      new Date("2028-02-05T00:00:00.000Z")
    );
    expect(extended.returnDate.toISOString()).toBe("2028-02-05T10:00:00.000Z");
    expect(
      extended.totalPrice.equals(D("66.74").add(D(pricePerDay).mul(2)))
    ).toBe(true);
  });

  it("extends twice in a row without re-pricing the first extension", async () => {
    const { id } = await rental();
    await extendReservation(id, new Date("2028-01-15T00:00:00.000Z"));
    const second = await extendReservation(
      id,
      new Date("2028-01-16T00:00:00.000Z")
    );
    expect(
      second.totalPrice.equals(D(agreedTotal).add(D(pricePerDay).mul(2)))
    ).toBe(true);
  });

  it("refuses a date that is not later than the current return, and writes nothing", async () => {
    const { id } = await rental();
    expect(
      await refusalKey(
        extendReservation(id, new Date("2028-01-14T00:00:00.000Z"))
      )
    ).toBe("err.returnMustBeLater");
    const stored = await prisma.reservation.findUniqueOrThrow({
      where: { id },
    });
    expect(stored.returnDate).toEqual(returnDate);
    expect(stored.totalPrice.toFixed(2)).toBe(agreedTotal);
  });
});

describe("the compare-and-swap", () => {
  it("lets exactly one of two simultaneous extensions through", async () => {
    const { id } = await rental();
    const to = new Date("2028-01-16T00:00:00.000Z");
    const results = await Promise.allSettled([
      extendReservation(id, to),
      extendReservation(id, to),
    ]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const [loser] = results.filter((r) => r.status === "rejected");
    // Which refusal depends only on when the loser read the row: before the
    // winner committed (the swap finds the row changed) or after (the date
    // is no longer later). Either way, never a second charge.
    expect((loser as PromiseRejectedResult).reason?.text?.key).toBeOneOf([
      "err.changedUnderYou",
      "err.returnMustBeLater",
    ]);

    const stored = await prisma.reservation.findUniqueOrThrow({
      where: { id },
    });
    expect(
      stored.totalPrice.equals(D(agreedTotal).add(D(pricePerDay).mul(2)))
    ).toBe(true);
  });

  it.each([
    [
      "its return date was moved",
      { returnDate: new Date("2028-01-15T09:30:00.000Z") },
    ],
    ["it was completed", { status: "COMPLETED" as const }],
  ])(
    "refuses with err.changedUnderYou when, mid-extension, %s",
    async (_what, data) => {
      const { id } = await rental();
      const outcome = extendWhileHeld(
        (tx) => tx.reservation.update({ where: { id }, data }),
        id,
        new Date("2028-01-20T00:00:00.000Z")
      );
      expect(await refusalKey(outcome)).toBe("err.changedUnderYou");

      // The other writer's change stands, and nothing was charged on top.
      const stored = await prisma.reservation.findUniqueOrThrow({
        where: { id },
      });
      expect(stored).toMatchObject(data);
      expect(stored.totalPrice.toFixed(2)).toBe(agreedTotal);
    }
  );
});

describe("running into another commitment", () => {
  const followerFrom = new Date("2028-01-18T09:00:00.000Z");
  const follower = (status: ReservationStatus) =>
    rental({
      status,
      pickupDate: followerFrom,
      returnDate: new Date("2028-01-21T09:00:00.000Z"),
      totalPrice: "100.11",
    });

  it.each(["CONFIRMED", "ACTIVE"] as const)(
    "refuses to extend into a %s reservation, naming when it starts",
    async (status) => {
      const { id } = await rental();
      await follower(status);

      let caught: unknown;
      try {
        await extendReservation(id, new Date("2028-01-19T00:00:00.000Z"));
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(ConflictError);
      expect((caught as ConflictError).text).toMatchObject({
        key: "err.bookedAgainFrom",
        values: { from: "18 Jan 2028" },
      });

      const stored = await prisma.reservation.findUniqueOrThrow({
        where: { id },
      });
      expect(stored.returnDate).toEqual(returnDate);
      expect(stored.totalPrice.toFixed(2)).toBe(agreedTotal);
    }
  );

  it("extends right up to the next pickup", async () => {
    const { id } = await rental();
    await follower("CONFIRMED");
    // Returned 09:30 on the 17th; the next customer collects on the 18th.
    await expect(
      extendReservation(id, new Date("2028-01-17T00:00:00.000Z"))
    ).resolves.toMatchObject({
      returnDate: new Date("2028-01-17T09:30:00.000Z"),
    });
  });

  it("is not blocked by a PENDING request, which is not a commitment", async () => {
    const { id } = await rental();
    await follower("PENDING");
    await expect(
      extendReservation(id, new Date("2028-01-19T00:00:00.000Z"))
    ).resolves.toMatchObject({
      returnDate: new Date("2028-01-19T09:30:00.000Z"),
    });
  });

  it("is refused by reservations_no_overlap when a clash commits after the check", async () => {
    const { id } = await rental();
    // The clashing booking is written but not yet committed, so the
    // extension's advisory check cannot see it; its UPDATE then waits on
    // the exclusion constraint, and fails once the booking commits.
    const outcome = extendWhileHeld(
      (tx) =>
        tx.reservation.create({
          data: {
            vehicleId,
            customerId,
            status: "CONFIRMED",
            pickupDate: followerFrom,
            returnDate: new Date("2028-01-21T09:00:00.000Z"),
            totalPrice: "100.11",
          },
        }),
      id,
      new Date("2028-01-19T00:00:00.000Z")
    );

    let caught: unknown;
    try {
      await outcome;
    } catch (error) {
      caught = error;
    }
    expect((caught as Error).message).toContain("reservations_no_overlap");
    // And the staff member reads a 409, not "An unexpected error occurred".
    expect(normalizeError(caught)).toMatchObject({ status: 409 });

    const stored = await prisma.reservation.findUniqueOrThrow({
      where: { id },
    });
    expect(stored.returnDate).toEqual(returnDate);
    expect(stored.totalPrice.toFixed(2)).toBe(agreedTotal);
  });
});
