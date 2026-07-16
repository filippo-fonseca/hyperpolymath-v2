-- 0051 — grant the Supabase API roles table privileges.
--
-- WHY LOCAL DEV NEEDED THIS AND PRODUCTION DID NOT
--
-- Supabase's access model is two locks, not one: a SQL GRANT opens the door,
-- and RLS decides which rows you see once inside. Migrations here create tables
-- but never GRANT, so the API roles were missing the first lock entirely.
--
-- In the CLOUD project this is invisible: `ALTER DEFAULT PRIVILEGES` is set up
-- so anything created in `public` is granted to anon/authenticated/service_role
-- automatically. Locally the CLI stack configures those default privileges
-- differently. The `postgres` role (which is what the migration runner uses)
-- grants only Dxtm to anon:
--
--   postgres|r|{postgres=arwdDxtm/postgres,anon=Dxtm/postgres,...}
--                                              ^^^^
--   D=TRUNCATE  x=REFERENCES  t=TRIGGER  m=MAINTAIN
--
-- That is TRUNCATE and TRIGGER but no SELECT, INSERT, UPDATE, or DELETE. Which
-- is why a blanket `GRANT ALL` appears to do nothing useful here: it lands the
-- privileges that were already there and none of the ones you wanted. The DML
-- privileges have to be named explicitly.
--
-- The symptom was /api/health reporting `supabase: down` on every fresh
-- `supabase start`, because the probe does `supabase.from("users").select()` as
-- anon and got `42501 permission denied`. It was fixed by hand each time, and
-- the fix died with the next `supabase stop`. This migration ends that loop.
--
-- WHY THIS IS SAFE
--
-- It is safe ONLY because 0050 put RLS on all 55 public tables first. Granting
-- without that would publish the database. With RLS on:
--   - owner-scoped tables return only `user_id = auth.uid()` rows;
--   - internal tables (agentmail_ingest_events, cron_runs) have RLS and NO
--     policies, so anon and authenticated get zero rows, deny-by-default;
--   - `postgres` and `service_role` carry BYPASSRLS and are unaffected.
--
-- Order matters. Never move this above 0050.
--
-- On production this is a no-op: the default privileges already granted a
-- superset. It is kept in both directories anyway so the two describe the same
-- database, per the rule in 0049.

-- Existing tables.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES    IN SCHEMA public TO anon, authenticated, service_role;
--> statement-breakpoint
GRANT USAGE, SELECT                  ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
--> statement-breakpoint

-- Future tables, so the next migration to add one does not reopen this hole.
-- Set for both role identities that create objects here.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon, authenticated, service_role;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO anon, authenticated, service_role;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon, authenticated, service_role;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO anon, authenticated, service_role;
--> statement-breakpoint

-- PostgREST caches the schema; without this the grants are invisible until the
-- container restarts.
NOTIFY pgrst, 'reload schema';
