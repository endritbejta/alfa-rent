import { randomInt, randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { ConflictError } from "@/lib/errors";
import { submittedContactAsCustomerInput } from "@/lib/booking-contact";
import { customerSchema } from "@/lib/validations/customer";
import { updateCustomer } from "@/services/customer.service";
import {
  createReservation,
  getReservationDetail,
} from "@/services/reservation.service";
import { createTestActor, removeTestActor } from "@/lib/testing/audit";

// Every staff write records who did it; this stands behind them here.
let actor = "";
beforeAll(async () => {
  actor = await createTestActor("booking-contact");
});
/*
 * Each test starts with no open requests on the car. The public path refuses
 * a fourth open request per person (audit P2-1b); these tests are about the
 * contact snapshot, not that cap.
 */
beforeEach(async () => {
  await prisma.reservation.deleteMany({ where: { vehicleId: ids.vehicle } });
});

afterAll(async () => {
  await removeTestActor(actor);
});

/**
 * Audit P1-4. A public booking whose email is already on file used to keep
 * nothing of what was typed, so staff rang the stale number. These pin the
 * fix: the reservation keeps a snapshot of the submitted details, the
 * customer record still never changes from the public path, and staff are
 * told — and can copy the details over — only when the two differ.
 */
const suffix = randomUUID().slice(0, 8);
const digits = () => String(randomInt(10_000_000, 99_999_999));
const storedPhone = `+383 44 ${digits()}`;
const newDigits = digits();
const newPhone = `+383 49 ${newDigits.slice(0, 3)} ${newDigits.slice(3)}`;

const ids = {
  vehicle: `bc-vehicle-${suffix}`,
  customer: `bc-customer-${suffix}`,
  other: `bc-other-${suffix}`,
};
const email = `contact-${suffix}@example.test`;
const otherEmail = `contact-other-${suffix}@example.test`;

let nextWeek = 0;
/** Each booking gets its own week, so none is refused as a clash. */
function booking(customer: {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}) {
  const start = new Date(Date.UTC(2028, 0, 3 + 7 * nextWeek++, 10));
  return {
    vehicleId: ids.vehicle,
    pickupDate: start,
    returnDate: new Date(start.getTime() + 2 * 86_400_000),
    customer,
  };
}

beforeAll(async () => {
  await prisma.vehicle.create({
    data: {
      id: ids.vehicle,
      slug: `bc-car-${suffix}`,
      brand: "Test",
      model: "Contact",
      year: 2027,
      category: "SEDAN",
      transmission: "MANUAL",
      fuelType: "PETROL",
      seats: 5,
      pricePerDay: 30,
      description: "Integration-test vehicle for booking contact snapshots.",
    },
  });
  await prisma.customer.createMany({
    data: [
      {
        id: ids.customer,
        firstName: "Drita",
        lastName: "Krasniqi",
        email,
        phone: storedPhone,
        notes: "Prefers a morning pickup",
      },
      {
        id: ids.other,
        firstName: "Other",
        lastName: "Person",
        email: otherEmail,
        phone: `+383 45 ${digits()}`,
      },
    ],
  });
});

afterAll(async () => {
  await prisma.reservation.deleteMany({ where: { vehicleId: ids.vehicle } });
  await prisma.vehicle.deleteMany({ where: { id: ids.vehicle } });
  await prisma.customer.deleteMany({
    where: { id: { in: [ids.customer, ids.other] } },
  });
  await prisma.$disconnect();
});

describe("a public booking for an email already on file", () => {
  it("stores what was submitted and leaves the customer unchanged", async () => {
    const before = await prisma.customer.findUniqueOrThrow({
      where: { id: ids.customer },
    });

    const { reservation } = await createReservation(
      booking({
        firstName: "  Drita ",
        lastName: "Krasniqi-Berisha",
        email: email.toUpperCase(),
        phone: ` ${newPhone} `,
      })
    );

    const stored = await prisma.reservation.findUniqueOrThrow({
      where: { id: reservation.id },
      select: {
        customerId: true,
        contactFirstName: true,
        contactLastName: true,
        contactEmail: true,
        contactPhone: true,
      },
    });
    expect(stored).toEqual({
      customerId: ids.customer,
      contactFirstName: "Drita",
      contactLastName: "Krasniqi-Berisha",
      contactEmail: email.toUpperCase(),
      contactPhone: newPhone,
    });
    expect(
      await prisma.customer.findUniqueOrThrow({ where: { id: ids.customer } })
    ).toEqual(before);
  });

  it("reports the difference in the detail read", async () => {
    const { reservation } = await createReservation(
      booking({
        firstName: "Drita",
        lastName: "Krasniqi",
        email,
        phone: newPhone,
      })
    );

    const detail = await getReservationDetail(reservation.id);
    expect(detail.contactDifference).toEqual({
      submitted: {
        firstName: "Drita",
        lastName: "Krasniqi",
        email,
        phone: newPhone,
      },
      onFile: {
        firstName: "Drita",
        lastName: "Krasniqi",
        email,
        phone: storedPhone,
      },
      name: false,
      email: false,
      phone: true,
    });
    // The raw columns stay on the server; the drawer gets the comparison.
    expect(detail).not.toHaveProperty("contactPhone");
  });

  it("reports nothing when the details match the file in another format", async () => {
    const national = `0${storedPhone.replace("+383 ", "")}`;
    const { reservation } = await createReservation(
      booking({
        firstName: "DRITA",
        lastName: " krasniqi",
        email,
        phone: national,
      })
    );

    const detail = await getReservationDetail(reservation.id);
    expect(detail.contactDifference).toBeNull();
  });

  it("reports nothing for a reservation without a snapshot", async () => {
    const created = await prisma.reservation.create({
      data: {
        vehicleId: ids.vehicle,
        customerId: ids.customer,
        pickupDate: new Date("2029-03-01T10:00:00.000Z"),
        returnDate: new Date("2029-03-03T10:00:00.000Z"),
        totalPrice: 60,
      },
    });
    const detail = await getReservationDetail(created.id);
    expect(detail.contactDifference).toBeNull();
  });
});

describe("copying the submitted details onto the customer", () => {
  it("updates the customer and keeps their notes", async () => {
    const { reservation } = await createReservation(
      booking({
        firstName: "Drita",
        lastName: "Berisha",
        email,
        phone: newPhone,
      })
    );
    const { contactDifference, customer } = await getReservationDetail(
      reservation.id
    );
    expect(contactDifference).not.toBeNull();

    // The same path the drawer's button takes: customerSchema, then the
    // staff-only service the edit form already uses.
    await updateCustomer(
      customer.id,
      customerSchema.parse(
        submittedContactAsCustomerInput(contactDifference!, customer.notes)
      ),
      actor
    );

    const after = await prisma.customer.findUniqueOrThrow({
      where: { id: ids.customer },
    });
    expect(after).toMatchObject({
      firstName: "Drita",
      lastName: "Berisha",
      email,
      phone: newPhone,
      notes: "Prefers a morning pickup",
    });
    expect(
      (await getReservationDetail(reservation.id)).contactDifference
    ).toBeNull();
  });

  it("still surfaces a duplicate-email conflict", async () => {
    const { reservation } = await createReservation(
      booking({
        firstName: "Drita",
        lastName: "Berisha",
        email,
        phone: `+383 43 ${digits()}`,
      })
    );
    // Staff have since moved the customer to another address, so copying the
    // submitted one back would collide with the record that now owns it.
    await prisma.customer.update({
      where: { id: ids.customer },
      data: { email: `moved-${suffix}@example.test` },
    });
    await prisma.customer.update({
      where: { id: ids.other },
      data: { email },
    });

    const { contactDifference, customer } = await getReservationDetail(
      reservation.id
    );
    expect(contactDifference?.email).toBe(true);

    await expect(
      updateCustomer(
        customer.id,
        customerSchema.parse(
          submittedContactAsCustomerInput(contactDifference!, customer.notes)
        ),
        actor
      )
    ).rejects.toSatisfy(
      (error) =>
        error instanceof ConflictError &&
        error.message === "Another customer already uses this email"
    );
  });
});
