import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { getReservationDetail } from "@/services/reservation.service";

/**
 * Why an extension is refused has to survive the trip to the drawer.
 *
 * It used to travel as an English sentence, which the drawer then compared
 * against three hard-coded literals to pick a translation. Two were one
 * copy-edit away from silently degrading to the generic "This reservation
 * cannot be extended."; the fourth case never matched at all, because the
 * service interpolated the status into it — so a completed rental, the most
 * common refusal there is, always showed the vague text in both languages.
 *
 * These assert the code, not the prose. The drawer's half of the contract is
 * enforced by the compiler: its map is
 * `satisfies Record<ExtensionRefusal, TranslationKey>`, so a refusal added
 * here without a translation there does not build.
 */
const suffix = randomUUID().slice(0, 8);
const ids = {
  customer: `ext-customer-${suffix}`,
  openEnded: `ext-vehicle-open-${suffix}`,
  backToBack: `ext-vehicle-b2b-${suffix}`,
  expiring: `ext-vehicle-exp-${suffix}`,
  pending: `ext-res-pending-${suffix}`,
  completed: `ext-res-completed-${suffix}`,
  blocked: `ext-res-blocked-${suffix}`,
  follower: `ext-res-follower-${suffix}`,
  registration: `ext-res-registration-${suffix}`,
};

const vehicleBase = {
  brand: "Test",
  model: "Extend",
  year: 2027,
  category: "SEDAN" as const,
  transmission: "AUTOMATIC" as const,
  fuelType: "PETROL" as const,
  seats: 5,
  pricePerDay: 40,
  description: "Integration-test vehicle for extension refusals.",
};

const pickup = new Date("2027-12-01T10:00:00.000Z");
const ret = new Date("2027-12-05T10:00:00.000Z");

const reservationBase = {
  customerId: ids.customer,
  pickupDate: pickup,
  returnDate: ret,
  totalPrice: 160,
};

beforeAll(async () => {
  await prisma.customer.create({
    data: {
      id: ids.customer,
      firstName: "Ext",
      lastName: "Tester",
      email: `ext-${suffix}@example.test`,
      phone: "-",
    },
  });

  await prisma.vehicle.createMany({
    data: [
      // Nothing on the calendar after it and no registration date: any
      // refusal here would have to come from the status.
      { id: ids.openEnded, slug: ids.openEnded, ...vehicleBase },
      { id: ids.backToBack, slug: ids.backToBack, ...vehicleBase },
      {
        id: ids.expiring,
        slug: ids.expiring,
        ...vehicleBase,
        // Expires on the return day, so the rental already runs to the limit.
        registrationExpiry: new Date("2027-12-05T00:00:00.000Z"),
      },
    ],
  });

  await prisma.reservation.createMany({
    data: [
      {
        id: ids.pending,
        ...reservationBase,
        vehicleId: ids.openEnded,
        status: "PENDING",
      },
      {
        id: ids.completed,
        ...reservationBase,
        vehicleId: ids.openEnded,
        status: "COMPLETED",
      },
      {
        id: ids.blocked,
        ...reservationBase,
        vehicleId: ids.backToBack,
        status: "CONFIRMED",
      },
      // Starts exactly where the one above ends. tsrange is half-open, so this
      // is legal — and it leaves not one day to extend into.
      {
        id: ids.follower,
        customerId: ids.customer,
        vehicleId: ids.backToBack,
        pickupDate: ret,
        returnDate: new Date("2027-12-09T10:00:00.000Z"),
        status: "CONFIRMED",
        totalPrice: 160,
      },
      {
        id: ids.registration,
        ...reservationBase,
        vehicleId: ids.expiring,
        status: "CONFIRMED",
      },
    ],
  });
});

afterAll(async () => {
  await prisma.reservation.deleteMany({ where: { customerId: ids.customer } });
  await prisma.vehicle.deleteMany({
    where: { id: { in: [ids.openEnded, ids.backToBack, ids.expiring] } },
  });
  await prisma.customer.deleteMany({ where: { id: ids.customer } });
  await prisma.$disconnect();
});

const refusalFor = async (id: string) => {
  const { extension } = await getReservationDetail(id);
  if (extension.allowed) throw new Error(`${id} was not refused`);
  return extension.reason;
};

describe("why an extension is refused", () => {
  it("names an unconfirmed request", async () => {
    expect(await refusalFor(ids.pending)).toBe("NOT_YET_CONFIRMED");
  });

  /** The regression: this one had no representation the drawer could match. */
  it("names a finished rental distinctly from an unconfirmed one", async () => {
    expect(await refusalFor(ids.completed)).toBe("NOT_EXTENDABLE");
    expect(await refusalFor(ids.completed)).not.toBe(
      await refusalFor(ids.pending)
    );
  });

  it("names the booking that starts the moment this one ends", async () => {
    expect(await refusalFor(ids.blocked)).toBe("BOOKED_IMMEDIATELY_AFTER");
  });

  it("names the registration running out", async () => {
    expect(await refusalFor(ids.registration)).toBe("REGISTRATION_ENDS");
  });
});
