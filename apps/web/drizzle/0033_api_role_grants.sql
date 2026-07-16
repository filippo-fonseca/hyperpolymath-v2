-- 0033 — mirror of supabase/migrations/0051_api_role_grants.sql.
--
-- No-op on production (default privileges already grant a superset), kept for
-- parity so the two migration dirs describe the same database.

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
