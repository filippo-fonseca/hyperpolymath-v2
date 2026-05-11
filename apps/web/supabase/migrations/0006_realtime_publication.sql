-- Phase 3 Realtime: register every Phase 3 table with the supabase_realtime
-- publication. Without this, Supabase Realtime does not broadcast
-- postgres_changes events at all. RLS still gates broadcasts per the
-- user_id=eq.<uid> filter applied by useTableSubscription, so adding tables
-- here does NOT widen access — it only enables the broadcast pipeline.
--
-- Rationale: required so useTableSubscription's `postgres_changes` listeners
-- ever fire. Verified by tests/realtime-rls.test.ts (positive control inserts
-- as User A and asserts the channel receives the INSERT event).

ALTER PUBLICATION supabase_realtime ADD TABLE
  public.areas,
  public.projects,
  public.tasks,
  public.captures,
  public.hashtags,
  public.captures_hashtags,
  public.captures_projects,
  public.tasks_projects;
