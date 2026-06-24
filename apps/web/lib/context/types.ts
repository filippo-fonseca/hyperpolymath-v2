/**
 * Personal Context Graph — typed Node / Edge / ContextSnapshot schemas (v1).
 *
 * Phase 999.12 CTX-03 / CTX-09. These Zod schemas are the contract between:
 *   - the snapshot builder (apps/web/lib/context/build-snapshot.ts) — writes
 *   - the MCP server (Plan 03) — reads
 *   - the cron / API routes (Plan 04) — pass-through
 *
 * Schema versioning rule: payloads are FOREVER. Never mutate historical rows.
 * To evolve, bump CURRENT_SCHEMA_VERSION and register a pure migrator in
 * migrate.ts. The reader routes through migrate() at read time.
 *
 * Caps (RESEARCH.md Pitfall 2) live in the loaders, not the schema — the
 * schema accepts any cardinality so a future builder can grow without
 * breaking the contract.
 */

import { z } from "zod";

/** Bump this when the Node / Edge / ContextSnapshot shape evolves. */
export const CURRENT_SCHEMA_VERSION = 4 as const;

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
    // EFFECTIVE project set: the page's own direct pages_projects links UNION the
    // effective project set inherited from its ancestor folders (Phase 29).
    projectIds: z.array(z.string().uuid()),
    // The page's folder placement (null when unfiled) and the root-first folder
    // path names that lead to it (empty array when unfiled). Phase 29.
    folderId: z.string().uuid().nullable(),
    folderPath: z.array(z.string()),
    createdAt: z.string(),
    updatedAt: z.string(),
    summary: z.string().optional(),
  }),
  z.object({
    type: z.literal("person"),
    id: z.string().uuid(),
    name: z.string(),
    email: z.string().nullable(),
    phone: z.string().nullable(),
    bio: z.string().nullable(),
    tags: z.array(z.string()),
    createdAt: z.string(),
    updatedAt: z.string(),
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
    type: z.literal("page_in_folder"),
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
  z.object({
    type: z.literal("mentions_person"),
    from: z.string().uuid(),
    to: z.string().uuid(),
    fromType: z.enum(["task", "capture", "page", "jarvis_fact", "event"]),
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
