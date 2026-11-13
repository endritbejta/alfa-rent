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
 * Only after() and the staff notification stand in: after() needs a live
 * request scope to schedule work in, and no mail should leave a test run.
 */
const { notifyStaffOfBookingRequest } = vi.hoisted(() => ({
  notifyStaffOfBookingRequest: vi.fn(),
}));

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (task: () => unknown) => task(),
}));
vi.mock("@/services/notification.service", () => ({
  notifyStaffOfBookingRequest,
}));

import { prisma } from "@/lib/db/prisma";
import { verifyPaymentAccessToken } from "@/lib/payments/access-token";
import { POST } from "./route";

const suffix = randomUUID().slice(0, 8);
const vehicleId = `route-vehicle-${suffix}`;
const email = `route-${suffix}@example.test`;
/** Each test gets its own client address, so its own limiter bucket. */
let ip: string;
let ipCounter = 0;

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
 * Spends part of this test's allowance, the way the limiter itself writes:
 * with the database's now(). `expiresAt` is a timestamp without time zone,
 * and the limiter compares it against now() in the session's time zone, so a
 * row written through Prisma (UTC) reads as already expired wherever the
 * database does not run in UTC — the local Homebrew Postgres runs in
 * Europe/Belgrade.
 */
async function spendAllowance(count: number, minutesLeft: number) {
  await prisma.$executeRaw`
    INSERT INTO rate_limits ("key", "count", "expiresAt")
    VALUES (${`bookings:${ip}`}, ${count}::int,
            now() + make_interval(mins => ${minutesLeft}::int))
  `;
}

/**
 * How far the session's wall clock is from UTC, in seconds. The limiter reads
 * that wall-clock expiry back as though it were UTC, so its Retry-After is
 * off by exactly this much outside UTC (zero in CI and on Supabase), and
 * clamped to 0 where the zone is far enough behind UTC.
 */
async function sessionUtcOffsetSeconds() {
  const [row] = await prisma.$queryRaw<{ offset: number }[]>`
    SELECT EXTRACT(EPOCH FROM (now()::timestamp - (now() AT TIME ZONE 'UTC')))::int AS "offset"
  `;
  return row!.offset;
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
  ip = `203.0.113.${++ipCounter}-${suffix}`;
  notifyStaffOfBookingRequest.mockClear();
  // Each test counts its own writes from zero.
  await prisma.reservation.deleteMany({ where: { vehicleId } });
});

afterAll(async () => {
  await prisma.reservation.deleteMany({ where: { vehicleId } });
  await prisma.vehicle.deleteMany({ where: { id: vehicleId } });
  await prisma.customer.deleteMany({ where: { email } });
  await prisma.rateLimit.deleteMany({
    where: { key: { startsWith: "bookings:203.0.113.", endsWith: suffix } },
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
    // Staff were told about the booking once, not once per retry.
    expect(notifyStaffOfBookingRequest).toHaveBeenCalledTimes(1);
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
    // About half an hour is left on the window the row above opened, as
    // the limiter computes it: shifted by the session's UTC offset and
    // floored at zero, which is where a zone far enough behind UTC lands.
    const skew = await sessionUtcOffsetSeconds();
    const asTheLimiterSeesIt = (seconds: number) => Math.max(0, seconds + skew);
    expect(retryAfter).toBeGreaterThanOrEqual(asTheLimiterSeesIt(29 * 60));
    expect(retryAfter).toBeLessThanOrEqual(asTheLimiterSeesIt(30 * 60));

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
    expect(
      await prisma.rateLimit.count({ where: { key: `bookings:${ip}` } })
    ).toBe(0);
    expect(await reservationsWritten()).toBe(0);
  });
});
