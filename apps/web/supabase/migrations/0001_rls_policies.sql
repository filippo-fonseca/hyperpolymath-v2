-- Enable RLS on every public table
ALTER TABLE public.users              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.areas              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.captures           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hashtags           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks_projects     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.captures_projects  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.captures_hashtags  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kiwi_events        ENABLE ROW LEVEL SECURITY;

-- users: row.id = auth.uid()
CREATE POLICY "users own self" ON public.users
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = id)
  WITH CHECK ((SELECT auth.uid()) = id);

-- Standard pattern for primary user-scoped tables: row.user_id = auth.uid()
-- (SELECT auth.uid()) wrapper is the Supabase RLS perf must-have — caches per query
CREATE POLICY "areas owner" ON public.areas
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "projects owner" ON public.projects
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "tasks owner" ON public.tasks
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "captures owner" ON public.captures
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "hashtags owner" ON public.hashtags
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- Junction tables use denormalized user_id directly (D-03; sidesteps recursive lookup)
CREATE POLICY "tasks_projects owner" ON public.tasks_projects
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "captures_projects owner" ON public.captures_projects
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "captures_hashtags owner" ON public.captures_hashtags
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "kiwi_events owner" ON public.kiwi_events
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
