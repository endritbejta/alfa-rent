import { randomUUID } from "node:crypto";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { NextRequest } from "next/server";

/*
 * POST /api/bookings, through the route handler itself.
 *
 * The service underneath has its own idempotency and concurrency tests; what
 * those cannot see is everything the handler adds on top: the limiter and its
 * Retry-After, the Idempotency-Key header parsing, the replay header, and the
 * shape of the body a stranger on the internet gets back. A service-level
 * test passed once while the page in front of it was broken (AGENTS.md,
 * "Verify through the page"), so these go through POST() with a real
 * request, the real limiter and the real database.
 *
 * Only after() and the two notifications stand in: after() needs a live
 * request scope to schedule work in, and no mail should leave a test run.
 */
const { notifyStaffOfBookingRequest, notifyCustomer } = vi.hoisted(() => ({
  notifyStaffOfBookingRequest: vi.fn(),
  notifyCustomer: vi.fn(),
}));

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (task: () => unknown) => task(),
}));
vi.mock("@/services/notification.service", () => ({
  notifyStaffOfBookingRequest,
}));
vi.mock("@/services/customer-notification.service", () => ({
  notifyCustomer,
}));

import { prisma } from "@/lib/db/prisma";
import { verifyPaymentAccessToken } from "@/lib/payments/access-token";
import { normalizeIp } from "@/lib/rate-limit";
import { createManualReservation } from "@/services/reservation.service";
import { createTestActor, removeTestActor } from "@/lib/testing/audit";
import { POST } from "./route";

const suffix = randomUUID().slice(0, 8);
const vehicleId = `route-vehicle-${suffix}`;
const email = `route-${suffix}@example.test`;
/**
 * Each test gets its own client address, so its own limiter bucket: an IPv6
 * /64 of this run's own, since the limiter keys IPv6 by /64 and a malformed
 * address shares the one "unknown" bucket.
 */
const runPrefix = `2001:${suffix.slice(0, 4)}:${suffix.slice(4, 8)}`;
let ip: string;
let ipCounter = 0;
const bucket = (address = ip) => `bookings:${normalizeIp(address)}`;
const runBuckets = `bookings:${normalizeIp(`${runPrefix}::1`)!.split(":").slice(0, 3).join(":")}:`;

const booking = {
  vehicleId,
  // Far enough ahead to stay valid for as long as this suite lives.
  pickupDate: "2027-10-01T10:00:00.000Z",
  returnDate: "2027-10-04T10:00:00.000Z",
  customer: {
    firstName: "Route",
    lastName: "Tester",
    email,
    phone: "+383 44 000 001",
  },
};

function post(
  headers: Record<string, string> = {},
  body: unknown = booking
): NextRequest {
  return new NextRequest("http://localhost/api/bookings", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": ip,
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

/**
 * Spends part of this test's allowance. Written through Prisma like any
 * other DateTime: the limiter keeps "expiresAt" in UTC whatever the
 * session's time zone (see rate-limit.ts), so no offset is needed — the
 * local Homebrew Postgres runs in Europe/Belgrade and this used to need one.
 */
async function spendAllowance(count: number, minutesLeft: number) {
  await prisma.rateLimit.create({
    data: {
      key: bucket(),
      count,
      expiresAt: new Date(Date.now() + minutesLeft * 60_000),
    },
  });
}

const reservationsWritten = () =>
  prisma.reservation.count({ where: { vehicleId } });

beforeAll(async () => {
  await prisma.vehicle.create({
    data: {
      id: vehicleId,
      slug: `route-car-${suffix}`,
      plate: `RTE-${suffix}`.toUpperCase(),
      brand: "Test",
      model: "Route",
      year: 2027,
      category: "SEDAN",
      transmission: "AUTOMATIC",
      fuelType: "PETROL",
      seats: 5,
      pricePerDay: 40,
      description: "Integration-test vehicle for the bookings route.",
    },
  });
});

beforeEach(async () => {
  ip = `${runPrefix}:${(++ipCounter).toString(16)}::1`;
  notifyStaffOfBookingRequest.mockClear();
  notifyCustomer.mockClear();
  // Each test counts its own writes from zero.
  await prisma.reservation.deleteMany({ where: { vehicleId } });
});

afterAll(async () => {
  await prisma.reservation.deleteMany({ where: { vehicleId } });
  await prisma.vehicle.deleteMany({ where: { id: vehicleId } });
  await prisma.customer.deleteMany({ where: { email } });
  await prisma.customer.deleteMany({
    where: { email: { startsWith: `cap-${suffix}-` } },
  });
  await prisma.rateLimit.deleteMany({
    where: { key: { startsWith: runBuckets } },
  });
  await prisma.$disconnect();
});

describe("POST /api/bookings", () => {
  it("creates a booking and answers with exactly the documented fields", async () => {
    const response = await POST(post());
    expect(response.status).toBe(201);
    expect(response.headers.get("Idempotent-Replayed")).toBeNull();

    const body = await response.json();
    // The exact key set, not toMatchObject: this is an unauthenticated
    // endpoint, and anything added to it is published to the world. The
    // customer id, the vehicle's costs and the stored contact details must
    // never ride along.
    expect(Object.keys(body).sort()).toEqual(["data", "success"]);
    expect(Object.keys(body.data).sort()).toEqual([
      "id",
      "paymentAccessToken",
      "status",
      "totalPrice",
    ]);
    expect(body.success).toBe(true);
    expect(body.data.status).toBe("PENDING");
    // A number, not a Decimal's string form or object.
    expect(typeof body.data.totalPrice).toBe("number");
    expect(typeof body.data.paymentAccessToken).toBe("string");

    const stored = await prisma.reservation.findUniqueOrThrow({
      where: { id: body.data.id },
    });
    expect(Number(stored.totalPrice)).toBe(body.data.totalPrice);
    expect(notifyStaffOfBookingRequest).toHaveBeenCalledWith(body.data.id);
    expect(notifyCustomer).toHaveBeenCalledExactlyOnceWith(
      body.data.id,
      "received"
    );
  });

  it("charges both the pickup and the return day: 25 → 26 at 53/day is 106", async () => {
    await prisma.vehicle.update({
      where: { id: vehicleId },
      data: { pricePerDay: 53 },
    });
    try {
      const response = await POST(
        post(
          {},
          {
            ...booking,
            pickupDate: "2027-11-25T10:00:00.000Z",
            returnDate: "2027-11-26T10:00:00.000Z",
          }
        )
      );
      expect(response.status).toBe(201);
      const body = await response.json();
      expect(body.data.totalPrice).toBe(106);
      const stored = await prisma.reservation.findUniqueOrThrow({
        where: { id: body.data.id },
      });
      expect(stored.totalPrice.toFixed(2)).toBe("106.00");
    } finally {
      await prisma.vehicle.update({
        where: { id: vehicleId },
        data: { pricePerDay: 40 },
      });
    }
  });

  it("accepts a same-day return as one day", async () => {
    const response = await POST(
      post(
        {},
        {
          ...booking,
          pickupDate: "2027-11-25T10:00:00.000Z",
          returnDate: "2027-11-25T10:00:00.000Z",
        }
      )
    );
    expect(response.status).toBe(201);
    expect((await response.json()).data.totalPrice).toBe(40);
  });

  it("answers a retry with the same key with the same body, marked as a replay", async () => {
    const key = randomUUID();
    const first = await POST(post({ "Idempotency-Key": key }));
    const retry = await POST(post({ "Idempotency-Key": key }));

    expect(first.status).toBe(201);
    expect(retry.status).toBe(201);
    expect(first.headers.get("Idempotent-Replayed")).toBeNull();
    expect(retry.headers.get("Idempotent-Replayed")).toBe("true");

    // The same answer, with one deliberate difference: the payment token is
    // rotated, because only its hash is kept and the first raw token went
    // out in the response that never arrived (see replayBooking). The token
    // that works is the one in the answer the customer actually received.
    const firstBody = await first.json();
    const retryBody = await retry.json();
    const { paymentAccessToken: firstToken, ...firstRest } = firstBody.data;
    const { paymentAccessToken: retryToken, ...retryRest } = retryBody.data;
    expect(Object.keys(retryBody).sort()).toEqual(["data", "success"]);
    expect(retryBody.success).toBe(true);
    expect(retryRest).toEqual(firstRest);
    expect(retryToken).not.toBe(firstToken);
    const { paymentAccessTokenHash } =
      await prisma.reservation.findUniqueOrThrow({
        where: { id: retryBody.data.id },
        select: { paymentAccessTokenHash: true },
      });
    expect(verifyPaymentAccessToken(retryToken, paymentAccessTokenHash!)).toBe(
      true
    );
    expect(verifyPaymentAccessToken(firstToken, paymentAccessTokenHash!)).toBe(
      false
    );

    expect(await reservationsWritten()).toBe(1);
    // Staff and the customer were told about the booking once, not once
    // per retry.
    expect(notifyStaffOfBookingRequest).toHaveBeenCalledTimes(1);
    expect(notifyCustomer).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["too short", "abc123"],
    ["containing a space", "a valid looking key 1234"],
    ["containing a slash", "aaaaaaaa/bbbbbbbbbbbb"],
    ["too long", "a".repeat(129)],
  ])(
    "refuses an Idempotency-Key %s with 400 and writes nothing",
    async (_why, key) => {
      const response = await POST(post({ "Idempotency-Key": key }));
      expect(response.status).toBe(400);
      expect((await response.json()).success).toBe(false);
      expect(await reservationsWritten()).toBe(0);
    }
  );

  it("answers 429 with Retry-After once the hourly allowance is spent", async () => {
    // Spend the allowance directly rather than by making eight bookings.
    await spendAllowance(8, 30);

    const response = await POST(post());
    expect(response.status).toBe(429);

    const retryAfter = Number(response.headers.get("Retry-After"));
    expect(Number.isInteger(retryAfter)).toBe(true);
    // About half an hour is left on the window the row above opened, in any
    // session time zone.
    expect(retryAfter).toBeGreaterThanOrEqual(29 * 60);
    expect(retryAfter).toBeLessThanOrEqual(30 * 60);

    expect((await response.json()).success).toBe(false);
    expect(await reservationsWritten()).toBe(0);
  });

  it("lets the eighth request of the hour through and refuses the ninth", async () => {
    await spendAllowance(7, 60);
    expect((await POST(post())).status).toBe(201);
    expect((await POST(post())).status).toBe(429);
  });

  it("refuses a cross-site request before it spends the limiter or writes anything", async () => {
    // The guard itself is covered in src/lib/api.test.ts; this is the one
    // assertion that the handler calls it, and calls it first.
    const response = await POST(post({ "sec-fetch-site": "cross-site" }));
    expect(response.status).toBe(403);
    expect(await prisma.rateLimit.count({ where: { key: bucket() } })).toBe(0);
    expect(await reservationsWritten()).toBe(0);
  });

  /**
   * Audit finding P3-5. The customer used to be created before the booking's
   * transaction opened, so anything refusing the booking after that point —
   * an FK race, the vehicle going off-road, the insert itself — left a
   * customer with no reservation. A trigger stands in for that late failure:
   * nothing in the booking's own input can make the insert fail once the
   * vehicle checks have passed.
   */
  it("leaves no customer behind when the booking insert fails", async () => {
    const orphanEmail = `orphan-${suffix}@example.test`;
    const marker = `fail-insert-${suffix}`;
    await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION fail_marked_booking_${suffix}() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.notes = '${marker}' THEN
          RAISE EXCEPTION 'simulated late booking failure';
        END IF;
        RETURN NEW;
      END $$`);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER fail_marked_booking_${suffix}
      BEFORE INSERT ON reservations
      FOR EACH ROW EXECUTE FUNCTION fail_marked_booking_${suffix}()`);
    try {
      const response = await POST(
        post(
          {},
          {
            ...booking,
            notes: marker,
            customer: { ...booking.customer, email: orphanEmail },
          }
        )
      );
      expect(response.status).toBeGreaterThanOrEqual(500);
      expect(await reservationsWritten()).toBe(0);
      expect(
        await prisma.customer.count({ where: { email: orphanEmail } })
      ).toBe(0);
      expect(notifyCustomer).not.toHaveBeenCalled();
    } finally {
      await prisma.$executeRawUnsafe(
        `DROP TRIGGER IF EXISTS fail_marked_booking_${suffix} ON reservations`
      );
      await prisma.$executeRawUnsafe(
        `DROP FUNCTION IF EXISTS fail_marked_booking_${suffix}()`
      );
      await prisma.customer.deleteMany({ where: { email: orphanEmail } });
    }
  });

  /**
   * The find-or-create no longer catches a unique violation and re-reads —
   * inside a transaction that error would abort the booking — so two first
   * bookings for one new email are settled by ON CONFLICT DO NOTHING instead.
   * Both must succeed, against a single customer, each keeping what was
   * typed in its own contact snapshot.
   */
  it("books twice at once for a new email with one customer between them", async () => {
    const racedEmail = `Raced-${suffix}@Example.test`;
    try {
      const [a, b] = await Promise.all([
        POST(
          post(
            {},
            {
              ...booking,
              customer: { ...booking.customer, email: racedEmail },
            }
          )
        ),
        POST(
          post(
            {},
            {
              ...booking,
              pickupDate: "2027-12-01T10:00:00.000Z",
              returnDate: "2027-12-02T10:00:00.000Z",
              customer: {
                ...booking.customer,
                firstName: "Second",
                email: racedEmail,
              },
            }
          )
        ),
      ]);
      expect(a.status).toBe(201);
      expect(b.status).toBe(201);

      const customers = await prisma.customer.findMany({
        where: { email: racedEmail.toLowerCase() },
        select: { id: true },
      });
      expect(customers).toHaveLength(1);
      const rows = await prisma.reservation.findMany({
        where: { vehicleId },
        select: { customerId: true, contactFirstName: true },
        orderBy: { pickupDate: "asc" },
      });
      expect(rows.map((r) => r.customerId)).toEqual([
        customers[0]!.id,
        customers[0]!.id,
      ]);
      expect(rows.map((r) => r.contactFirstName)).toEqual(["Route", "Second"]);
    } finally {
      await prisma.reservation.deleteMany({ where: { vehicleId } });
      await prisma.customer.deleteMany({
        where: { email: racedEmail.toLowerCase() },
      });
    }
  });

  /**
   * Audit P2-1b: the honeypot and the fill time. A refusal looks like a
   * success to the script, and nothing is written or sent.
   */
  it.each([
    ["a filled honeypot", { website: "https://spam.example", formMs: 60_000 }],
    ["a form sent in under three seconds", { website: "", formMs: 400 }],
  ])("quietly refuses %s", async (_why, signals) => {
    const response = await POST(post({}, { ...booking, ...signals }));
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(Object.keys(body.data).sort()).toEqual([
      "id",
      "paymentAccessToken",
      "status",
      "totalPrice",
    ]);
    expect(await reservationsWritten()).toBe(0);
    expect(notifyStaffOfBookingRequest).not.toHaveBeenCalled();
    expect(notifyCustomer).not.toHaveBeenCalled();
  });

  it("books normally with the signals a person's form sends", async () => {
    const response = await POST(
      post({}, { ...booking, website: "", formMs: 45_000 })
    );
    expect(response.status).toBe(201);
    expect(await reservationsWritten()).toBe(1);
  });

  describe("caps on open requests", () => {
    const capCustomer = (tag: string, phone: string) => ({
      firstName: "Cap",
      lastName: "Tester",
      email: `cap-${suffix}-${tag}@example.test`,
      phone,
    });
    const days = (n: number) => ({
      pickupDate: `2028-03-${String(n).padStart(2, "0")}T10:00:00.000Z`,
      returnDate: `2028-03-${String(n).padStart(2, "0")}T10:00:00.000Z`,
    });

    it("refuses a fourth open request from one person, matched by email or by phone however typed", async () => {
      const person = capCustomer("a", `+383 49 ${suffix.slice(0, 3)} 001`);
      for (const n of [1, 3, 5]) {
        const ok = await POST(
          post({}, { ...booking, ...days(n), customer: person })
        );
        expect(ok.status).toBe(201);
      }

      const sameEmail = await POST(
        post({}, { ...booking, ...days(7), customer: person })
      );
      expect(sameEmail.status).toBe(409);
      expect((await sameEmail.json()).error.message).toMatch(
        /3 booking requests/
      );

      // Another address, the same number written the way people say it.
      const samePhone = await POST(
        post(
          {},
          {
            ...booking,
            ...days(9),
            customer: {
              ...capCustomer("b", `049${suffix.slice(0, 3)}001`),
            },
          }
        )
      );
      expect(samePhone.status).toBe(409);
      expect(await reservationsWritten()).toBe(3);
    });

    it("refuses a sixth open request for one car on one day, from anyone", async () => {
      for (let i = 0; i < 5; i++) {
        const ok = await POST(
          post(
            { "x-forwarded-for": `${runPrefix}:ff0${i}::1` },
            {
              ...booking,
              ...days(20),
              customer: capCustomer(
                `v${i}`,
                `+383 45 ${suffix.slice(0, 3)} 10${i}`
              ),
            }
          )
        );
        expect(ok.status).toBe(201);
      }
      const sixth = await POST(
        post(
          {},
          {
            ...booking,
            pickupDate: "2028-03-18T10:00:00.000Z",
            returnDate: "2028-03-22T10:00:00.000Z",
            customer: capCustomer("v6", `+383 45 ${suffix.slice(0, 3)} 106`),
          }
        )
      );
      expect(sixth.status).toBe(409);
      // A day the car is free is still bookable.
      const otherDay = await POST(
        post(
          {},
          {
            ...booking,
            ...days(21),
            customer: capCustomer("v6", `+383 45 ${suffix.slice(0, 3)} 106`),
          }
        )
      );
      expect(otherDay.status).toBe(201);
    });

    it("never caps staff: a booking made in the admin goes through for someone already at the cap", async () => {
      const person = capCustomer("staff", `+383 43 ${suffix.slice(0, 3)} 001`);
      for (const n of [1, 3, 5]) {
        await POST(post({}, { ...booking, ...days(n), customer: person }));
      }
      expect(
        (await POST(post({}, { ...booking, ...days(7), customer: person })))
          .status
      ).toBe(409);

      const customer = await prisma.customer.findUniqueOrThrow({
        where: { email: person.email },
      });
      const actor = await createTestActor("booking-caps");
      try {
        const staffMade = await createManualReservation(
          {
            vehicleId,
            customer: { kind: "existing", id: customer.id },
            ...days(7),
            pickupDate: new Date(days(7).pickupDate),
            returnDate: new Date(days(7).returnDate),
            status: "PENDING",
          },
          actor
        );
        expect(staffMade.status).toBe("PENDING");
        expect(await reservationsWritten()).toBe(4);
      } finally {
        await prisma.reservation.deleteMany({ where: { vehicleId } });
        await removeTestActor(actor);
      }
    });

    it("answers in English with a reason the storefront translates, whatever the locale cookie", async () => {
      const person = capCustomer("sq", `+383 46 ${suffix.slice(0, 3)} 001`);
      for (const n of [1, 3, 5]) {
        await POST(post({}, { ...booking, ...days(n), customer: person }));
      }
      const refused = await POST(
        post(
          { cookie: "alfa-locale=sq" },
          { ...booking, ...days(7), customer: person }
        )
      );
      expect(refused.status).toBe(409);
      // The contract: code plus an English message. lib/public-error.ts
      // turns the reason and count into the customer's language.
      expect((await refused.json()).error).toEqual({
        code: "CONFLICT",
        message: expect.stringMatching(/^You already have 3 booking requests/),
        reason: "pendingLimitContact",
        params: { count: 3 },
      });
    });
  });
});
