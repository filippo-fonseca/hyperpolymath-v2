/**
 * Personal Context Graph — typed Node / Edge / ContextSnapshot schemas (v1).
 *
 * Phase 999.12 Plan 03 (MCP-01). These Zod schemas are duplicated VERBATIM
 * from apps/web/lib/context/types.ts so this package has ZERO imports from
 * apps/web/* (the MCP package must be portable / deployable in isolation).
 *
 * The duplication is intentional and small (~70 lines). If/when the v1
 * schema evolves, both copies bump together via a coordinated change — and
 * `CURRENT_SCHEMA_VERSION` increments here AND in apps/web/lib/context/types.ts
 * AND a new migrator is registered in apps/web/lib/context/migrate.ts.
 *
 * Schema versioning rule: payloads are FOREVER. Never mutate historical rows.
 * To evolve, bump CURRENT_SCHEMA_VERSION and register a pure migrator in
 * apps/web/lib/context/migrate.ts. The MCP server only reads the latest
 * migrated payload — the migration happens at the apps/web boundary, not here.
 */

import { z } from "zod";

/** Bump this when the Node / Edge / ContextSnapshot shape evolves. */
export const CURRENT_SCHEMA_VERSION = 2 as const;

/* ─── Node discriminated union (v1) ───────────────────────────────────── */

export const NodeSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("area"),
    id: z.string().uuid(),
    name: z.string(),
    emoji: z.string().nullable(),
    orderIndex: z.number().int(),
  }),
  z.object({
    type: z.literal("project"),
    id: z.string().uuid(),
    areaId: z.string().uuid(),
    name: z.string(),
    isClass: z.boolean(),
    archived: z.boolean(),
    startDate: z.string().nullable(),
    endDate: z.string().nullable(),
  }),
  z.object({
    type: z.literal("task"),
    id: z.string().uuid(),
    title: z.string(),
    priority: z.enum(["P∞", "P1", "P2", "P3"]),
    status: z.enum(["not started", "up next", "in progress", "almost done", "lesno"]),
    dueDate: z.string().nullable(),
    projectIds: z.array(z.string().uuid()),
  }),
  z.object({
    type: z.literal("capture"),
    id: z.string().uuid(),
    text: z.string(),
    createdAt: z.string(),
    tags: z.array(z.string()),
    projectIds: z.array(z.string().uuid()),
  }),
  z.object({
    type: z.literal("training_activity"),
    id: z.string().uuid(),
    kind: z.string(),
    durationMin: z.number().nullable(),
    distanceKm: z.number().nullable(),
    occurredAt: z.string(),
  }),
  z.object({
    type: z.literal("habit"),
    id: z.string().uuid(),
    name: z.string(),
    currentStreak: z.number().int(),
  }),
  z.object({
    type: z.literal("jarvis_fact"),
    id: z.string().uuid(),
    text: z.string(),
    createdAt: z.string(),
  }),
  z.object({
    type: z.literal("journal_entry"),
    id: z.string(),
    date: z.string(),
    mainResponse: z.string().nullable(),
    notesSection: z.string().nullable(),
    createdAt: z.string(),
  }),
  z.object({
    type: z.literal("page"),
    id: z.string().uuid(),
    title: z.string(),
    content: z.string(),
    emoji: z.string().nullable(),
    projectIds: z.array(z.string().uuid()),
    createdAt: z.string(),
    updatedAt: z.string(),
    summary: z.string().optional(),
  }),
]);
export type Node = z.infer<typeof NodeSchema>;
export type NodeType = Node["type"];

/* ─── Edge discriminated union (v1) ───────────────────────────────────── */

export const EdgeSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("project_in_area"),
    from: z.string().uuid(),
    to: z.string().uuid(),
  }),
  z.object({
    type: z.literal("task_in_project"),
    from: z.string().uuid(),
    to: z.string().uuid(),
  }),
  z.object({
    type: z.literal("capture_in_project"),
    from: z.string().uuid(),
    to: z.string().uuid(),
  }),
  z.object({
    type: z.literal("page_in_project"),
    from: z.string().uuid(),
    to: z.string().uuid(),
  }),
  z.object({
    type: z.literal("capture_tagged"),
    from: z.string().uuid(),
    tag: z.string(),
  }),
  z.object({
    type: z.literal("fact_about"),
    from: z.string().uuid(),
    entityType: z.enum(["area", "project"]),
    entityId: z.string().uuid(),
  }),
]);
export type Edge = z.infer<typeof EdgeSchema>;
export type EdgeType = Edge["type"];

/* ─── Top-level snapshot envelope ─────────────────────────────────────── */

export const ContextSnapshotSchema = z.object({
  schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
  /** ISO 8601 string; canonical generation timestamp (UTC). */
  generatedAt: z.string(),
  nodes: z.array(NodeSchema),
  edges: z.array(EdgeSchema),
  meta: z.object({
    totalNodes: z.number().int().nonnegative(),
    totalEdges: z.number().int().nonnegative(),
    /** Per-node-type counts, e.g. { area: 4, project: 12, task: 87 }. */
    nodeCounts: z.record(z.string(), z.number().int().nonnegative()),
    /** How many rows the loaders filtered because no_export = true. */
    excludedNoExportCount: z.number().int().nonnegative(),
  }),
});
export type ContextSnapshot = z.infer<typeof ContextSnapshotSchema>;

/* ─── Snapshot history entry (metadata-only, no payload) ──────────────── */

/**
 * Metadata-only view of a single snapshot row, used by get_snapshot_history.
 * Excludes the `nodes` and `edges` arrays — those can be 100s of KB and
 * blow the MCP tool response budget. To fetch the latest full payload,
 * call get_current_context instead.
 */
export interface SnapshotHistoryEntry {
  /** YYYY-MM-DD (matches personal_context_snapshots.snapshot_date). */
  snapshotDate: string;
  schemaVersion: number;
  /** Per-node-type counts mirroring ContextSnapshot.meta.nodeCounts. */
  nodeCounts: Record<string, number>;
  totalNodes: number;
  totalEdges: number;
}
