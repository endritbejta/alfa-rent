# Online payment integration

The application has a provider-neutral payment ledger and hosted-checkout
workflow, but online payment is disabled until a Kosovo bank supplies its
gateway documentation and test credentials.

## What is ready

- `Payment` and `PaymentEvent` records for reconciliation and idempotent
  webhook processing.
- `POST /api/payments/checkout`, with server-owned EUR amounts and rate
  limiting. It requires the customer-held payment access token returned with
  the booking, so a visible reservation reference is not sufficient.
- `POST /api/payments/webhook`, with a raw request body reserved for the
  provider's signature verification.
- Strict payment state transitions that prevent a successful payment from
  being downgraded by a late event.
- A server-only provider contract in `src/lib/payments/provider.ts`.
- A feature flag, so the existing reservation-without-payment flow remains
  unchanged until the gateway is verified.

No card number, CVV, bank access token, or raw webhook payload is stored.
Payment success also does not automatically confirm vehicle availability;
staff confirmation remains a separate reservation lifecycle step.

## When the bank gateway arrives

1. Obtain the bank's sandbox API documentation, test merchant account,
   signing keys, supported TLS requirements, and webhook IP/signature rules.
2. Implement `PaymentProvider` in a server-only module. The adapter must:
   create a hosted checkout; authenticate/sign outgoing requests; validate
   response URLs and identifiers; verify the webhook signature against the
   unmodified `rawBody`; and normalize bank statuses into `PaymentStatus`.
3. Register the adapter with `registerPaymentProvider("bank-id", factory)`.
4. Set `PAYMENT_PROVIDER=bank-id`, `PAYMENT_APP_URL` to the public HTTPS
   origin, the bank-specific secrets, and finally `PAYMENTS_ENABLED=true`.
5. Apply the Prisma migration, run sandbox checkout/webhook tests, and test
   duplicate and out-of-order webhooks before showing a payment option in the
   booking form.

The bank adapter should use an explicit HTTP timeout, never log secrets or
full gateway responses, and use `idempotencyKey` whenever the bank supports
idempotent checkout creation.
