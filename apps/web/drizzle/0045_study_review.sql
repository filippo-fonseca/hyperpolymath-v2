-- 0045 — Study review: topic-level active recall + spaced repetition. Issue #400.
--
-- Five tables backing revision tracking for class projects (is_class = true).
--
--   study_topics             — the atom. One reviewable topic, nesting via
--                              parent_id so a syllabus lands as units → topics.
--                              Carries DSR memory state (difficulty, stability).
--   study_assessments        — what you are revising FOR. The due_date anchors
--                              the whole scheduler.
--   study_assessment_topics  — coverage matrix (which topics an exam examines).
--   study_reviews            — the immutable log. One row per retrieval session.
--   study_plan_items         — the drag-and-drop plan: one topic, on one DAY.
--
-- WHY NOT FLASHCARDS. Anki's atom is a card. For engineering coursework the
-- atom is a topic and the unit of work is a session: blank-page recall, deriving
-- a result cold, redoing a problem set, a timed past paper. That is the
-- granularity successive relearning (Rawson & Dunlosky 2022) operates at, and
-- the granularity that shows course-exam effects north of a letter grade.
--
-- WHY NO TRIGGERS HERE, UNLIKE 0044. XP is trigger-driven because writes reach
-- its source tables from four different surfaces. The study scheduler is the
-- opposite case: reviews arrive through exactly one server action, and the math
-- (a power-law forgetting curve with an exam-anchored clamp) is worth unit
-- testing in TypeScript rather than burying in PL/pgSQL. lib/study/scheduler.ts
-- owns it and updates study_topics in the same transaction as the review insert.
-- The ONE trigger in this file is the XP award, which follows 0044's precedent.
--
-- WHY NO TIME-OF-DAY ON study_plan_items. The user assigns topics to days and
-- fits them into the real schedule themselves. This is also why the feature has
-- no Google Calendar coupling: gcal stays the store of record for events, and a
-- study plan is not an event.

-- ─── 1. ENUMS ──────────────────────────────────────────────────────────────
-- CREATE TYPE has no IF NOT EXISTS, so each is guarded on duplicate_object.

DO $$ BEGIN
  CREATE TYPE "study_weight" AS ENUM ('skim', 'familiar', 'working', 'fluent', 'core');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE "study_grade" AS ENUM ('blanked', 'shaky', 'solid', 'fluent');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE "study_mode" AS ENUM (
    'blank_recall', 'derivation', 'problem_set', 'past_paper', 'teach_back', 'skim'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE "study_topic_status" AS ENUM (
    'not_started', 'learning', 'consolidating', 'exam_ready', 'retired'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE "study_assessment_kind" AS ENUM (
    'quiz', 'pset', 'midterm', 'final', 'exam', 'project'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE "study_plan_status" AS ENUM ('planned', 'done', 'skipped');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

-- ─── 2. TABLES ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "study_topics" (
  "id"               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"          uuid NOT NULL,
  "project_id"       uuid NOT NULL,
  "parent_id"        uuid,
  "title"            text NOT NULL,
  "notes"            text,
  "order_index"      integer NOT NULL DEFAULT 0,
  "weight"           "study_weight" NOT NULL DEFAULT 'working',
  -- DSR memory state, owned by lib/study/scheduler.ts.
  -- difficulty: 1–10, seeded from weight, nudged by each grade.
  "difficulty"       real NOT NULL DEFAULT 5,
  -- stability: days until retrievability decays to ~90%. NULL until the first
  -- review, because an unreviewed topic has no memory trace to decay.
  "stability"        real,
  "last_reviewed_at" timestamp with time zone,
  -- Already clamped to the nearest assessment. NULL = never reviewed => due now.
  "next_due_at"      timestamp with time zone,
  "reps"             integer NOT NULL DEFAULT 0,
  "lapses"           integer NOT NULL DEFAULT 0,
  "status"           "study_topic_status" NOT NULL DEFAULT 'not_started',
  "archived_at"      timestamp with time zone,
  "created_at"       timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"       timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "study_assessments" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"      uuid NOT NULL,
  "project_id"   uuid NOT NULL,
  "title"        text NOT NULL,
  "kind"         "study_assessment_kind" NOT NULL DEFAULT 'exam',
  -- Date only: the scheduler works in whole days.
  "due_date"     date NOT NULL,
  "weight_pct"   integer,
  "completed_at" timestamp with time zone,
  "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"   timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "study_assessment_topics" (
  "assessment_id" uuid NOT NULL,
  "topic_id"      uuid NOT NULL,
  "user_id"       uuid NOT NULL,
  CONSTRAINT "study_assessment_topics_pkey" PRIMARY KEY ("assessment_id", "topic_id")
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "study_reviews" (
  "id"                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"           uuid NOT NULL,
  "topic_id"          uuid NOT NULL,
  -- Denormalized so per-class rollups need no join through study_topics.
  "project_id"        uuid NOT NULL,
  "assessment_id"     uuid,
  "reviewed_at"       timestamp with time zone NOT NULL DEFAULT now(),
  "mode"              "study_mode" NOT NULL,
  "grade"             "study_grade" NOT NULL,
  "duration_min"      integer,
  -- Successive relearning's criterion: at least one clean retrieval this
  -- session. Recorded separately from the subjective grade because it is the
  -- single strongest predictor in the literature.
  "reached_criterion" boolean NOT NULL DEFAULT false,
  "gaps"              text,
  "source"            text NOT NULL DEFAULT 'manual',
  -- Intentionally not an FK: study_plan_items is created after this table and
  -- the pair would be mutually referencing. The plan item owns the real link.
  "plan_item_id"      uuid,
  "created_at"        timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "study_plan_items" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"       uuid NOT NULL,
  -- No time-of-day column, by design. See the header.
  "plan_date"     date NOT NULL,
  "topic_id"      uuid NOT NULL,
  "assessment_id" uuid,
  "order_index"   integer NOT NULL DEFAULT 0,
  "status"        "study_plan_status" NOT NULL DEFAULT 'planned',
  "completed_at"  timestamp with time zone,
  "review_id"     uuid,
  "created_at"    timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"    timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

-- ─── 3. FOREIGN KEYS ───────────────────────────────────────────────────────

DO $$ BEGIN
  ALTER TABLE "study_topics" ADD CONSTRAINT "study_topics_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "study_topics" ADD CONSTRAINT "study_topics_project_id_fk"
    FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "study_topics" ADD CONSTRAINT "study_topics_parent_id_fk"
    FOREIGN KEY ("parent_id") REFERENCES "study_topics"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "study_assessments" ADD CONSTRAINT "study_assessments_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "study_assessments" ADD CONSTRAINT "study_assessments_project_id_fk"
    FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "study_assessment_topics" ADD CONSTRAINT "study_assessment_topics_assessment_id_fk"
    FOREIGN KEY ("assessment_id") REFERENCES "study_assessments"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "study_assessment_topics" ADD CONSTRAINT "study_assessment_topics_topic_id_fk"
    FOREIGN KEY ("topic_id") REFERENCES "study_topics"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "study_assessment_topics" ADD CONSTRAINT "study_assessment_topics_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "study_reviews" ADD CONSTRAINT "study_reviews_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "study_reviews" ADD CONSTRAINT "study_reviews_topic_id_fk"
    FOREIGN KEY ("topic_id") REFERENCES "study_topics"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "study_reviews" ADD CONSTRAINT "study_reviews_project_id_fk"
    FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "study_reviews" ADD CONSTRAINT "study_reviews_assessment_id_fk"
    FOREIGN KEY ("assessment_id") REFERENCES "study_assessments"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "study_plan_items" ADD CONSTRAINT "study_plan_items_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "study_plan_items" ADD CONSTRAINT "study_plan_items_topic_id_fk"
    FOREIGN KEY ("topic_id") REFERENCES "study_topics"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "study_plan_items" ADD CONSTRAINT "study_plan_items_assessment_id_fk"
    FOREIGN KEY ("assessment_id") REFERENCES "study_assessments"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "study_plan_items" ADD CONSTRAINT "study_plan_items_review_id_fk"
    FOREIGN KEY ("review_id") REFERENCES "study_reviews"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

-- ─── 4. INDEXES ────────────────────────────────────────────────────────────

-- Drives the "Fading now" queue: due topics for a user, soonest first.
CREATE INDEX IF NOT EXISTS "study_topics_user_due_idx"
  ON "study_topics" ("user_id", "next_due_at") WHERE "archived_at" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "study_topics_project_idx"
  ON "study_topics" ("project_id", "order_index") WHERE "archived_at" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "study_topics_parent_idx"
  ON "study_topics" ("parent_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "study_assessments_user_due_idx"
  ON "study_assessments" ("user_id", "due_date") WHERE "completed_at" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "study_assessments_project_idx"
  ON "study_assessments" ("project_id", "due_date");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "study_assessment_topics_topic_idx"
  ON "study_assessment_topics" ("topic_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "study_assessment_topics_user_idx"
  ON "study_assessment_topics" ("user_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "study_reviews_topic_idx"
  ON "study_reviews" ("topic_id", "reviewed_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "study_reviews_user_reviewed_idx"
  ON "study_reviews" ("user_id", "reviewed_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "study_reviews_project_idx"
  ON "study_reviews" ("project_id", "reviewed_at" DESC);
--> statement-breakpoint

-- A topic lands on a given day once. Re-dropping it is a move, not a duplicate.
CREATE UNIQUE INDEX IF NOT EXISTS "study_plan_items_user_date_topic_uniq"
  ON "study_plan_items" ("user_id", "plan_date", "topic_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "study_plan_items_user_date_idx"
  ON "study_plan_items" ("user_id", "plan_date", "order_index");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "study_plan_items_topic_idx"
  ON "study_plan_items" ("topic_id");
--> statement-breakpoint

-- ─── 5. ROW LEVEL SECURITY ─────────────────────────────────────────────────
-- Prod auto-grants the anon role, so RLS is the only gate. Every table gets the
-- standard four own-row policies.

ALTER TABLE "study_topics"            ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "study_assessments"       ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "study_assessment_topics" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "study_reviews"           ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "study_plan_items"        ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'study_topics',
    'study_assessments',
    'study_assessment_topics',
    'study_reviews',
    'study_plan_items'
  ] LOOP
    -- Skip a table that is absent in this database rather than abort the run:
    -- the two migration dirs have drifted historically and not every database
    -- has every table.
    CONTINUE WHEN to_regclass('public.' || quote_ident(t)) IS NULL;

    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.%I', t || '_select_own', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (user_id = auth.uid())',
      t || '_select_own', t);

    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.%I', t || '_insert_own', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid())',
      t || '_insert_own', t);

    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.%I', t || '_update_own', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())',
      t || '_update_own', t);

    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.%I', t || '_delete_own', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (user_id = auth.uid())',
      t || '_delete_own', t);
  END LOOP;
END $$;
--> statement-breakpoint

-- ─── 6. XP ─────────────────────────────────────────────────────────────────
-- A logged review earns XP. This one IS a trigger, following 0044's precedent:
-- reviews will eventually arrive from the /review board, the Kiwi executor and
-- the LifeOS widget, and an app-side helper would stop covering new surfaces.

INSERT INTO "xp_rules" ("kind", "base_amount", "daily_cap")
VALUES ('study.review', 20, 200)
ON CONFLICT ("kind") DO NOTHING;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.xp_on_study_review()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_amount integer;
BEGIN
  -- Effortful retrieval is worth more than passive rereading, and the whole
  -- point of the feature is to make that difference legible. A skim earns
  -- something (so logging it honestly is never punished) but not full credit.
  v_amount := CASE NEW.mode
    WHEN 'skim'       THEN 8
    WHEN 'past_paper' THEN 30
    ELSE 20
  END;

  -- Reaching the successive-relearning criterion is the behaviour worth
  -- reinforcing, so it carries its own bonus.
  IF NEW.reached_criterion THEN
    v_amount := v_amount + 10;
  END IF;

  PERFORM public.award_xp(
    NEW.user_id,
    'study.review',
    'study.review:' || NEW.id::text,
    'study',
    'study_review',
    NEW.id,
    v_amount,
    jsonb_build_object(
      'mode', NEW.mode,
      'grade', NEW.grade,
      'topic_id', NEW.topic_id,
      'reached_criterion', NEW.reached_criterion
    ),
    COALESCE(NEW.reviewed_at, now())
  );
  RETURN NEW;
END $$;
--> statement-breakpoint

DROP TRIGGER IF EXISTS xp_study_review ON "study_reviews";
--> statement-breakpoint

CREATE TRIGGER xp_study_review
AFTER INSERT ON "study_reviews"
FOR EACH ROW EXECUTE FUNCTION public.xp_on_study_review();
--> statement-breakpoint

-- PostgREST publishes every public-schema function as an RPC, so an unrevoked
-- trigger function is a public endpoint. Revoke after CREATE OR REPLACE, which
-- preserves the prior ACL rather than resetting it.
REVOKE ALL ON FUNCTION public.xp_on_study_review() FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.xp_on_study_review() FROM anon;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.xp_on_study_review() FROM authenticated;
--> statement-breakpoint

-- ─── 7. REALTIME ───────────────────────────────────────────────────────────
-- The day plan is edited on the /review board and read by the LifeOS widget and
-- the class project section, so a drag on one surface must land on the others.
-- Keep the RealtimeTable union in lib/realtime/query-keys.ts in sync with this.

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.study_topics;
EXCEPTION WHEN duplicate_object THEN null; WHEN undefined_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.study_assessments;
EXCEPTION WHEN duplicate_object THEN null; WHEN undefined_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.study_assessment_topics;
EXCEPTION WHEN duplicate_object THEN null; WHEN undefined_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.study_reviews;
EXCEPTION WHEN duplicate_object THEN null; WHEN undefined_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.study_plan_items;
EXCEPTION WHEN duplicate_object THEN null; WHEN undefined_object THEN null;
END $$;
