-- Who did what, when, and why (audit finding P2-7).
--
-- One row per staff write, inserted in the same transaction as the change it
-- describes, so a change that rolls back leaves no event and an event can
-- never describe a change that did not happen.
--
-- "before" / "after" hold only the fields that changed, never a whole row:
-- a password hash, a token or a customer's details that were not part of the
-- change have no business in a log that outlives them.
--
-- "entityId" is deliberately not a foreign key. The history of a vehicle or
-- customer that was deleted (or merged away) is the history most worth
-- keeping.
--
-- Written by hand like every migration here: `migrate dev` would drop the
-- objects schema.prisma does not model (see AGENTS.md).
CREATE TABLE "audit_events" (
  "id"        TEXT         NOT NULL,
  "actorId"   TEXT,
  -- True for an event with no person behind it. Kept apart from a NULL
  -- "actorId", which also means "that person's account was removed".
  "system"    BOOLEAN      NOT NULL DEFAULT false,
  "action"    TEXT         NOT NULL,
  "entity"    TEXT         NOT NULL,
  "entityId"  TEXT         NOT NULL,
  "before"    JSONB,
  "after"     JSONB,
  "reason"    TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- An entity's history, newest first: the drawer's only query.
CREATE INDEX "audit_events_entity_entityId_createdAt_idx"
  ON "audit_events"("entity", "entityId", "createdAt");

-- "What has this person done?"
CREATE INDEX "audit_events_actorId_idx" ON "audit_events"("actorId");

-- SET NULL rather than RESTRICT or CASCADE: a staff account removed outright
-- must neither be undeletable because it once did something, nor take its
-- history with it. The event stays and reads "a removed staff member".
-- A NULL actor is also how a system event (no person) is recorded.
ALTER TABLE "audit_events"
  ADD CONSTRAINT "audit_events_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Append-only, enforced by a trigger rather than by REVOKE.
--
-- The app connects as the role that owns the tables (on Supabase and
-- locally), and `prisma migrate deploy` runs as that same role. Revoking
-- UPDATE/DELETE from the owner is not a boundary: the owner can grant them
-- straight back. Worse, two legitimate writes must still be allowed, and a
-- privilege cannot tell them apart from tampering:
--
--   1. The foreign key above. Removing a user rewrites "actorId" to NULL.
--      Allowed only when that is the sole change.
--   2. Anonymisation (audit P1-5). Erasing a customer must also erase the
--      personal data earlier events hold about them, or this log quietly
--      undoes the erasure. Allowed only inside a transaction that has set
--      alfa_rent.audit_scrub, and only as a removal: "before" / "after" may
--      lose keys but not gain or change any (the old value must contain the
--      new one), and "reason" may only be cleared. Who, what, which record
--      and when can never change.
--
-- Everything else — any other UPDATE, every DELETE, TRUNCATE — is refused.
-- This guards against the application, a script or a hurried manual query
-- rewriting history. It is not a defence against someone who holds the
-- owner role: they can disable the trigger. That is deliberate and visible
-- (it is DDL), which is the point.
CREATE FUNCTION "audit_events_append_only"() RETURNS trigger
LANGUAGE plpgsql AS $audit$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW."id" = OLD."id"
     AND NEW."action" = OLD."action"
     AND NEW."entity" = OLD."entity"
     AND NEW."entityId" = OLD."entityId"
     AND NEW."createdAt" = OLD."createdAt"
     AND NEW."system" = OLD."system"
  THEN
    -- 1. ON DELETE SET NULL of the actor, and nothing else.
    IF OLD."actorId" IS NOT NULL
       AND NEW."actorId" IS NULL
       AND NEW."before" IS NOT DISTINCT FROM OLD."before"
       AND NEW."after" IS NOT DISTINCT FROM OLD."after"
       AND NEW."reason" IS NOT DISTINCT FROM OLD."reason"
    THEN
      RETURN NEW;
    END IF;

    -- 2. The anonymisation scrub: content may only shrink.
    IF current_setting('alfa_rent.audit_scrub', true) = 'on'
       AND NEW."actorId" IS NOT DISTINCT FROM OLD."actorId"
       AND (NEW."before" IS NULL OR OLD."before" @> NEW."before")
       AND (NEW."after" IS NULL OR OLD."after" @> NEW."after")
       AND (NEW."reason" IS NULL OR NEW."reason" = OLD."reason")
    THEN
      RETURN NEW;
    END IF;
  END IF;

  RAISE EXCEPTION 'audit_events is append-only: % refused', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END
$audit$;

CREATE TRIGGER "audit_events_append_only"
  BEFORE UPDATE OR DELETE ON "audit_events"
  FOR EACH ROW EXECUTE FUNCTION "audit_events_append_only"();

CREATE TRIGGER "audit_events_no_truncate"
  BEFORE TRUNCATE ON "audit_events"
  FOR EACH STATEMENT EXECUTE FUNCTION "audit_events_append_only"();

-- Match the existing Supabase security posture: only trusted server-side
-- Prisma access is allowed.
ALTER TABLE public."audit_events" ENABLE ROW LEVEL SECURITY;

DO $security$
DECLARE
  api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format(
        'REVOKE ALL PRIVILEGES ON TABLE public.audit_events FROM %I',
        api_role
      );
    END IF;
  END LOOP;
END
$security$;
