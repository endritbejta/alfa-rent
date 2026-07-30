import { ValidationError } from "@/lib/errors";
import { ok, withErrorHandling } from "@/lib/api";
import { processPaymentWebhook } from "@/services/payment.service";

const MAX_WEBHOOK_BYTES = 256 * 1024;

export const POST = withErrorHandling(async (request: Request) => {
  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > MAX_WEBHOOK_BYTES) {
    throw new ValidationError("Webhook body is too large");
  }

  const payment = await processPaymentWebhook({
    headers: request.headers,
    rawBody,
  });
  return ok({ received: true, paymentId: payment?.id });
});
