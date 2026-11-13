import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { purgeAuditEvents } from "@/lib/testing/audit";
import { AppError, ForbiddenError } from "@/lib/errors";
import { dictionaries, translate } from "@/lib/i18n/translations";
import {
  ANONYMISED_FIRST_NAME,
  MISSING_PHONE,
  anonymisedEmail,
  anonymisedLastName,
} from "@/lib/validations/customer";
import {
  ANONYMISED_SIGNER,
  anonymiseCustomer,
  getCustomerSpend,
  getCustomers,
  mergeCustomers,
  updateCustomer,
} from "@/services/customer.service";

// The server action is exercised for real, through requireRole and the
// database, with only the session cookie and Next's request-bound helpers
// stood in for.
const session = vi.hoisted(() => ({
  current: null as null | { user: { id: string; sessionVersion: number } },
}));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: async () => session.current }));
vi.mock("@/lib/i18n/server", () => ({
  getI18n: async () => ({
    locale: "en",
    dictionary: dictionaries.en,
    t: (key: keyof typeof dictionaries.en) => translate(dictionaries.en, key),
  }),
}));

const { anonymiseCustomerAction } =
  await import("@/app/(dashboard)/admin/customers/actions");

/**
 * Anonymising answers an erasure request: the person's details go, the
 * business's record of what was rented and for how much stays. Every row
 * here carries the suffix in its id and is deleted afterwards.
 */
const suffix = randomUUID().slice(0, 8);
const id = (name: string) => `anon-${name}-${suffix}`;
const ids = {
  vehicle: id("vehicle"),
  admin: id("admin"),
  employee: id("employee"),
  closed: id("closed"),
  open: id("open"),
  viaAction: id("via-action"),
};
const customerIds = [ids.closed, ids.open, ids.viaAction];
const email = (who: string) => `anon-${who}-${suffix}@example.test`;

beforeAll(async () => {
  await prisma.vehicle.create({
    data: {
      id: ids.vehicle,
      slug: `anon-car-${suffix}`,
      brand: "Test",
      model: "Anonymise",
      year: 2026,
      category: "SEDAN",
      transmission: "MANUAL",
      fuelType: "PETROL",
      seats: 5,
      pricePerDay: 40,
      description: "Integration-test vehicle for anonymisation.",
    },
  });
  await prisma.user.createMany({
    data: [
      { id: ids.admin, role: "ADMIN" as const },
      { id: ids.employee, role: "EMPLOYEE" as const },
    ].map((u) => ({
      ...u,
      name: `Anon ${u.role}`,
      email: email(u.role.toLowerCase()),
      // Never checked: these users only ever "sign in" through the mock.
      password: "unused",
    })),
  });
  await prisma.customer.createMany({
    data: customerIds.map((customerId, i) => ({
      id: customerId,
      firstName: ["Arta", "Besa", "Drita"][i],
      lastName: `Krasniqi${suffix}`,
      email: email(`customer-${i}`),
      phone: `+383 44 ${100 + i} 234`,
      notes: "Prefers automatic. Staying at Hotel Example.",
    })),
  });
  // One month per reservation so none can trip the overlap constraint.
  const reservation = (
    n: number,
    customerId: string,
    status: "COMPLETED" | "CANCELLED" | "CONFIRMED",
    totalPrice: string
  ) => ({
    id: id(`r${n}`),
    vehicleId: ids.vehicle,
    customerId,
    pickupDate: new Date(`2031-${String(n).padStart(2, "0")}-01T10:00:00Z`),
    returnDate: new Date(`2031-${String(n).padStart(2, "0")}-04T10:00:00Z`),
    status,
    totalPrice,
    notes: "Flight LH1234, wife Arta also drives",
    contactFirstName: "Arta",
    contactLastName: "Krasniqi",
    contactEmail: "arta.private@example.test",
    contactPhone: "+383 49 555 111",
    // A late return waived with a reason that names the customer.
    ...(status === "COMPLETED" && {
      lateDays: 2,
      lateCharge: "0.00",
      lateResolution: "WAIVED" as const,
      lateWaiverReason: "Arta's flight was cancelled, owner agreed",
    }),
  });
  await prisma.reservation.createMany({
    data: [
      reservation(1, ids.closed, "COMPLETED", "120.50"),
      reservation(2, ids.closed, "CANCELLED", "80.00"),
      reservation(3, ids.open, "COMPLETED", "60.00"),
      reservation(4, ids.open, "CONFIRMED", "90.00"),
      reservation(5, ids.viaAction, "COMPLETED", "45.00"),
    ],
  });
  await prisma.rentalInspection.create({
    data: {
      reservationId: id("r1"),
      createdById: ids.admin,
      type: "PICKUP",
      mileage: 41_250,
      fuelLevel: 75,
      damageFound: false,
      signerName: "Arta Krasniqi",
      acknowledgedAt: new Date("2031-01-01T10:05:00Z"),
    },
  });
});

afterAll(async () => {
  // Inspections cascade with their reservation.
  await prisma.reservation.deleteMany({ where: { vehicleId: ids.vehicle } });
  await prisma.vehicle.deleteMany({ where: { id: ids.vehicle } });
  await prisma.customer.deleteMany({ where: { id: { in: customerIds } } });
  await purgeAuditEvents({ actorIds: [ids.admin, ids.employee] });
  await prisma.user.deleteMany({
    where: { id: { in: [ids.admin, ids.employee] } },
  });
  await prisma.$disconnect();
});

async function signInAs(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  session.current = {
    user: { id: user.id, sessionVersion: user.sessionVersion },
  };
}

/** Rejects with an AppError carrying this translation key. */
async function refusedWith(run: Promise<unknown>, key: string) {
  const error = await run.then(
    () => null,
    (caught: unknown) => caught
  );
  expect(error).toBeInstanceOf(AppError);
  expect((error as AppError).text?.key).toBe(key);
}

describe("anonymiseCustomer", () => {
  it("scrubs the customer's personal data and keeps the rentals and their totals", async () => {
    const spendBefore = await getCustomerSpend(ids.closed);

    await expect(anonymiseCustomer(ids.closed, ids.admin)).resolves.toEqual({
      reservations: 2,
    });

    const customer = await prisma.customer.findUniqueOrThrow({
      where: { id: ids.closed },
      include: {
        reservations: {
          orderBy: { pickupDate: "asc" },
          include: { inspections: true },
        },
      },
    });
    expect(customer).toMatchObject({
      firstName: ANONYMISED_FIRST_NAME,
      lastName: anonymisedLastName(ids.closed),
      email: anonymisedEmail(ids.closed),
      phone: MISSING_PHONE,
      notes: null,
    });
    expect(customer.anonymisedAt).toBeInstanceOf(Date);

    // The accounting record is untouched.
    expect(
      customer.reservations.map((r) => [
        r.id,
        r.status,
        r.totalPrice.toFixed(2),
      ])
    ).toEqual([
      [id("r1"), "COMPLETED", "120.50"],
      [id("r2"), "CANCELLED", "80.00"],
    ]);
    expect(await getCustomerSpend(ids.closed)).toBe(spendBefore);

    // Free text on the rentals, and the signer's name, are gone; what the
    // inspection says about the car is not.
    expect(customer.reservations.map((r) => r.notes)).toEqual([null, null]);
    for (const r of customer.reservations) {
      expect(r).toMatchObject({
        contactFirstName: null,
        contactLastName: null,
        contactEmail: null,
        contactPhone: null,
        lateWaiverReason: null,
      });
    }
    // The late days themselves are a fact about the rental, and stay.
    expect(customer.reservations.map((r) => r.lateDays)).toContain(2);
    const [inspection] = customer.reservations[0].inspections;
    expect(inspection).toMatchObject({
      signerName: ANONYMISED_SIGNER,
      mileage: 41_250,
      fuelLevel: 75,
    });

    // Nothing that identified the person is left on the row.
    const text = JSON.stringify(customer);
    for (const trace of [
      "Arta Krasniqi",
      "arta.private",
      "555 111",
      email("customer-0"),
      "Hotel",
      "LH1234",
    ]) {
      expect(text).not.toContain(trace);
    }
  });

  it("then refuses to edit, merge or anonymise the record again", async () => {
    await refusedWith(
      anonymiseCustomer(ids.closed, ids.admin),
      "err.customerAnonymised"
    );
    await refusedWith(
      updateCustomer(
        ids.closed,
        {
          firstName: "Arta",
          lastName: "Krasniqi",
          email: email("customer-0"),
          phone: "+383 44 100 234",
          notes: null,
        },
        ids.admin
      ),
      "err.customerAnonymised"
    );
    await refusedWith(
      mergeCustomers(
        { keepId: ids.viaAction, mergeIds: [ids.closed] },
        ids.admin
      ),
      "err.customerAnonymised"
    );
  });

  it("drops out of the booking dialog's customer lookup, not the list", async () => {
    const q = anonymisedLastName(ids.closed);
    const lookup = await getCustomers({
      page: 1,
      perPage: 10,
      q,
      includeAnonymised: false,
    });
    expect(lookup.items.map((c) => c.id)).not.toContain(ids.closed);
    const list = await getCustomers({ page: 1, perPage: 10, q });
    expect(list.items.map((c) => c.id)).toContain(ids.closed);
  });

  it("is refused while the customer has an open reservation", async () => {
    await refusedWith(
      anonymiseCustomer(ids.open, ids.admin),
      "err.customerHasOpenReservations"
    );
    const customer = await prisma.customer.findUniqueOrThrow({
      where: { id: ids.open },
    });
    expect(customer).toMatchObject({
      firstName: "Besa",
      email: email("customer-1"),
      anonymisedAt: null,
    });
    const notes = await prisma.reservation.findMany({
      where: { customerId: ids.open },
      select: { notes: true },
    });
    expect(notes.every((r) => r.notes !== null)).toBe(true);
  });
});

describe("anonymiseCustomerAction", () => {
  it("refuses an EMPLOYEE and leaves the customer as it was", async () => {
    await signInAs(ids.employee);
    await expect(anonymiseCustomerAction(ids.viaAction)).rejects.toBeInstanceOf(
      ForbiddenError
    );
    const customer = await prisma.customer.findUniqueOrThrow({
      where: { id: ids.viaAction },
    });
    expect(customer).toMatchObject({
      firstName: "Drita",
      email: email("customer-2"),
      anonymisedAt: null,
    });
  });

  it("lets an ADMIN through", async () => {
    await signInAs(ids.admin);
    await expect(anonymiseCustomerAction(ids.viaAction)).resolves.toEqual({
      reservations: 1,
    });
    const customer = await prisma.customer.findUniqueOrThrow({
      where: { id: ids.viaAction },
    });
    expect(customer.email).toBe(anonymisedEmail(ids.viaAction));
  });

  it("reports the open-reservation refusal as a message, not a crash", async () => {
    await signInAs(ids.admin);
    await expect(anonymiseCustomerAction(ids.open)).resolves.toEqual({
      error: dictionaries.en["err.customerHasOpenReservations"],
    });
  });
});
