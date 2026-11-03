-- A booking request that times out on the customer's side may still have
-- committed on ours, and the customer's natural move is to press Send again.
-- Without a key that second press is a second PENDING reservation in the
-- staff queue. The client now names each submission; a retry carrying the
-- same name finds the reservation the first attempt made.
--
-- Nullable, because staff bookings made before this and API callers that send
-- no key have none. Postgres treats NULLs as distinct, so the unique index
-- only ever constrains real keys. The index is also what settles two
-- concurrent requests with one key: the second insert waits on the first and
-- then fails, and the service answers it with the winner's reservation.
--
-- Additive only: no RLS change is needed, since reservations already has row
-- level security enabled and a new column inherits it.
ALTER TABLE "reservations" ADD COLUMN "idempotencyKey" TEXT;

CREATE UNIQUE INDEX "reservations_idempotencyKey_key"
  ON "reservations"("idempotencyKey");
