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
  | "captures_projects";

export function tableKey(
  table: RealtimeTable,
  userId: string,
): readonly [RealtimeTable, string] {
  return [table, userId] as const;
}
