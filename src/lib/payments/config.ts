import { ServiceUnavailableError } from "@/lib/errors";

export const PAYMENT_CURRENCY = "EUR" as const;

export type PaymentRuntimeConfig = {
  provider: string;
  returnUrl: string;
  cancelUrl: string;
  webhookUrl: string;
};

export function paymentsAreEnabled() {
  return process.env.PAYMENTS_ENABLED === "true";
}

/**
 * Secrets stay server-only. No payment setting should use NEXT_PUBLIC_.
 * URL validation happens at request time so builds can run while the feature
 * remains disabled and unconfigured.
 */
export function getPaymentRuntimeConfig(): PaymentRuntimeConfig {
  if (!paymentsAreEnabled()) {
    throw new ServiceUnavailableError(
      "Online payment is not enabled. Your reservation can still be submitted without payment."
    );
  }

  const provider = process.env.PAYMENT_PROVIDER?.trim();
  const appUrl =
    process.env.PAYMENT_APP_URL?.trim() || process.env.AUTH_URL?.trim();
  if (!provider || !appUrl) {
    throw new ServiceUnavailableError(
      "Online payment is enabled but its provider or application URL is missing."
    );
  }

  let baseUrl: URL;
  try {
    baseUrl = new URL(appUrl);
  } catch {
    throw new ServiceUnavailableError(
      "Online payment is enabled but PAYMENT_APP_URL is invalid."
    );
  }
  if (process.env.NODE_ENV === "production" && baseUrl.protocol !== "https:") {
    throw new ServiceUnavailableError(
      "Online payment requires an HTTPS application URL in production."
    );
  }

  return {
    provider,
    returnUrl: new URL("/booking?payment=return", baseUrl).toString(),
    cancelUrl: new URL("/booking?payment=cancelled", baseUrl).toString(),
    webhookUrl: new URL("/api/payments/webhook", baseUrl).toString(),
  };
}
