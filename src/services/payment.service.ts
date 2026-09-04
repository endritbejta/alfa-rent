import { randomUUID } from "node:crypto";
import type { Payment, PaymentStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  ConflictError,
  NotFoundError,
  ServiceUnavailableError,
} from "@/lib/errors";
import {
  getPaymentRuntimeConfig,
  PAYMENT_CURRENCY,
} from "@/lib/payments/config";
import { verifyPaymentAccessToken } from "@/lib/payments/access-token";
import type { PaymentWebhookEvent } from "@/lib/payments/provider";
import { getPaymentProvider } from "@/lib/payments/registry";
import { canApplyPaymentStatus } from "@/lib/payments/status";
import { reportError } from "@/lib/observability";

const REUSABLE_CHECKOUT_STATUSES: PaymentStatus[] = ["PENDING", "PROCESSING"];

export type CheckoutResult = {
  paymentId: string;
  status: PaymentStatus;
  checkoutUrl: string;
  expiresAt: Date | null;
};

function amountToMinorUnits(amount: { toFixed(digits: number): string }) {
  const value = Number(amount.toFixed(2));
  const minor = Math.round(value * 100);
  if (!Number.isSafeInteger(minor) || minor <= 0) {
    throw new ConflictError("Reservation total is not payable");
  }
  return minor;
}

function reusableCheckout(payment: Payment | null): CheckoutResult | null {
  if (
    !payment?.checkoutUrl ||
    (payment.expiresAt && payment.expiresAt <= new Date())
  ) {
    return null;
  }
  return {
    paymentId: payment.id,
    status: payment.status,
    checkoutUrl: payment.checkoutUrl,
    expiresAt: payment.expiresAt,
  };
}

/**
 * Creates a hosted bank checkout. The reservation price is always loaded
 * server-side; callers cannot choose the amount or currency.
 */
export async function createPaymentCheckout(
  reservationId: string,
  accessToken: string
): Promise<CheckoutResult> {
  const runtime = getPaymentRuntimeConfig();
  const provider = getPaymentProvider(runtime.provider);

  const reservation = await prisma.reservation.findUnique({
    where: { id: reservationId },
    include: {
      customer: {
        select: {
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
        },
      },
    },
  });
  if (
    !reservation?.paymentAccessTokenHash ||
    !verifyPaymentAccessToken(accessToken, reservation.paymentAccessTokenHash)
  ) {
    // Use the same response for an unknown reservation and a bad token so the
    // endpoint cannot be used to discover valid booking references.
    throw new NotFoundError("Reservation");
  }
  if (!["PENDING", "CONFIRMED"].includes(reservation.status)) {
    throw new ConflictError(
      "Only pending or confirmed reservations can be paid online"
    );
  }

  const existing = await prisma.payment.findFirst({
    where: {
      reservationId,
      provider: provider.id,
      status: { in: REUSABLE_CHECKOUT_STATUSES },
    },
    orderBy: { createdAt: "desc" },
  });
  const reusable = reusableCheckout(existing);
  if (reusable) return reusable;

  const payment = await prisma.payment.create({
    data: {
      reservationId,
      provider: provider.id,
      idempotencyKey: randomUUID(),
      amount: reservation.totalPrice,
      currency: PAYMENT_CURRENCY,
    },
  });

  try {
    const checkout = await provider.createCheckout({
      paymentId: payment.id,
      reservationId,
      idempotencyKey: payment.idempotencyKey,
      amountMinor: amountToMinorUnits(payment.amount),
      currency: PAYMENT_CURRENCY,
      description: `Alfa Rent reservation ${reservationId}`,
      customer: reservation.customer,
      returnUrl: `${runtime.returnUrl}&paymentId=${encodeURIComponent(payment.id)}`,
      cancelUrl: `${runtime.cancelUrl}&paymentId=${encodeURIComponent(payment.id)}`,
      webhookUrl: runtime.webhookUrl,
    });

    const updated = await prisma.payment.update({
      where: { id: payment.id },
      data: {
        providerPaymentId: checkout.providerPaymentId,
        checkoutUrl: checkout.checkoutUrl,
        expiresAt: checkout.expiresAt,
        status: "PROCESSING",
      },
    });
    return {
      paymentId: updated.id,
      status: updated.status,
      checkoutUrl: updated.checkoutUrl!,
      expiresAt: updated.expiresAt,
    };
  } catch (error) {
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: "FAILED",
        failureCode: "CHECKOUT_CREATION_FAILED",
        failureMessage: "The bank checkout could not be created",
      },
    });
    reportError(error, {
      scope: "payment-checkout",
      reservationId,
      paymentId: payment.id,
    });
    throw new ServiceUnavailableError(
      "The bank checkout is temporarily unavailable. No payment was taken."
    );
  }
}

/**
 * Applies an already authenticated, normalized provider event exactly once.
 * Reservation confirmation remains a staff decision and is intentionally not
 * coupled to payment settlement.
 */
export async function applyPaymentEvent(event: PaymentWebhookEvent) {
  return prisma.$transaction(async (tx) => {
    const duplicate = await tx.paymentEvent.findUnique({
      where: { providerEventId: event.providerEventId },
      select: { paymentId: true },
    });
    if (duplicate) {
      return tx.payment.findUnique({ where: { id: duplicate.paymentId } });
    }

    const payment = await tx.payment.findUnique({
      where: { providerPaymentId: event.providerPaymentId },
    });
    if (!payment) throw new NotFoundError("Payment");

    await tx.paymentEvent.create({
      data: {
        paymentId: payment.id,
        providerEventId: event.providerEventId,
        type: event.type,
        status: event.status,
        occurredAt: event.occurredAt,
      },
    });

    const isOlder =
      payment.lastEventAt && event.occurredAt < payment.lastEventAt;
    if (isOlder || !canApplyPaymentStatus(payment.status, event.status)) {
      return payment;
    }

    return tx.payment.update({
      where: { id: payment.id },
      data: {
        status: event.status,
        lastEventAt: event.occurredAt,
        // Left undefined on a non-success event on purpose: a payment that
        // already settled keeps the moment it settled.
        paidAt: event.status === "SUCCEEDED" ? event.occurredAt : undefined,
        // `?? null`, not the bare value. These describe the *current* status,
        // and Prisma reads undefined as "leave unchanged" — so a
        // FAILED → SUCCEEDED transition (which the status table allows) would
        // otherwise keep the old decline reason attached to a paid booking.
        failureCode: event.failureCode ?? null,
        failureMessage: event.failureMessage ?? null,
      },
    });
  });
}

export async function processPaymentWebhook(input: {
  headers: Headers;
  rawBody: string;
}) {
  const runtime = getPaymentRuntimeConfig();
  const provider = getPaymentProvider(runtime.provider);
  const event = await provider.parseAndVerifyWebhook(input);
  return applyPaymentEvent(event);
}
