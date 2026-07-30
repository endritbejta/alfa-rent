import { ServiceUnavailableError } from "@/lib/errors";
import type { PaymentProvider } from "@/lib/payments/provider";

type ProviderFactory = () => PaymentProvider;
const providerFactories = new Map<string, ProviderFactory>();

/**
 * Bank adapters register here once their SDK/protocol is known. Keeping an
 * explicit registry prevents a typo in PAYMENT_PROVIDER from silently
 * selecting the wrong processor.
 */
export function registerPaymentProvider(id: string, factory: ProviderFactory) {
  providerFactories.set(id, factory);
}

export function getPaymentProvider(id: string): PaymentProvider {
  const factory = providerFactories.get(id);
  if (!factory) {
    throw new ServiceUnavailableError(
      `Payment provider "${id}" has not been integrated yet.`
    );
  }
  return factory();
}
