import { randomUUID } from "node:crypto";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

/*
 * Customer booking emails (audit P2-13), through the code staff and
 * customers actually reach: POST /api/bookings, the status action, and the
 * expiry sweep's cron route, against a real database.
 *
 * Two stand-ins. after() needs a live request scope, so it queues its task
 * here and the test runs the queue, which is how "scheduled exactly one" is
 * counted. And fetch is Resend: nothing leaves the test run, and each call is
 * one email, inspectable by recipient and subject.
 */
const queued = vi.hoisted(() => [] as Array<() => unknown>);
const session = vi.hoisted(() => ({
  current: null as null | { user: { id: string; sessionVersion: number } },
}));
vi.mock("server-only", () => ({}));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (task: () => unknown) => {
    queued.push(task);
  },
}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  updateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}));
vi.mock("@/lib/auth", () => ({ auth: async () => session.current }));
vi.mock("@/lib/i18n/server", async () =>
  (await import("@/lib/testing/action-mocks")).i18nServerMock()
);

import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { businessDay } from "@/lib/reservation-lifecycle";
import { createTestActor, removeTestActor } from "@/lib/testing/audit";
import { purgeAuditEvents } from "@/lib/testing/audit";
import { anonymiseCustomer } from "@/services/customer.service";

const { POST } = await import("@/app/api/bookings/route");
const { GET: sweep } = await import("@/app/api/cron/expired-requests/route");
const { updateReservationStatusAction } =
  await import("@/app/(dashboard)/admin/reservations/actions");

const suffix = randomUUID().slice(0, 8);
const vehicleId = `mail-vehicle-${suffix}`;
const emailFor = (who: string) => `mail-${who}-${suffix}@example.test`;
const CRON_SECRET = `cron-${suffix}`;
let staffId = "";
let ipCounter = 0;

/** A rental day in the booking model: the calendar day at 10:00 "UTC". */
const today = businessDay(new Date());
const dayAt = (offset: number) => {
  const d = new Date(`${today}T10:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString();
};

const fetchMock = vi.fn();
/** The emails Resend was asked to send, as {to, subject, html, text}. */
const sent = () =>
  fetchMock.mock.calls
    .filter(([url]) => String(url).startsWith("https://api.resend.com/"))
    .map(([, init]) => JSON.parse(init.body));

async function runQueued() {
  const tasks = queued.splice(0);
  await Promise.all(tasks.map((task) => task()));
  return tasks.length;
}

function book(
  who: string,
  {
    pickup,
    days = 3,
    locale,
    key,
  }: { pickup: number; days?: number; locale?: string; key?: string }
) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-forwarded-for": `198.51.100.${++ipCounter}-${suffix}`,
  };
  if (locale) headers.cookie = `alfa-locale=${locale}`;
  if (key) headers["Idempotency-Key"] = key;
  return POST(
    new NextRequest("http://localhost/api/bookings", {
      method: "POST",
      headers,
      body: JSON.stringify({
        vehicleId,
        pickupDate: dayAt(pickup),
        returnDate: dayAt(pickup + days - 1),
        customer: {
          firstName: "Mira",
          lastName: "Mail",
          email: emailFor(who),
          phone: "+383 44 000 777",
        },
      }),
    })
  );
}

async function bookedId(response: Response): Promise<string> {
  expect(response.status).toBe(201);
  return (await response.json()).data.id;
}

beforeAll(async () => {
  staffId = await createTestActor("customer-mail");
  await prisma.user.update({
    where: { id: staffId },
    data: { active: true, role: "EMPLOYEE" },
  });
  const staff = await prisma.user.findUniqueOrThrow({ where: { id: staffId } });
  session.current = {
    user: { id: staff.id, sessionVersion: staff.sessionVersion },
  };
  await prisma.vehicle.create({
    data: {
      id: vehicleId,
      slug: `mail-car-${suffix}`,
      brand: "Mailer",
      model: "Courier",
      year: 2026,
      category: "SEDAN",
      transmission: "MANUAL",
      fuelType: "PETROL",
      seats: 5,
      pricePerDay: 40,
      description: "Integration-test vehicle for customer emails.",
    },
  });
});

beforeEach(() => {
  queued.length = 0;
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("RESEND_API_KEY", "re_test_key");
  vi.stubEnv("EMAIL_FROM", "Alfa Rent <bookings@example.test>");
  vi.stubEnv("STAFF_NOTIFICATION_EMAILS", "");
  vi.stubEnv("CRON_SECRET", CRON_SECRET);
  vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

afterAll(async () => {
  const reservations = await prisma.reservation.findMany({
    where: { vehicleId },
    select: { id: true, customerId: true },
  });
  const customerIds = [...new Set(reservations.map((r) => r.customerId))];
  await purgeAuditEvents({
    actorIds: [staffId],
    entityIds: [...reservations.map((r) => r.id), ...customerIds],
  });
  await prisma.reservation.deleteMany({ where: { vehicleId } });
  await prisma.customer.deleteMany({ where: { id: { in: customerIds } } });
  await prisma.vehicle.deleteMany({ where: { id: vehicleId } });
  await prisma.rateLimit.deleteMany({
    where: { key: { startsWith: "bookings:198.51.100.", endsWith: suffix } },
  });
  await removeTestActor(staffId);
  await prisma.$disconnect();
});

describe("the request-received email", () => {
  it("is scheduled once for a new booking, to the address submitted, in its language", async () => {
    const id = await bookedId(
      await book("received", { pickup: 30, locale: "en" })
    );
    expect(fetchMock).not.toHaveBeenCalled(); // not before the response
    expect(await runQueued()).toBe(2); // staff + customer

    const mails = sent();
    expect(mails).toHaveLength(1);
    expect(mails[0].to).toEqual([emailFor("received")]);
    expect(mails[0].subject).toBe(
      "We received your booking request — Mailer Courier"
    );
    expect(mails[0].text).toContain(`Reference: ${id}`);
    expect(mails[0].text).toContain("Total (3 days): 120.00 EUR");

    const stored = await prisma.reservation.findUniqueOrThrow({
      where: { id },
    });
    expect(stored.locale).toBe("en");
  });

  it("is in Albanian for a booking made in Albanian, or with no language cookie", async () => {
    await bookedId(await book("sq", { pickup: 34, locale: "sq" }));
    await bookedId(await book("nocookie", { pickup: 38 }));
    await runQueued();
    const subjects = sent().map((m) => m.subject);
    expect(subjects).toEqual([
      "E morëm kërkesën tuaj për rezervim — Mailer Courier",
      "E morëm kërkesën tuaj për rezervim — Mailer Courier",
    ]);
  });

  it("is not sent again for an idempotent replay", async () => {
    const key = randomUUID();
    await book("replay", { pickup: 42, locale: "en", key });
    await runQueued();
    expect(sent()).toHaveLength(1);

    const retry = await book("replay", { pickup: 42, locale: "en", key });
    expect(retry.headers.get("Idempotent-Replayed")).toBe("true");
    expect(await runQueued()).toBe(0);
    expect(sent()).toHaveLength(1);
  });

  it("is skipped without error when email is not configured", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const response = await book("unconfigured", { pickup: 46 });
    expect(response.status).toBe(201);
    await expect(runQueued()).resolves.toBe(2);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never fails the booking when the provider does", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await book("provider-down", { pickup: 50 });
    expect(response.status).toBe(201);
    await expect(runQueued()).resolves.toBe(2);
  });
});

describe("status emails from staff", () => {
  it("sends one confirmation, then one cancellation without the staff reason", async () => {
    const id = await bookedId(
      await book("status", { pickup: 54, locale: "en" })
    );
    await runQueued();
    fetchMock.mockClear();

    await expect(
      updateReservationStatusAction(id, "CONFIRMED")
    ).resolves.toBeUndefined();
    expect(await runQueued()).toBe(1);
    expect(sent().map((m) => m.subject)).toEqual([
      "Your booking is confirmed — Mailer Courier",
    ]);

    fetchMock.mockClear();
    const reason = "Customer failed the licence check at the desk";
    await expect(
      updateReservationStatusAction(id, "CANCELLED", reason)
    ).resolves.toBeUndefined();
    expect(await runQueued()).toBe(1);
    const [mail] = sent();
    expect(mail.subject).toBe(
      "Your booking has been cancelled — Mailer Courier"
    );
    expect(mail.to).toEqual([emailFor("status")]);
    expect(mail.text).not.toContain("licence");
    expect(mail.html).not.toContain("licence");
  });

  it("schedules nothing when the action is refused", async () => {
    const id = await bookedId(await book("refused", { pickup: 58 }));
    await runQueued();
    fetchMock.mockClear();
    await expect(
      updateReservationStatusAction(id, "CANCELLED", "short")
    ).resolves.toHaveProperty("error");
    expect(await runQueued()).toBe(0);
  });

  it("sends nothing to an anonymised customer", async () => {
    // Anonymising needs no open reservations, so the real path is a late
    // email about a booking that was closed before the customer was erased.
    const id = await bookedId(await book("anonymised", { pickup: 62 }));
    await updateReservationStatusAction(
      id,
      "CANCELLED",
      "Customer asked us to"
    );
    const { customerId } = await prisma.reservation.findUniqueOrThrow({
      where: { id },
    });
    await anonymiseCustomer(customerId, staffId);
    fetchMock.mockClear();
    expect(await runQueued()).toBe(3); // received, staff, cancelled
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends nothing once the customer is marked anonymised, whatever the row still holds", async () => {
    const id = await bookedId(await book("marked", { pickup: 66 }));
    await runQueued();
    fetchMock.mockClear();
    const { customerId } = await prisma.reservation.findUniqueOrThrow({
      where: { id },
    });
    await prisma.customer.update({
      where: { id: customerId },
      data: { anonymisedAt: new Date() },
    });
    await updateReservationStatusAction(id, "CONFIRMED");
    expect(await runQueued()).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("the expiry sweep", () => {
  function callSweep(secret = CRON_SECRET) {
    return sweep(
      new Request("http://localhost/api/cron/expired-requests", {
        headers: { authorization: `Bearer ${secret}` },
      })
    );
  }

  /** A public request whose pickup day has passed, still PENDING. */
  async function lapsed(who: string, pickupOffset: number) {
    const id = await bookedId(await book(who, { pickup: 70 + pickupOffset }));
    await runQueued();
    await prisma.reservation.update({
      where: { id },
      data: {
        pickupDate: new Date(dayAt(pickupOffset)),
        returnDate: new Date(dayAt(pickupOffset + 1)),
      },
    });
    return id;
  }

  it("refuses a caller without the cron secret", async () => {
    expect((await callSweep("wrong")).status).toBe(401);
    vi.stubEnv("CRON_SECRET", "");
    expect((await callSweep("")).status).toBe(401);
  });

  it("tells each recently lapsed customer once, and staff cancelling later adds nothing", async () => {
    const id = await lapsed("expired", -1);
    const old = await lapsed("long-ago", -30);
    fetchMock.mockClear();

    const first = await callSweep();
    expect(first.status).toBe(200);
    const mine = () =>
      sent().filter(
        (m) =>
          m.to[0] === emailFor("expired") || m.to[0] === emailFor("long-ago")
      );
    expect(mine().map((m) => [m.to[0], m.subject])).toEqual([
      [
        emailFor("expired"),
        "Kërkesa juaj për rezervim ka skaduar — Mailer Courier",
      ],
    ]);

    await callSweep();
    expect(mine()).toHaveLength(1);

    await updateReservationStatusAction(
      id,
      "CANCELLED",
      "Lapsed, nobody called back"
    );
    await runQueued();
    expect(mine()).toHaveLength(1);

    const stale = await prisma.reservation.findUniqueOrThrow({
      where: { id: old },
    });
    expect(stale.expiryNotifiedAt).toBeNull();
  });

  it("releases a failed send for the next run", async () => {
    const id = await lapsed("retry", -1);
    vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock.mockResolvedValue(new Response("{}", { status: 500 }));
    await callSweep();
    expect(
      (await prisma.reservation.findUniqueOrThrow({ where: { id } }))
        .expiryNotifiedAt
    ).toBeNull();

    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    fetchMock.mockClear();
    await callSweep();
    expect(sent().filter((m) => m.to[0] === emailFor("retry"))).toHaveLength(1);
  });

  it("claims nothing while email is not configured", async () => {
    const id = await lapsed("unconfigured-expiry", -1);
    vi.stubEnv("EMAIL_FROM", "");
    expect((await callSweep()).status).toBe(200);
    expect(
      (await prisma.reservation.findUniqueOrThrow({ where: { id } }))
        .expiryNotifiedAt
    ).toBeNull();
    // Leave it claimed so later tests' sweeps don't pick it up.
    await prisma.reservation.update({
      where: { id },
      data: { expiryNotifiedAt: new Date() },
    });
  });
});
