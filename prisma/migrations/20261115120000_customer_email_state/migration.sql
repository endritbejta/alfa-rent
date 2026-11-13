-- Customer booking emails (audit finding P2-13). Two additive, nullable
-- columns on reservations; nothing existing changes meaning.
--
--   "locale"             The storefront language the request was made in
--                        ('sq' or 'en'), so every later email about it is
--                        written in the language the customer chose, even
--                        when staff act on it from an Albanian admin. Null
--                        for staff bookings and everything created before
--                        this column; those fall back to the default
--                        language. Not personal data, so anonymisation
--                        leaves it.
--   "expiryNotifiedAt"   When the customer was told their request lapsed
--                        unanswered. Expiry is derived from the dates and
--                        never stored (see isExpiredRequest), so this is the
--                        only record that the email went out: the daily
--                        sweep claims a row by setting it, which makes the
--                        email at-most-once even if two sweeps overlap, and
--                        a later staff cancellation does not tell the
--                        customer a second time.
--
-- No CHECK on "locale": the app validates it on read and treats anything
-- unknown as the default, and a constraint schema.prisma cannot model is one
-- more object a `migrate dev` would silently drop. Written by hand like every
-- migration here (see AGENTS.md).
ALTER TABLE "reservations"
  ADD COLUMN "locale" TEXT,
  ADD COLUMN "expiryNotifiedAt" TIMESTAMP(3);
