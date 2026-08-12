-- 0044 — XP / leveling system. Issue #345.
--
-- Three tables and one award function, wired to the existing user-state tables
-- by AFTER triggers.
--
--   xp_rules   — what each kind of event is worth, and its daily ceiling.
--                Seeded here; the app reads it rather than hardcoding amounts.
--   xp_events  — the immutable ledger. One row per award, carrying the kind,
--                the amount, and a dedupe key.
--   user_xp    — the running total plus streak bookkeeping, maintained by a
--                trigger on xp_events so it can never drift from the ledger.
--
-- WHY TRIGGERS AND NOT APPLICATION CODE. Writes reach these tables from at
-- least four surfaces: the server actions in app/actions/*, the device API at
-- app/api/device/*, the JARVIS executor in lib/jarvis/*, and the email ingest
-- in lib/agentmail/*. An awardXp() helper would need calling from every one of
-- them and would silently stop covering any new surface someone adds later.
-- Migration 0019 already set this precedent with bump_user_state_version().
-- The one action with no table behind it is calendar events (Google Calendar
-- is the store of record), so that single kind is awarded from app code via
-- award_xp() directly.
--
-- FARMING. Every award carries a dedupe key and xp_events has a unique index
-- over (user_id, dedupe_key). Completing a task awards once for that task,
-- forever — un-completing and re-completing it earns nothing. Habits dedupe
-- per habit per day, doc edits per doc per day. On top of that most kinds
-- carry a daily cap. The number is meant to reflect a real day, and it only
-- does that if it cannot be farmed.
--
-- LEVELS ARE NOT STORED. user_xp holds the lifetime total only; the curve that
-- turns a total into a level lives in lib/xp/levels.ts and is unit-tested
-- there. Keeping it in one place means tuning the curve never needs a
-- backfill.
--
-- Idempotent throughout: IF NOT EXISTS on tables/columns/indexes, CREATE OR
-- REPLACE on functions, DROP TRIGGER IF EXISTS before every CREATE TRIGGER,
-- and ON CONFLICT DO NOTHING on the seed rows.

-- ─── 1. Rules ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "xp_rules" (
  "kind"         text PRIMARY KEY,
  "base_amount"  integer NOT NULL,
  -- NULL = uncapped. Only safe for things that are genuinely hard to repeat.
  "daily_cap"    integer,
  "active"       boolean NOT NULL DEFAULT true
);
--> statement-breakpoint

INSERT INTO "xp_rules" ("kind", "base_amount", "daily_cap") VALUES
  ('task.completed',    10,  400),
  ('habit.completed',   15,  200),
  ('habit.streak',      30,  150),
  ('capture.created',    3,   60),
  ('page.created',      25,  150),
  ('page.edited',        5,   50),
  ('project.created',   15,   60),
  ('project.completed',150, NULL),
  ('area.created',      20,   60),
  ('event.created',      4,   60),
  ('jarvis.command',     2,   40),
  ('training.logged',   25,   75),
  ('nutrition.logged',   5,   30),
  ('daily.review',      40,   40),
  ('streak.day',        20,   20)
ON CONFLICT ("kind") DO NOTHING;
--> statement-breakpoint

-- ─── 2. Ledger ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "xp_events" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"     uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "kind"        text NOT NULL,
  "amount"      integer NOT NULL,
  -- Denormalized so the analytics breakdown never needs a join or a lookup
  -- table the app would have to keep in sync.
  "category"    text NOT NULL,
  -- What earned it, for deep-linking out of the activity feed. source_id is
  -- intentionally NOT a foreign key: the ledger is history and must survive
  -- the task or page it refers to being deleted.
  "source_type" text,
  "source_id"   uuid,
  -- The user's local calendar day, resolved through users.timezone. Daily caps
  -- and streaks are both counted against this, not against UTC.
  "local_date"  date NOT NULL,
  "occurred_at" timestamptz NOT NULL DEFAULT now(),
  "dedupe_key"  text NOT NULL,
  "metadata"    jsonb NOT NULL DEFAULT '{}'::jsonb
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "xp_events_user_dedupe_uniq"
  ON "xp_events" ("user_id", "dedupe_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "xp_events_user_occurred_idx"
  ON "xp_events" ("user_id", "occurred_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "xp_events_user_date_idx"
  ON "xp_events" ("user_id", "local_date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "xp_events_user_kind_date_idx"
  ON "xp_events" ("user_id", "kind", "local_date");
--> statement-breakpoint

-- ─── 3. Running total ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "user_xp" (
  "user_id"          uuid PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "total_xp"         bigint  NOT NULL DEFAULT 0,
  "current_streak"   integer NOT NULL DEFAULT 0,
  "longest_streak"   integer NOT NULL DEFAULT 0,
  "last_active_date" date,
  "first_event_at"   timestamptz,
  "updated_at"       timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

-- ─── 4. Helpers ────────────────────────────────────────────────────────────

-- The user's current local date. Falls back to UTC when they have not set a
-- timezone, and again if the stored string is not a valid IANA zone (the
-- column is free text, so a bad value must not take down an unrelated write).
CREATE OR REPLACE FUNCTION public.xp_local_date(p_user_id uuid, p_at timestamptz DEFAULT now())
  RETURNS date
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_tz text;
BEGIN
  SELECT timezone INTO v_tz FROM public.users WHERE id = p_user_id;
  IF v_tz IS NULL OR v_tz = '' THEN
    RETURN (p_at AT TIME ZONE 'UTC')::date;
  END IF;
  RETURN (p_at AT TIME ZONE v_tz)::date;
EXCEPTION WHEN OTHERS THEN
  RETURN (p_at AT TIME ZONE 'UTC')::date;
END;
$$;
--> statement-breakpoint

-- The single entry point for handing out XP.
--
-- Returns the amount actually awarded, which is 0 when the event was a
-- duplicate, the rule is unknown or inactive, or the daily cap is already
-- spent. Partial awards are deliberate: if a cap has 4 XP left and the action
-- is worth 10, you get the 4 rather than nothing.
CREATE OR REPLACE FUNCTION public.award_xp(
  p_user_id     uuid,
  p_kind        text,
  p_dedupe_key  text,
  p_category    text,
  p_source_type text DEFAULT NULL,
  p_source_id   uuid DEFAULT NULL,
  p_amount      integer DEFAULT NULL,
  p_metadata    jsonb DEFAULT '{}'::jsonb,
  p_at          timestamptz DEFAULT now()
)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_rule        public.xp_rules%ROWTYPE;
  v_amount      integer;
  v_local_date  date;
  v_spent_today integer;
  v_headroom    integer;
  v_inserted    uuid;
  v_prev_date   date;
  v_streak      integer;
BEGIN
  IF p_user_id IS NULL OR p_kind IS NULL OR p_dedupe_key IS NULL THEN
    RETURN 0;
  END IF;

  SELECT * INTO v_rule FROM public.xp_rules WHERE kind = p_kind;
  IF NOT FOUND OR NOT v_rule.active THEN
    RETURN 0;
  END IF;

  v_amount := COALESCE(p_amount, v_rule.base_amount);
  IF v_amount <= 0 THEN
    RETURN 0;
  END IF;

  v_local_date := public.xp_local_date(p_user_id, p_at);

  -- Clamp to whatever is left of today's ceiling for this kind.
  IF v_rule.daily_cap IS NOT NULL THEN
    SELECT COALESCE(SUM(amount), 0) INTO v_spent_today
      FROM public.xp_events
     WHERE user_id = p_user_id AND kind = p_kind AND local_date = v_local_date;

    v_headroom := v_rule.daily_cap - v_spent_today;
    IF v_headroom <= 0 THEN
      RETURN 0;
    END IF;
    v_amount := LEAST(v_amount, v_headroom);
  END IF;

  INSERT INTO public.xp_events
    (user_id, kind, amount, category, source_type, source_id, local_date, occurred_at, dedupe_key, metadata)
  VALUES
    (p_user_id, p_kind, v_amount, p_category, p_source_type, p_source_id, v_local_date, p_at, p_dedupe_key,
     COALESCE(p_metadata, '{}'::jsonb))
  ON CONFLICT (user_id, dedupe_key) DO NOTHING
  RETURNING id INTO v_inserted;

  -- Already awarded. The caller is replaying something.
  IF v_inserted IS NULL THEN
    RETURN 0;
  END IF;

  -- Roll the total forward. Streak counting happens here rather than in a
  -- trigger on xp_events so that the whole award stays one statement deep.
  SELECT last_active_date INTO v_prev_date FROM public.user_xp WHERE user_id = p_user_id;

  IF v_prev_date IS NULL THEN
    v_streak := 1;
  ELSIF v_prev_date = v_local_date THEN
    v_streak := NULL;              -- unchanged; already counted today
  ELSIF v_prev_date = v_local_date - 1 THEN
    v_streak := -1;                -- sentinel: increment
  ELSIF v_prev_date > v_local_date THEN
    v_streak := NULL;              -- backfilled older event; leave the streak alone
  ELSE
    v_streak := 1;                 -- gap; start over
  END IF;

  INSERT INTO public.user_xp (user_id, total_xp, current_streak, longest_streak, last_active_date, first_event_at, updated_at)
  VALUES (p_user_id, v_amount, 1, 1, v_local_date, p_at, now())
  -- ON CONFLICT refers to the existing row by bare table name; schema
  -- qualifying it here is a syntax error.
  ON CONFLICT (user_id) DO UPDATE SET
    total_xp = user_xp.total_xp + EXCLUDED.total_xp,
    current_streak = CASE
      WHEN v_streak = -1 THEN user_xp.current_streak + 1
      WHEN v_streak IS NULL THEN user_xp.current_streak
      ELSE v_streak
    END,
    last_active_date = GREATEST(user_xp.last_active_date, v_local_date),
    updated_at = now();

  UPDATE public.user_xp
     SET longest_streak = GREATEST(longest_streak, current_streak)
   WHERE user_id = p_user_id;

  -- First award of the day also pays the show-up bonus. Guarded on kind so it
  -- cannot recurse.
  IF p_kind <> 'streak.day' THEN
    PERFORM public.award_xp(
      p_user_id, 'streak.day', 'streak.day:' || v_local_date::text, 'habits',
      'streak', NULL, NULL, '{}'::jsonb, p_at
    );
  END IF;

  RETURN v_amount;
END;
$$;
--> statement-breakpoint

-- ─── 5. Triggers ───────────────────────────────────────────────────────────

-- Tasks. Fires the first time a row acquires a completed_at. Bonuses: priority
-- (P∞ is this app's "drop everything") and finishing before the due moment.
-- A task with a date but no time is due at the end of that day.
CREATE OR REPLACE FUNCTION public.xp_on_task_completed()
  RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_amount integer;
  v_due    timestamptz;
  v_tz     text;
BEGIN
  IF NEW.completed_at IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.completed_at IS NOT NULL THEN RETURN NEW; END IF;

  SELECT COALESCE(base_amount, 10) INTO v_amount FROM public.xp_rules WHERE kind = 'task.completed';
  IF v_amount IS NULL THEN RETURN NEW; END IF;

  v_amount := v_amount + CASE NEW.priority
    WHEN 'P∞' THEN 8
    WHEN 'P1'  THEN 5
    WHEN 'P2'  THEN 2
    ELSE 0
  END;

  IF NEW.due_date IS NOT NULL THEN
    SELECT COALESCE(NULLIF(timezone, ''), 'UTC') INTO v_tz FROM public.users WHERE id = NEW.user_id;
    BEGIN
      v_due := ((NEW.due_date + COALESCE(NEW.due_time, '23:59:59'::time)) AT TIME ZONE v_tz);
    EXCEPTION WHEN OTHERS THEN
      v_due := ((NEW.due_date + COALESCE(NEW.due_time, '23:59:59'::time)) AT TIME ZONE 'UTC');
    END;
    IF NEW.completed_at <= v_due THEN
      v_amount := v_amount + 5;
    END IF;
  END IF;

  PERFORM public.award_xp(
    NEW.user_id, 'task.completed', 'task.completed:' || NEW.id::text, 'tasks',
    'task', NEW.id, v_amount,
    jsonb_build_object('title', NEW.title, 'priority', NEW.priority),
    NEW.completed_at
  );
  RETURN NEW;
END;
$$;
--> statement-breakpoint

DROP TRIGGER IF EXISTS xp_task_completed ON public.tasks;
--> statement-breakpoint
CREATE TRIGGER xp_task_completed
  AFTER INSERT OR UPDATE OF completed_at ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.xp_on_task_completed();
--> statement-breakpoint

-- Habits. Worth more the longer the run: +2% per consecutive day, capped at
-- double so a year-long streak does not drown out everything else in the
-- category breakdown. The streak is counted by walking backwards a day at a
-- time, bounded so a corrupt row cannot spin forever.
CREATE OR REPLACE FUNCTION public.xp_on_habit_completed()
  RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_base     integer;
  v_streak   integer := 0;
  v_cursor   date;
  v_exists   boolean;
  v_amount   integer;
  v_mult     numeric;
  v_idx      integer;
  v_milestones integer[] := ARRAY[3, 7, 14, 30, 60, 100, 180, 365];
BEGIN
  IF NEW.status IS DISTINCT FROM 'done' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'done' THEN RETURN NEW; END IF;

  SELECT base_amount INTO v_base FROM public.xp_rules WHERE kind = 'habit.completed';
  IF v_base IS NULL THEN RETURN NEW; END IF;

  v_cursor := NEW.completed_date;
  WHILE v_streak < 400 LOOP
    SELECT EXISTS (
      SELECT 1 FROM public.habit_completions
       WHERE habit_id = NEW.habit_id AND completed_date = v_cursor AND status = 'done'
    ) INTO v_exists;
    EXIT WHEN NOT v_exists;
    v_streak := v_streak + 1;
    v_cursor := v_cursor - 1;
  END LOOP;

  v_mult := LEAST(2.0, 1.0 + (GREATEST(v_streak - 1, 0) * 0.02));
  v_amount := ROUND(v_base * v_mult);

  PERFORM public.award_xp(
    NEW.user_id, 'habit.completed',
    'habit.completed:' || NEW.habit_id::text || ':' || NEW.completed_date::text, 'habits',
    'habit', NEW.habit_id, v_amount,
    jsonb_build_object('streak', v_streak),
    NEW.completed_at
  );

  -- Milestone days pay an escalating bonus on top.
  v_idx := array_position(v_milestones, v_streak);
  IF v_idx IS NOT NULL THEN
    SELECT base_amount INTO v_base FROM public.xp_rules WHERE kind = 'habit.streak';
    PERFORM public.award_xp(
      NEW.user_id, 'habit.streak',
      'habit.streak:' || NEW.habit_id::text || ':' || v_streak::text, 'habits',
      'habit', NEW.habit_id, v_base * v_idx,
      jsonb_build_object('streak', v_streak),
      NEW.completed_at
    );
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint

DROP TRIGGER IF EXISTS xp_habit_completed ON public.habit_completions;
--> statement-breakpoint
CREATE TRIGGER xp_habit_completed
  AFTER INSERT OR UPDATE OF status ON public.habit_completions
  FOR EACH ROW EXECUTE FUNCTION public.xp_on_habit_completed();
--> statement-breakpoint

-- Captures.
CREATE OR REPLACE FUNCTION public.xp_on_capture_created()
  RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM public.award_xp(
    NEW.user_id, 'capture.created', 'capture.created:' || NEW.id::text, 'notes',
    'capture', NEW.id, NULL, '{}'::jsonb, COALESCE(NEW.created_at, now())
  );
  RETURN NEW;
END;
$$;
--> statement-breakpoint

DROP TRIGGER IF EXISTS xp_capture_created ON public.captures;
--> statement-breakpoint
CREATE TRIGGER xp_capture_created
  AFTER INSERT ON public.captures
  FOR EACH ROW EXECUTE FUNCTION public.xp_on_capture_created();
--> statement-breakpoint

-- Wiki pages. A page with a daily_date is the auto-opened daily page, which
-- the app creates on your behalf, so it earns nothing for merely existing.
-- Writing into it is what counts, and that comes back as daily.review.
CREATE OR REPLACE FUNCTION public.xp_on_page_written()
  RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_date date;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.daily_date IS NULL THEN
      PERFORM public.award_xp(
        NEW.user_id, 'page.created', 'page.created:' || NEW.id::text, 'notes',
        'page', NEW.id, NULL,
        jsonb_build_object('title', NEW.title),
        COALESCE(NEW.created_at, now())
      );
    END IF;
    RETURN NEW;
  END IF;

  -- Only real content changes count, and only once per doc per day.
  IF NEW.content IS NOT DISTINCT FROM OLD.content THEN RETURN NEW; END IF;

  v_date := public.xp_local_date(NEW.user_id, now());

  IF NEW.daily_date IS NOT NULL THEN
    PERFORM public.award_xp(
      NEW.user_id, 'daily.review', 'daily.review:' || NEW.daily_date::text, 'planning',
      'page', NEW.id, NULL, '{}'::jsonb, now()
    );
  ELSE
    PERFORM public.award_xp(
      NEW.user_id, 'page.edited',
      'page.edited:' || NEW.id::text || ':' || v_date::text, 'notes',
      'page', NEW.id, NULL,
      jsonb_build_object('title', NEW.title),
      now()
    );
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint

DROP TRIGGER IF EXISTS xp_page_written ON public.pages;
--> statement-breakpoint
CREATE TRIGGER xp_page_written
  AFTER INSERT OR UPDATE OF content ON public.pages
  FOR EACH ROW EXECUTE FUNCTION public.xp_on_page_written();
--> statement-breakpoint

-- Projects: created, and again when archived (this schema has no completed_at
-- on projects; archived_at is how a project finishes).
CREATE OR REPLACE FUNCTION public.xp_on_project_changed()
  RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.award_xp(
      NEW.user_id, 'project.created', 'project.created:' || NEW.id::text, 'planning',
      'project', NEW.id, NULL,
      jsonb_build_object('name', NEW.name),
      COALESCE(NEW.created_at, now())
    );
    RETURN NEW;
  END IF;

  IF NEW.archived_at IS NOT NULL AND OLD.archived_at IS NULL THEN
    PERFORM public.award_xp(
      NEW.user_id, 'project.completed', 'project.completed:' || NEW.id::text, 'planning',
      'project', NEW.id, NULL,
      jsonb_build_object('name', NEW.name),
      NEW.archived_at
    );
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint

DROP TRIGGER IF EXISTS xp_project_changed ON public.projects;
--> statement-breakpoint
CREATE TRIGGER xp_project_changed
  AFTER INSERT OR UPDATE OF archived_at ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.xp_on_project_changed();
--> statement-breakpoint

-- Areas.
CREATE OR REPLACE FUNCTION public.xp_on_area_created()
  RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM public.award_xp(
    NEW.user_id, 'area.created', 'area.created:' || NEW.id::text, 'planning',
    'area', NEW.id, NULL,
    jsonb_build_object('name', NEW.name),
    COALESCE(NEW.created_at, now())
  );
  RETURN NEW;
END;
$$;
--> statement-breakpoint

DROP TRIGGER IF EXISTS xp_area_created ON public.areas;
--> statement-breakpoint
CREATE TRIGGER xp_area_created
  AFTER INSERT ON public.areas
  FOR EACH ROW EXECUTE FUNCTION public.xp_on_area_created();
--> statement-breakpoint

-- JARVIS turns. Failed turns earn nothing.
CREATE OR REPLACE FUNCTION public.xp_on_jarvis_event()
  RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.error IS NOT NULL THEN RETURN NEW; END IF;
  PERFORM public.award_xp(
    NEW.user_id, 'jarvis.command', 'jarvis.command:' || NEW.id::text, 'jarvis',
    'jarvis', NEW.id, NULL, '{}'::jsonb, COALESCE(NEW.created_at, now())
  );
  RETURN NEW;
END;
$$;
--> statement-breakpoint

DROP TRIGGER IF EXISTS xp_jarvis_event ON public.jarvis_events;
--> statement-breakpoint
CREATE TRIGGER xp_jarvis_event
  AFTER INSERT ON public.jarvis_events
  FOR EACH ROW EXECUTE FUNCTION public.xp_on_jarvis_event();
--> statement-breakpoint

-- Training.
CREATE OR REPLACE FUNCTION public.xp_on_training_logged()
  RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM 'done' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'done' THEN RETURN NEW; END IF;
  PERFORM public.award_xp(
    NEW.user_id, 'training.logged', 'training.logged:' || NEW.id::text, 'health',
    'training', NEW.id, NULL, '{}'::jsonb, now()
  );
  RETURN NEW;
END;
$$;
--> statement-breakpoint

DROP TRIGGER IF EXISTS xp_training_logged ON public.training_activities;
--> statement-breakpoint
CREATE TRIGGER xp_training_logged
  AFTER INSERT OR UPDATE OF status ON public.training_activities
  FOR EACH ROW EXECUTE FUNCTION public.xp_on_training_logged();
--> statement-breakpoint

-- Nutrition.
CREATE OR REPLACE FUNCTION public.xp_on_food_logged()
  RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM public.award_xp(
    NEW.user_id, 'nutrition.logged', 'nutrition.logged:' || NEW.id::text, 'health',
    'nutrition', NEW.id, NULL, '{}'::jsonb, now()
  );
  RETURN NEW;
END;
$$;
--> statement-breakpoint

DROP TRIGGER IF EXISTS xp_food_logged ON public.food_logs;
--> statement-breakpoint
CREATE TRIGGER xp_food_logged
  AFTER INSERT ON public.food_logs
  FOR EACH ROW EXECUTE FUNCTION public.xp_on_food_logged();
--> statement-breakpoint

-- ─── 6. RLS ────────────────────────────────────────────────────────────────
--
-- The ledger is read-only to the client: awards come from SECURITY DEFINER
-- functions, so no insert/update/delete policy is granted to anyone. xp_rules
-- is world-readable to authenticated users (it is the "how XP works" table)
-- and writable only by migrations.

ALTER TABLE "xp_events" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "user_xp"   ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "xp_rules"  ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['xp_events', 'user_xp'] LOOP
    CONTINUE WHEN to_regclass('public.' || quote_ident(t)) IS NULL;
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select_own', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (user_id = auth.uid())',
      t || '_select_own', t
    );
  END LOOP;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  DROP POLICY IF EXISTS "xp_rules_select_all" ON public.xp_rules;
  CREATE POLICY "xp_rules_select_all" ON public.xp_rules
    FOR SELECT TO authenticated USING (true);
END $$;
--> statement-breakpoint

-- No RLS policy can protect award_xp(). It is SECURITY DEFINER and it takes the
-- user id as an argument, so anyone who can execute it can mint XP for anybody,
-- with a dedupe key of their choosing, past every cap this file sets up. And it
-- is reachable: Postgres grants EXECUTE on new functions to PUBLIC, and
-- PostgREST publishes everything in `public` as an RPC endpoint. Both helpers
-- are therefore revoked down to the roles that actually call them — the server,
-- which connects as the table owner, and the triggers, which run as its
-- definer. Runs after the CREATE OR REPLACE above on purpose; a replace keeps
-- the old ACL, so re-running the migration cannot reopen the hole.
DO $$
DECLARE
  v_fns text[] := ARRAY[
    'public.award_xp(uuid, text, text, text, text, uuid, integer, jsonb, timestamptz)',
    'public.xp_local_date(uuid, timestamptz)'
  ];
  v_fn   text;
  v_role text;
BEGIN
  FOREACH v_fn IN ARRAY v_fns LOOP
    EXECUTE 'REVOKE ALL ON FUNCTION ' || v_fn || ' FROM PUBLIC';
    FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      CONTINUE WHEN NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role);
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I', v_fn, v_role);
    END LOOP;
  END LOOP;
END $$;
--> statement-breakpoint

-- ─── 7. Realtime ───────────────────────────────────────────────────────────
--
-- The client subscribes to both so a "+15 XP" toast and the level ring update
-- the moment the trigger fires, on whatever device did the work.

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.xp_events;
EXCEPTION WHEN duplicate_object THEN null; WHEN undefined_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.user_xp;
EXCEPTION WHEN duplicate_object THEN null; WHEN undefined_object THEN null;
END $$;
