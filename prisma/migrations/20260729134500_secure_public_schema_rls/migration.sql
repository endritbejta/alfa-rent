-- Alfa Rent accesses Postgres only through its trusted server-side Prisma
-- connection. Supabase's Data API roles must not be able to reach these
-- tables directly.

ALTER TABLE public."_prisma_migrations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."customers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."inspection_photos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."rate_limits" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."rental_inspections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."repairs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."reservations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."vehicle_images" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."vehicles" ENABLE ROW LEVEL SECURITY;

-- Supabase projects define these roles, while a plain local Postgres database
-- may not. Keep the migration portable without weakening production.
DO $security$
DECLARE
  api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format(
        'REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM %I',
        api_role
      );
      EXECUTE format(
        'REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM %I',
        api_role
      );

      -- Prisma migrations run as the same database role that creates future
      -- tables, so remove Supabase's permissive defaults for that owner.
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL PRIVILEGES ON TABLES FROM %I',
        current_user,
        api_role
      );
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL PRIVILEGES ON SEQUENCES FROM %I',
        current_user,
        api_role
      );
    END IF;
  END LOOP;
END
$security$;
