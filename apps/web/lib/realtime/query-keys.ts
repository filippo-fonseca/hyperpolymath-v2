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
  | "whatsapp_messages";

export function tableKey(
  table: RealtimeTable,
  userId: string,
): readonly [RealtimeTable, string] {
  return [table, userId] as const;
}
