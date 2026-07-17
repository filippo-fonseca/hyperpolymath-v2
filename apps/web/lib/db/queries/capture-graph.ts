import {
  type CaptureGraph,
  type CoReferenceTargetType,
  GRAPH_NODE_CAP,
  type RawCoReferencePair,
  type RawPair,
  assembleCaptureEdges,
  buildCaptureNodes,
} from "@/lib/captures/graph-edges";
import { db } from "@/lib/db";
import {
  areas,
  captures,
  capturesHashtags,
  capturesProjects,
  entityReferences,
  hashtags,
  pages,
  people,
  projects,
  tasks,
} from "@/lib/db/schema";
import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

/**
 * Captures link graph (S10) — the data behind /captures' graph view.
 *
 * Four ways two captures can be related, each its own toggleable layer:
 * - `shared_hashtag`  — they carry the same #tag (weight = how many)
 * - `direct_reference`— one @-mentions the other
 * - `co_reference`    — both @-mention the same task/page/project/area/person
 * - `shared_project`  — both filed under the same project
 *
 * Everything is computed live off `captures`, the two join tables, and
 * `entity_references`. Deliberately NOT off `personal_context_snapshots`: that
 * snapshot is rebuilt nightly, and a graph of what you captured today should
 * not be a day stale.
 *
 * Cost shape: the pairing runs as four grouped self-joins over the node window,
 * plus at most five small batched label lookups for the targets co_reference
 * actually surfaced. No per-capture query, no per-edge query.
 */

/** Target kinds two captures can co-reference. Captures are excluded here —
 *  a shared capture target is a `direct_reference` to that capture, not a
 *  co-reference between the pair. */
const CO_REFERENCE_TARGET_TYPES: readonly CoReferenceTargetType[] = [
  "task",
  "page",
  "project",
  "area",
  "person",
];

export const EMPTY_CAPTURE_GRAPH: CaptureGraph = {
  nodes: [],
  edges: [],
  meta: { totalCaptures: 0, droppedEdges: {} },
};

/**
 * Build the graph for one user. Every query below is scoped by `userId` in SQL:
 * Drizzle connects as a BYPASSRLS role, so RLS is not the app's gate.
 */
export async function buildCaptureGraphForUser(userId: string): Promise<CaptureGraph> {
  // -- Node window --------------------------------------------------------
  // 500 most recent captures. noExport rows are included per S10: this is an
  // in-app view, not an export surface.
  const captureRows = await db
    .select({
      id: captures.id,
      content: captures.content,
      createdAt: captures.createdAt,
    })
    .from(captures)
    .where(eq(captures.userId, userId))
    .orderBy(desc(captures.createdAt))
    .limit(GRAPH_NODE_CAP);

  if (captureRows.length === 0) return EMPTY_CAPTURE_GRAPH;

  const captureIds = captureRows.map((r) => r.id);
  const nodeIds = new Set(captureIds);

  // Self-join aliases — one per side of each pair.
  const ch1 = alias(capturesHashtags, "ch1");
  const ch2 = alias(capturesHashtags, "ch2");
  const cp1 = alias(capturesProjects, "cp1");
  const cp2 = alias(capturesProjects, "cp2");
  const er1 = alias(entityReferences, "er1");
  const er2 = alias(entityReferences, "er2");

  const [
    hashtagRows,
    projectRows,
    sharedHashtagPairs,
    sharedProjectPairs,
    directReferencePairs,
    coReferencePairs,
  ] = await Promise.all([
    // Node decoration: canonical hashtag names per capture.
    db
      .select({ captureId: capturesHashtags.captureId, value: hashtags.name })
      .from(capturesHashtags)
      .innerJoin(hashtags, eq(hashtags.id, capturesHashtags.hashtagId))
      .where(
        and(eq(capturesHashtags.userId, userId), inArray(capturesHashtags.captureId, captureIds))
      ),

    // Node decoration: project ids per capture.
    db
      .select({ captureId: capturesProjects.captureId, value: capturesProjects.projectId })
      .from(capturesProjects)
      .where(
        and(eq(capturesProjects.userId, userId), inArray(capturesProjects.captureId, captureIds))
      ),

    // shared_hashtag: pair captures on a common tag, weight = tags in common.
    // `a.capture_id < b.capture_id` emits each undirected pair once.
    db
      .select({
        a: ch1.captureId,
        b: ch2.captureId,
        weight: sql<number>`count(*)::int`,
      })
      .from(ch1)
      .innerJoin(
        ch2,
        and(eq(ch2.hashtagId, ch1.hashtagId), sql`${ch1.captureId} < ${ch2.captureId}`)
      )
      .where(
        and(
          eq(ch1.userId, userId),
          eq(ch2.userId, userId),
          inArray(ch1.captureId, captureIds),
          inArray(ch2.captureId, captureIds)
        )
      )
      .groupBy(ch1.captureId, ch2.captureId),

    // shared_project: same shape over the project junction.
    db
      .select({
        a: cp1.captureId,
        b: cp2.captureId,
        weight: sql<number>`count(*)::int`,
      })
      .from(cp1)
      .innerJoin(
        cp2,
        and(eq(cp2.projectId, cp1.projectId), sql`${cp1.captureId} < ${cp2.captureId}`)
      )
      .where(
        and(
          eq(cp1.userId, userId),
          eq(cp2.userId, userId),
          inArray(cp1.captureId, captureIds),
          inArray(cp2.captureId, captureIds)
        )
      )
      .groupBy(cp1.captureId, cp2.captureId),

    // direct_reference: a capture that @-mentions another capture. Direction is
    // dropped on purpose — the graph reads as "these two are connected", and
    // the pure layer collapses a mutual pair into one edge.
    db
      .select({
        a: entityReferences.sourceId,
        b: entityReferences.targetId,
        weight: sql<number>`1::int`,
      })
      .from(entityReferences)
      .where(
        and(
          eq(entityReferences.userId, userId),
          eq(entityReferences.sourceType, "capture"),
          eq(entityReferences.targetType, "capture"),
          inArray(entityReferences.sourceId, captureIds),
          inArray(entityReferences.targetId, captureIds)
        )
      ),

    // co_reference: two captures pointing at the same non-capture target.
    // Grouped so the pair+target is one row even if the index somehow held
    // duplicates; the target rides along so the pure layer can label the edge.
    db
      .select({
        a: er1.sourceId,
        b: er2.sourceId,
        targetType: er1.targetType,
        targetId: er1.targetId,
        weight: sql<number>`1::int`,
      })
      .from(er1)
      .innerJoin(
        er2,
        and(
          eq(er2.targetType, er1.targetType),
          eq(er2.targetId, er1.targetId),
          sql`${er1.sourceId} < ${er2.sourceId}`
        )
      )
      .where(
        and(
          eq(er1.userId, userId),
          eq(er2.userId, userId),
          eq(er1.sourceType, "capture"),
          eq(er2.sourceType, "capture"),
          ne(er1.targetType, "capture"),
          inArray(er1.sourceId, captureIds),
          inArray(er2.sourceId, captureIds)
        )
      )
      .groupBy(er1.sourceId, er2.sourceId, er1.targetType, er1.targetId),
  ]);

  const nodes = buildCaptureNodes(captureRows, hashtagRows, projectRows);

  const typedCoReferencePairs: RawCoReferencePair[] = coReferencePairs
    .filter((row): row is typeof row & { targetType: CoReferenceTargetType } =>
      CO_REFERENCE_TARGET_TYPES.includes(row.targetType as CoReferenceTargetType)
    )
    .map((row) => ({
      a: row.a,
      b: row.b,
      weight: row.weight,
      targetType: row.targetType,
      targetId: row.targetId,
    }));

  const targetLabels = await resolveTargetLabels(userId, typedCoReferencePairs);

  const { edges, droppedEdges } = assembleCaptureEdges({
    nodeIds,
    sharedHashtagPairs: sharedHashtagPairs as RawPair[],
    directReferencePairs: directReferencePairs as RawPair[],
    coReferencePairs: typedCoReferencePairs,
    sharedProjectPairs: sharedProjectPairs as RawPair[],
    targetLabels,
  });

  return {
    nodes,
    edges,
    meta: { totalCaptures: nodes.length, droppedEdges },
  };
}

/**
 * Batch-resolve display labels for the entities co-referenced by a pair —
 * one query per target type that actually appeared, over just those ids.
 *
 * A target that has since been deleted simply resolves to nothing; the pure
 * layer leaves that edge unlabelled rather than dropping it, because the two
 * captures did both point at the same thing even if the thing is now gone.
 */
async function resolveTargetLabels(
  userId: string,
  pairs: RawCoReferencePair[]
): Promise<Map<string, string>> {
  const idsByType = new Map<CoReferenceTargetType, Set<string>>();
  for (const pair of pairs) {
    const set = idsByType.get(pair.targetType) ?? new Set<string>();
    set.add(pair.targetId);
    idsByType.set(pair.targetType, set);
  }
  if (idsByType.size === 0) return new Map();

  const labels = new Map<string, string>();

  const lookups = [...idsByType.entries()].map(async ([type, idSet]) => {
    const ids = [...idSet];
    const rows = await selectLabels(type, userId, ids);
    for (const row of rows) {
      labels.set(`${type}:${row.id}`, row.label);
    }
  });
  await Promise.all(lookups);

  return labels;
}

async function selectLabels(
  type: CoReferenceTargetType,
  userId: string,
  ids: string[]
): Promise<Array<{ id: string; label: string }>> {
  switch (type) {
    case "task":
      return db
        .select({ id: tasks.id, label: tasks.title })
        .from(tasks)
        .where(and(eq(tasks.userId, userId), inArray(tasks.id, ids)));
    case "page": {
      const rows = await db
        .select({ id: pages.id, label: pages.title })
        .from(pages)
        .where(and(eq(pages.userId, userId), inArray(pages.id, ids)));
      // pages.title defaults to "" — fall back so the edge tooltip is never blank.
      return rows.map((r) => ({ id: r.id, label: r.label || "Untitled page" }));
    }
    case "project":
      return db
        .select({ id: projects.id, label: projects.name })
        .from(projects)
        .where(and(eq(projects.userId, userId), inArray(projects.id, ids)));
    case "area":
      return db
        .select({ id: areas.id, label: areas.name })
        .from(areas)
        .where(and(eq(areas.userId, userId), inArray(areas.id, ids)));
    case "person":
      return db
        .select({ id: people.id, label: people.name })
        .from(people)
        .where(and(eq(people.userId, userId), inArray(people.id, ids)));
  }
}
