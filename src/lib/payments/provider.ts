import type { PaymentStatus } from "@prisma/client";

export type PaymentCustomer = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
};

export type CreateCheckoutInput = {
  paymentId: string;
  reservationId: string;
  idempotencyKey: string;
  amountMinor: number;
  currency: "EUR";
  description: string;
  customer: PaymentCustomer;
  returnUrl: string;
  cancelUrl: string;
  webhookUrl: string;
};

export type CreatedCheckout = {
  providerPaymentId: string;
  checkoutUrl: string;
  expiresAt?: Date;
};

export type PaymentWebhookEvent = {
  providerEventId: string;
  providerPaymentId: string;
  type: string;
  status: PaymentStatus;
  occurredAt: Date;
  failureCode?: string;
  failureMessage?: string;
};

/**
 * The only bank-specific seam in the payment flow. A future adapter owns
 * authentication, request signing, response validation, and webhook
 * signature verification. The rest of the application only sees normalized
 * checkout and event data.
 */
export interface PaymentProvider {
  readonly id: string;

  createCheckout(input: CreateCheckoutInput): Promise<CreatedCheckout>;

  parseAndVerifyWebhook(input: {
    headers: Headers;
    rawBody: string;
  }): Promise<PaymentWebhookEvent>;
}
