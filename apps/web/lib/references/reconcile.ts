import "server-only";

import { db } from "@/lib/db";
import {
  areas,
  captures,
  entityReferences,
  pages,
  people,
  projects,
  tasks,
} from "@/lib/db/schema";
import { and, eq, inArray, or } from "drizzle-orm";
import {
  type EntityRef,
  type EntityRefType,
  dedupeReferences,
  parseReferences,
} from "./token";

/**
 * Keeping the references index truthful.
 *
 * A reference lives in two places: as a token inside the source's text (the
 * durable copy) and as a row in entity_references (the queryable projection).
 * The text is the source of truth; this module's whole job is making the rows
 * agree with it after every write.
 *
 * The diff is what makes that cheap and idempotent. Saving a capture whose
 * references didn't change touches no rows at all, so re-saves don't churn
 * created_at or wake Realtime subscribers for nothing.
 */

/** Accepts the pooled client or a transaction handle — same idiom as app/actions/hashtags.ts. */
type DbOrTx = Parameters<Parameters<typeof db.transaction>[0]>[0] | typeof db;

/** The entity kinds that can hold a reference token. */
export type ReferenceSourceType = "capture" | "task" | "page" | "jarvis_turn";

export interface ReconcileInput {
  userId: string;
  sourceType: ReferenceSourceType;
  sourceId: string;
  /** The references the source's content currently names. */
  refs: readonly EntityRef[];
}

export interface ReconcileResult {
  inserted: number;
  deleted: number;
}

/** One end of a reference, identity-only: labels are never stored. */
interface TargetKey {
  targetType: EntityRefType;
  targetId: string;
}

const targetKey = (t: TargetKey): string => `${t.targetType}:${t.targetId}`;

/**
 * The pure half: which rows to add, which to drop.
 *
 * Identity is (targetType, targetId) — a reference's label is a display
 * snapshot that lives in the text, never in the table, so a label edit is not
 * a row change and must not produce one.
 */
export function diffReferences(
  existing: readonly TargetKey[],
  desired: readonly TargetKey[],
): { toInsert: TargetKey[]; toDelete: TargetKey[] } {
  const existingKeys = new Set(existing.map(targetKey));
  const desiredKeys = new Set(desired.map(targetKey));

  const seen = new Set<string>();
  const toInsert: TargetKey[] = [];
  for (const t of desired) {
    const key = targetKey(t);
    if (existingKeys.has(key) || seen.has(key)) continue;
    seen.add(key);
    toInsert.push({ targetType: t.targetType, targetId: t.targetId });
  }

  const toDelete = existing.filter((t) => !desiredKeys.has(targetKey(t)));
  return { toInsert, toDelete };
}

/** Which table owns each target kind, for the ownership check. */
const TARGET_TABLES = {
  capture: captures,
  task: tasks,
  page: pages,
  project: projects,
  area: areas,
  person: people,
} as const;

/**
 * Drop any target the user doesn't own.
 *
 * Tokens are parsed out of text the user typed, and text can hold any uuid at
 * all — including one belonging to someone else's task, pasted or guessed. The
 * row it would create is inert (every read is userId-scoped, so the owner never
 * sees it and the author only ever resolves it to a tombstone), but writing it
 * would still put a cross-user edge in the index, and the graph and reference
 * counts both read this table. Cheaper to never write it.
 *
 * One query per distinct kind actually present, so the common single-mention
 * save costs one extra SELECT, not six.
 */
async function keepOwnedTargets(
  handle: DbOrTx,
  userId: string,
  refs: readonly EntityRef[],
): Promise<EntityRef[]> {
  const byType = new Map<EntityRefType, string[]>();
  for (const ref of refs) {
    const ids = byType.get(ref.type);
    if (ids) ids.push(ref.id);
    else byType.set(ref.type, [ref.id]);
  }

  const owned = new Set<string>();
  await Promise.all(
    Array.from(byType, async ([type, ids]) => {
      const table = TARGET_TABLES[type];
      const rows = await handle
        .select({ id: table.id })
        .from(table)
        .where(and(eq(table.userId, userId), inArray(table.id, ids)));
      for (const row of rows) owned.add(`${type}:${row.id}`);
    }),
  );

  return refs.filter((ref) => owned.has(`${ref.type}:${ref.id}`));
}

/**
 * Make entity_references match the references `sourceId` actually names.
 *
 * Pass a transaction handle when the calling write path has one, so the index
 * can't survive a rolled-back content write.
 */
export async function reconcileEntityReferences(
  handle: DbOrTx,
  { userId, sourceType, sourceId, refs }: ReconcileInput,
): Promise<ReconcileResult> {
  const deduped = dedupeReferences(refs);
  const desired = deduped.length
    ? await keepOwnedTargets(handle, userId, deduped)
    : [];

  const existing = await handle
    .select({
      targetType: entityReferences.targetType,
      targetId: entityReferences.targetId,
    })
    .from(entityReferences)
    .where(
      and(
        eq(entityReferences.userId, userId),
        eq(entityReferences.sourceType, sourceType),
        eq(entityReferences.sourceId, sourceId),
      ),
    );

  const { toInsert, toDelete } = diffReferences(
    existing as TargetKey[],
    desired.map((r) => ({ targetType: r.type, targetId: r.id })),
  );

  if (toInsert.length) {
    await handle
      .insert(entityReferences)
      .values(
        toInsert.map((t) => ({
          userId,
          sourceType,
          sourceId,
          targetType: t.targetType,
          targetId: t.targetId,
        })),
      )
      // A concurrent save of the same source can race us to the same row; the
      // unique constraint makes that a no-op rather than a failed save.
      .onConflictDoNothing();
  }

  for (const t of toDelete) {
    await handle
      .delete(entityReferences)
      .where(
        and(
          eq(entityReferences.userId, userId),
          eq(entityReferences.sourceType, sourceType),
          eq(entityReferences.sourceId, sourceId),
          eq(entityReferences.targetType, t.targetType),
          eq(entityReferences.targetId, t.targetId),
        ),
      );
  }

  return { inserted: toInsert.length, deleted: toDelete.length };
}

/**
 * Reconcile straight from a source's text, parsing the tokens out of it.
 * The common case for captures, task notes, and JARVIS turns.
 */
export async function reconcileEntityReferencesFromText(
  handle: DbOrTx,
  input: Omit<ReconcileInput, "refs"> & { text: string | null | undefined },
): Promise<ReconcileResult> {
  const refs: EntityRef[] = parseReferences(input.text ?? "").map((r) => ({
    type: r.type,
    id: r.id,
    label: r.label,
  }));
  return reconcileEntityReferences(handle, { ...input, refs });
}

/**
 * Drop every row a deleted SOURCE owned.
 *
 * There's no FK to cascade through — source_id is polymorphic — so the delete
 * actions call this or the rows outlive the entity that made them.
 */
export async function deleteReferencesForSource(
  handle: DbOrTx,
  {
    userId,
    sourceType,
    sourceId,
  }: { userId: string; sourceType: ReferenceSourceType; sourceId: string },
): Promise<void> {
  await handle
    .delete(entityReferences)
    .where(
      and(
        eq(entityReferences.userId, userId),
        eq(entityReferences.sourceType, sourceType),
        eq(entityReferences.sourceId, sourceId),
      ),
    );
}

/**
 * Drop every row pointing AT a deleted target.
 *
 * The sealed policy (S3): the rows go, the token stays. The source's text is
 * the user's own writing and deleting a task shouldn't silently rewrite the
 * capture that mentioned it — so the token remains and renders as a tombstone
 * pill (muted, snapshot label, no navigation). What must not survive is the
 * index row, which would otherwise keep the target alive in backlink counts and
 * the graph forever.
 */
export async function deleteReferencesForTarget(
  handle: DbOrTx,
  {
    userId,
    targetType,
    targetId,
  }: { userId: string; targetType: EntityRefType; targetId: string },
): Promise<void> {
  await handle
    .delete(entityReferences)
    .where(
      and(
        eq(entityReferences.userId, userId),
        eq(entityReferences.targetType, targetType),
        eq(entityReferences.targetId, targetId),
      ),
    );
}

/**
 * An entity being deleted is usually both: a source that named things and a
 * target that things named. Captures, tasks, and pages need both halves cleared.
 */
export async function deleteReferencesForEntity(
  handle: DbOrTx,
  {
    userId,
    type,
    id,
  }: { userId: string; type: ReferenceSourceType & EntityRefType; id: string },
): Promise<void> {
  await deleteReferencesForSource(handle, {
    userId,
    sourceType: type,
    sourceId: id,
  });
  await deleteReferencesForTarget(handle, {
    userId,
    targetType: type,
    targetId: id,
  });
}

/**
 * The same cleanup for a set of entities of one kind, in a single statement.
 * A bulk delete of 500 tasks shouldn't cost 1000 round trips.
 */
export async function deleteReferencesForEntities(
  handle: DbOrTx,
  {
    userId,
    type,
    ids,
  }: {
    userId: string;
    type: ReferenceSourceType & EntityRefType;
    ids: readonly string[];
  },
): Promise<void> {
  if (!ids.length) return;
  await handle.delete(entityReferences).where(
    and(
      eq(entityReferences.userId, userId),
      or(
        and(
          eq(entityReferences.sourceType, type),
          inArray(entityReferences.sourceId, ids as string[]),
        ),
        and(
          eq(entityReferences.targetType, type),
          inArray(entityReferences.targetId, ids as string[]),
        ),
      ),
    ),
  );
}
