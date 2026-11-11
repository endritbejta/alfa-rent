-- Staff account management (audit finding P1-1).
--
-- An admin who creates an account or resets a password knows the temporary
-- password they typed, so the holder is made to replace it on first sign-in.
--
-- Additive only, and the default is false, so every existing account keeps
-- signing in exactly as before. users already has row-level security from
-- 20260729134500_secure_public_schema_rls; adding a column does not change it.
--
-- Hand-written and applied with `prisma migrate deploy`. Never generate this
-- with `migrate dev`: it would also drop the objects schema.prisma does not
-- model (see AGENTS.md).
ALTER TABLE "users"
  ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
