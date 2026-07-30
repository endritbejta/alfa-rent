-- Provider-neutral payment ledger. No cardholder or card data belongs here.
CREATE TYPE "PaymentStatus" AS ENUM (
  'PENDING',
  'PROCESSING',
  'SUCCEEDED',
  'FAILED',
  'CANCELLED',
  'EXPIRED'
);

ALTER TABLE "reservations" ADD COLUMN "paymentAccessTokenHash" TEXT;
CREATE UNIQUE INDEX "reservations_paymentAccessTokenHash_key"
  ON "reservations"("paymentAccessTokenHash");

CREATE TABLE "payments" (
  "id" TEXT NOT NULL,
  "reservationId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "providerPaymentId" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
  "amount" DECIMAL(10,2) NOT NULL,
  "currency" VARCHAR(3) NOT NULL DEFAULT 'EUR',
  "checkoutUrl" TEXT,
  "expiresAt" TIMESTAMP(3),
  "paidAt" TIMESTAMP(3),
  "lastEventAt" TIMESTAMP(3),
  "failureCode" TEXT,
  "failureMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payment_events" (
  "id" TEXT NOT NULL,
  "paymentId" TEXT NOT NULL,
  "providerEventId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "status" "PaymentStatus" NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "payment_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payments_providerPaymentId_key"
  ON "payments"("providerPaymentId");
CREATE UNIQUE INDEX "payments_idempotencyKey_key"
  ON "payments"("idempotencyKey");
CREATE INDEX "payments_reservationId_createdAt_idx"
  ON "payments"("reservationId", "createdAt");
CREATE INDEX "payments_status_idx" ON "payments"("status");
CREATE UNIQUE INDEX "payment_events_providerEventId_key"
  ON "payment_events"("providerEventId");
CREATE INDEX "payment_events_paymentId_occurredAt_idx"
  ON "payment_events"("paymentId", "occurredAt");

ALTER TABLE "payments"
  ADD CONSTRAINT "payments_reservationId_fkey"
  FOREIGN KEY ("reservationId") REFERENCES "reservations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payment_events"
  ADD CONSTRAINT "payment_events_paymentId_fkey"
  FOREIGN KEY ("paymentId") REFERENCES "payments"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Match the existing Supabase security posture: only trusted server-side
-- Prisma access is allowed.
ALTER TABLE public."payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."payment_events" ENABLE ROW LEVEL SECURITY;

DO $security$
DECLARE
  api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format(
        'REVOKE ALL PRIVILEGES ON TABLE public.payments, public.payment_events FROM %I',
        api_role
      );
    END IF;
  END LOOP;
END
$security$;
