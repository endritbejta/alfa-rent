import { randomInt, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { customerSchema } from "@/lib/validations/customer";
import {
  findDuplicateCustomers,
  getCustomers,
  mergeCustomers,
  updateCustomer,
} from "@/services/customer.service";

/**
 * Staff can find, correct and fold together customer records. The merge is
 * the dangerous one — it deletes rows and moves history — so it is pinned to
 * be all-or-nothing and to keep real contact details over placeholders.
 */
const suffix = randomUUID().slice(0, 8);
// Nine random digits, so no seed customer shares the number.
const digits = String(randomInt(100_000_000, 999_999_999));
const pretty = `+383 ${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5)}`;
const local = `0${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5)}`;

const ids = {
  vehicle: `cm-vehicle-${suffix}`,
  real: `cm-real-${suffix}`,
  walkIn: `cm-walkin-${suffix}`,
  other: `cm-other-${suffix}`,
  r1: `cm-r1-${suffix}`,
  r2: `cm-r2-${suffix}`,
};
const lastName = `Merge${suffix}`;

beforeAll(async () => {
  await prisma.vehicle.create({
    data: {
      id: ids.vehicle,
      slug: `cm-car-${suffix}`,
      brand: "Test",
      model: "Customers",
      year: 2026,
      category: "SEDAN",
      transmission: "MANUAL",
      fuelType: "PETROL",
      seats: 5,
      pricePerDay: 30,
      description: "Integration-test vehicle for customer management.",
    },
  });
  await prisma.customer.createMany({
    data: [
      {
        id: ids.walkIn,
        firstName: "Arta",
        lastName,
        email: `walkin.${suffix}@alfarent.local`,
        phone: "-",
        notes: "Called about a van",
      },
      {
        id: ids.real,
        firstName: "Arta",
        lastName,
        email: `arta-${suffix}@example.test`,
        phone: pretty,
        notes: "Prefers automatic",
      },
      {
        id: ids.other,
        firstName: "Besa",
        lastName: `Other${suffix}`,
        email: `besa-${suffix}@example.test`,
        phone: local,
      },
    ],
  });
  await prisma.reservation.createMany({
    data: [ids.r1, ids.r2].map((id, i) => ({
      id,
      vehicleId: ids.vehicle,
      customerId: i === 0 ? ids.walkIn : ids.real,
      pickupDate: new Date(`2027-0${i + 1}-01T10:00:00.000Z`),
      returnDate: new Date(`2027-0${i + 1}-03T10:00:00.000Z`),
      status: "COMPLETED" as const,
      totalPrice: 60,
    })),
  });
});

afterAll(async () => {
  await prisma.reservation.deleteMany({ where: { vehicleId: ids.vehicle } });
  await prisma.vehicle.deleteMany({ where: { id: ids.vehicle } });
  await prisma.customer.deleteMany({
    where: { id: { in: [ids.real, ids.walkIn, ids.other] } },
  });
  await prisma.$disconnect();
});

describe("finding customers", () => {
  it("matches a phone number however it was typed", async () => {
    const { items } = await getCustomers({ page: 1, perPage: 50, q: local });
    expect(items.map((c) => c.id).sort()).toEqual([ids.real, ids.other].sort());
  });

  it("requires every word to match", async () => {
    const { items } = await getCustomers({
      page: 1,
      perPage: 50,
      q: `besa other${suffix}`,
    });
    expect(items.map((c) => c.id)).toEqual([ids.other]);
  });
});

describe("editing a customer", () => {
  it("clears a note rather than leaving the old one", async () => {
    await updateCustomer(
      ids.other,
      customerSchema.parse({
        firstName: "Besa",
        lastName: `Other${suffix}`,
        email: `BESA-${suffix}@Example.test`,
        phone: local,
        notes: "",
      })
    );
    const after = await prisma.customer.findUniqueOrThrow({
      where: { id: ids.other },
    });
    expect(after.notes).toBeNull();
    expect(after.email).toBe(`besa-${suffix}@example.test`);
  });

  it("refuses an email another customer already has, as a 409", async () => {
    const attempt = updateCustomer(
      ids.other,
      customerSchema.parse({
        firstName: "Besa",
        lastName: `Other${suffix}`,
        email: `arta-${suffix}@example.test`,
        phone: local,
      })
    );
    await expect(attempt).rejects.toMatchObject({
      status: 409,
      text: { key: "err.customerEmailTaken" },
    });
  });
});

describe("duplicates and merging", () => {
  it("groups records sharing a name or a number", async () => {
    const groups = await findDuplicateCustomers();
    const ours = groups.filter((g) =>
      g.customers.some((c) => c.id === ids.real)
    );
    const signatures = ours.map((g) =>
      g.customers
        .map((c) => c.id)
        .sort()
        .join(",")
    );
    expect(signatures).toContain([ids.real, ids.walkIn].sort().join(","));
    expect(signatures).toContain([ids.real, ids.other].sort().join(","));
  });

  it("leaves everything untouched when a record is missing", async () => {
    await expect(
      mergeCustomers({ keepId: ids.walkIn, mergeIds: ["cm-missing"] })
    ).rejects.toMatchObject({ status: 404 });
    expect(
      await prisma.reservation.count({ where: { customerId: ids.walkIn } })
    ).toBe(1);
  });

  it("moves the history and keeps real contact details over placeholders", async () => {
    const { moved } = await mergeCustomers({
      keepId: ids.walkIn,
      mergeIds: [ids.real],
    });
    expect(moved).toBe(1);

    const kept = await prisma.customer.findUniqueOrThrow({
      where: { id: ids.walkIn },
      include: { reservations: { select: { id: true } } },
    });
    expect(kept.reservations.map((r) => r.id).sort()).toEqual(
      [ids.r1, ids.r2].sort()
    );
    expect(kept.phone).toBe(pretty);
    expect(kept.email).toBe(`arta-${suffix}@example.test`);
    expect(kept.notes).toBe("Called about a van\nPrefers automatic");
    expect(await prisma.customer.count({ where: { id: ids.real } })).toBe(0);
  });
});
