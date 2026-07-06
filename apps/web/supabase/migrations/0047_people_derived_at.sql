-- 0046 — Linked-people derivation marker on captures + tasks (mirror of drizzle/0029).
--
-- Adds a nullable `people_derived_at timestamptz` to both `captures` and
-- `tasks`. It marks whether the entity's text has been scanned for references
-- to the user's known people (the auto-derive + Haiku smart-match lifecycle in
-- lib/people/derive.ts). NULL = never derived; non-null = already derived. The
-- lazy view-time backfill fires only while it is NULL, so the model call runs
-- at most once per entity. Additive + idempotent; existing rows get NULL and
-- are otherwise untouched. People links themselves live in `people_references`
-- (no schema change there — the join already supports from_type in
-- ('capture','task')).
ALTER TABLE public.captures ADD COLUMN IF NOT EXISTS people_derived_at timestamp with time zone;
--> statement-breakpoint
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS people_derived_at timestamp with time zone;
