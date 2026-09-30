/**
 * Canonical query-key conventions for Phase 3 Realtime + TanStack Query.
 *
 * Every read backed by a Supabase table uses [table, userId] as its key prefix
 * so Realtime channel callbacks can invalidate by table+user in one call (D-09).
 */
export type RealtimeTable =
  | "areas"
  | "projects"
  | "tasks"
  | "captures"
  | "hashtags"
  | "captures_hashtags"
  | "tasks_projects"
  | "captures_projects"
  | "jarvis_facts" // Phase 5.1 (D-M6 — Settings → Memory live updates)
  // 2026-06 multi-tenancy / live-tail — JARVIS turns + per-stage events
  // broadcast on every desktop-driven voice run so the browser scrollback
  // stays in sync without depending on the per-tab SSE pipe.
  | "jarvis_turns"
  | "jarvis_events"
  | "habits"
  | "habits_areas"
  | "habit_completions"
  // Phase 15 — training (TRN-17)
  | "training_batches"
  | "training_activity_types"
  | "training_activities"
  // Phase 17 — nutrition (NUTR-RT-01)
  | "foods"
  | "food_serving_options"
  | "food_logs"
  | "meals"
  | "meal_items"
  // Phase 20 — journaling (JOURNAL-RT-01)
  | "journal_entries"
  // Phase 20 — pages (wiki-style markdown documents)
  | "pages"
  | "pages_projects"
  | "page_folders"
  // Phase 21 — wiki data-model restructure (folder->project M:N links)
  | "folder_projects"
  // Phase People — first-class person entity + mention references
  | "people"
  | "people_references"
  // Universal references — the (source -> target) index behind @-mentions.
  // Live because a reference is created from one surface and read from
  // another: mention a task inside a capture and the task's backlink list has
  // to notice without a reload.
  | "entity_references"
  // Issue #345 — XP. Awards are handed out by Postgres triggers, so the tab
  // that did the work never sees a return value it could optimistically apply.
  // Realtime is the only way the level ring and the "+15 XP" toast learn that
  // anything happened, on this device or any other.
  | "xp_events"
  | "user_xp"
  // Issue #400 — study review. The day plan is edited from the /review board
  // and read by the LifeOS widget and the class project section, so a drag on
  // one surface has to land on the others without a reload.
  | "study_topics"
  | "study_assessments"
  | "study_assessment_topics"
  | "study_reviews"
  | "study_plan_items";

export function tableKey(
  table: RealtimeTable,
  userId: string,
): readonly [RealtimeTable, string] {
  return [table, userId] as const;
}
