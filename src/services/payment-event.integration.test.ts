import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { applyPaymentEvent } from "@/services/payment.service";

/**
 * The payment ledger is inert today (no provider adapter is registered), but
 * applyPaymentEvent is reachable the moment one is. This pins the transition
 * the status table explicitly allows -- FAILED -> SUCCEEDED, a customer
 * retrying successfully -- because the failure fields were passed as
 * possibly-undefined and Prisma reads undefined as "leave unchanged". A paid
 * booking kept the earlier decline reason attached.
 */
const suffix = randomUUID().slice(0, 8);
const ids = {
  customer: `pay-customer-${suffix}`,
  vehicle: `pay-vehicle-${suffix}`,
  reservation: `pay-reservation-${suffix}`,
  payment: `pay-payment-${suffix}`,
};
const providerPaymentId = `provider-${suffix}`;

beforeAll(async () => {
  await prisma.customer.create({
    data: {
      id: ids.customer,
      firstName: "Pay",
      lastName: "Tester",
      email: `pay-${suffix}@example.test`,
      phone: "-",
    },
  });
  await prisma.vehicle.create({
    data: {
      id: ids.vehicle,
      slug: `pay-car-${suffix}`,
      brand: "Test",
      model: "Payment",
      year: 2027,
      category: "SEDAN",
      transmission: "AUTOMATIC",
      fuelType: "PETROL",
      seats: 5,
      pricePerDay: 40,
      description: "Integration-test vehicle for payment events.",
    },
  });
  await prisma.reservation.create({
    data: {
      id: ids.reservation,
      vehicleId: ids.vehicle,
      customerId: ids.customer,
      pickupDate: new Date("2027-09-01T10:00:00.000Z"),
      returnDate: new Date("2027-09-05T10:00:00.000Z"),
      status: "PENDING",
      totalPrice: 160,
    },
  });
  await prisma.payment.create({
    data: {
      id: ids.payment,
      reservationId: ids.reservation,
      provider: "test",
      idempotencyKey: `idem-${suffix}`,
      providerPaymentId,
      amount: 160,
      status: "FAILED",
      failureCode: "card_declined",
      failureMessage: "The card was declined",
      lastEventAt: new Date("2027-08-01T10:00:00.000Z"),
    },
  });
});

afterAll(async () => {
  await prisma.paymentEvent.deleteMany({
    where: { payment: { id: ids.payment } },
  });
  await prisma.payment.deleteMany({ where: { id: ids.payment } });
  await prisma.reservation.deleteMany({ where: { id: ids.reservation } });
  await prisma.vehicle.deleteMany({ where: { id: ids.vehicle } });
  await prisma.customer.deleteMany({ where: { id: ids.customer } });
  await prisma.$disconnect();
});

describe("a retry that succeeds after a failure", () => {
  it("clears the earlier decline reason instead of carrying it forward", async () => {
    const updated = await applyPaymentEvent({
      providerEventId: `evt-${suffix}`,
      providerPaymentId,
      type: "payment.succeeded",
      status: "SUCCEEDED",
      occurredAt: new Date("2027-08-02T10:00:00.000Z"),
    });

    expect(updated?.status).toBe("SUCCEEDED");
    expect(updated?.failureCode).toBeNull();
    expect(updated?.failureMessage).toBeNull();
    expect(updated?.paidAt).not.toBeNull();
  });
});
