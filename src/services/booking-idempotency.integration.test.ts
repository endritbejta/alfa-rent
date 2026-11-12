import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { IdempotencyKeyReusedError } from "@/lib/errors";
import { verifyPaymentAccessToken } from "@/lib/payments/access-token";
import {
  createManualReservation,
  createReservation,
} from "@/services/reservation.service";

/**
 * A booking that commits after the browser has given up on it — the form
 * aborts at 20 seconds — used to become two PENDING requests the moment the
 * customer pressed Send again. These pin the server half of the fix: a retry
 * with the same key gets the first reservation back, concurrent retries
 * still make exactly one, and a key cannot be borrowed for another booking —
 * other dates, or the same dates with another name or phone.
 */
const suffix = randomUUID().slice(0, 8);
const vehicleId = `idem-vehicle-${suffix}`;
const email = `idempotency-${suffix}@example.test`;
const staffCustomerId = `idem-customer-${suffix}`;

// Far enough ahead to be valid for as long as this test suite lives.
const pickupDate = new Date("2027-09-01T10:00:00.000Z");
const returnDate = new Date("2027-09-04T10:00:00.000Z");

const booking = (overrides: Partial<{ pickupDate: Date }> = {}) => ({
  vehicleId,
  pickupDate,
  returnDate,
  customer: {
    firstName: "Retry",
    lastName: "Tester",
    email,
    phone: "+383 44 000 000",
  },
  ...overrides,
});

beforeAll(async () => {
  await prisma.vehicle.create({
    data: {
      id: vehicleId,
      slug: `idempotency-car-${suffix}`,
      plate: `IDM-${suffix}`.toUpperCase(),
      brand: "Test",
      model: "Idempotency",
      year: 2027,
      category: "SEDAN",
      transmission: "AUTOMATIC",
      fuelType: "PETROL",
      seats: 5,
      pricePerDay: 40,
      description: "Integration-test vehicle for idempotent bookings.",
    },
  });
  await prisma.customer.create({
    data: {
      id: staffCustomerId,
      firstName: "Staff",
      lastName: "Booked",
      email: `idempotency-staff-${suffix}@example.test`,
      phone: "-",
    },
  });
});

afterAll(async () => {
  await prisma.reservation.deleteMany({ where: { vehicleId } });
  await prisma.vehicle.deleteMany({ where: { id: vehicleId } });
  await prisma.customer.deleteMany({
    where: { OR: [{ email }, { id: staffCustomerId }] },
  });
  await prisma.$disconnect();
});

describe("public booking with an idempotency key", () => {
  it("returns the first reservation to a retry instead of making another", async () => {
    const key = randomUUID();
    const first = await createReservation(booking(), { idempotencyKey: key });
    const retry = await createReservation(booking(), { idempotencyKey: key });

    expect(first.replayed).toBe(false);
    expect(retry.replayed).toBe(true);
    expect(retry.reservation.id).toBe(first.reservation.id);
    expect(
      await prisma.reservation.count({ where: { idempotencyKey: key } })
    ).toBe(1);

    // The token in the lost response is gone; the one the retry carries works.
    const stored = await prisma.reservation.findUniqueOrThrow({
      where: { id: first.reservation.id },
      select: { paymentAccessTokenHash: true },
    });
    expect(
      verifyPaymentAccessToken(
        retry.paymentAccessToken,
        stored.paymentAccessTokenHash!
      )
    ).toBe(true);
    expect(
      verifyPaymentAccessToken(
        first.paymentAccessToken,
        stored.paymentAccessTokenHash!
      )
    ).toBe(false);
  });

  it("makes exactly one reservation when retries arrive together", async () => {
    const key = randomUUID();
    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        createReservation(booking(), { idempotencyKey: key })
      )
    );

    expect(new Set(results.map((r) => r.reservation.id)).size).toBe(1);
    expect(results.filter((r) => !r.replayed)).toHaveLength(1);
    expect(
      await prisma.reservation.count({ where: { idempotencyKey: key } })
    ).toBe(1);
  });

  it("refuses a key reused for a different booking", async () => {
    const key = randomUUID();
    await createReservation(booking(), { idempotencyKey: key });

    await expect(
      createReservation(
        booking({ pickupDate: new Date("2027-09-02T10:00:00.000Z") }),
        { idempotencyKey: key }
      )
    ).rejects.toBeInstanceOf(IdempotencyKeyReusedError);
  });

  it("refuses a key reused with different contact details", async () => {
    const key = randomUUID();
    await createReservation(booking(), { idempotencyKey: key });
    const base = booking();

    await expect(
      createReservation(
        { ...base, customer: { ...base.customer, phone: "+383 44 999 999" } },
        { idempotencyKey: key }
      )
    ).rejects.toBeInstanceOf(IdempotencyKeyReusedError);
    await expect(
      createReservation(
        { ...base, customer: { ...base.customer, firstName: "Someone" } },
        { idempotencyKey: key }
      )
    ).rejects.toBeInstanceOf(IdempotencyKeyReusedError);
    await expect(
      createReservation(
        { ...base, customer: { ...base.customer, lastName: "Else" } },
        { idempotencyKey: key }
      )
    ).rejects.toBeInstanceOf(IdempotencyKeyReusedError);
    expect(
      await prisma.reservation.count({ where: { idempotencyKey: key } })
    ).toBe(1);
  });

  it("still makes a new reservation for every request without a key", async () => {
    const before = await prisma.reservation.count({ where: { vehicleId } });
    await createReservation(booking());
    await createReservation(booking());
    expect(await prisma.reservation.count({ where: { vehicleId } })).toBe(
      before + 2
    );
  });
});

describe("staff booking with an idempotency key", () => {
  /**
   * The case the key matters most for: a CONFIRMED retry used to be refused
   * by the exclusion constraint as a double-booking of itself.
   */
  it("returns the confirmed reservation to a retry rather than calling it a clash", async () => {
    const key = randomUUID();
    const input = {
      vehicleId,
      customer: { kind: "existing" as const, id: staffCustomerId },
      pickupDate: new Date("2027-10-01T10:00:00.000Z"),
      returnDate: new Date("2027-10-03T10:00:00.000Z"),
      status: "CONFIRMED" as const,
      idempotencyKey: key,
    };

    const first = await createManualReservation(input);
    const retry = await createManualReservation(input);

    expect(retry.id).toBe(first.id);
    expect(
      await prisma.reservation.count({ where: { idempotencyKey: key } })
    ).toBe(1);
  });
});
