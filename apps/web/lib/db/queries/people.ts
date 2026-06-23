/**
 * People read helpers — server-only Drizzle queries.
 *
 * The People tab is backed by [people, userId] / [people_references, userId]
 * TanStack Query keys; these functions are the queryFn targets. Reference
 * counts and linked-entity resolution are derived from people_references at
 * read time (single source of truth), never denormalized onto the person row.
 */
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  captures,
  pages,
  people,
  peopleReferences,
  tasks,
} from "@/lib/db/schema";

export type PersonRow = typeof people.$inferSelect;

export interface PersonWithStats extends PersonRow {
  /** Total number of entities (tasks + captures + pages + facts) referencing this person. */
  referenceCount: number;
}

/**
 * All of a user's people with their reference counts, name-sorted. One grouped
 * scan of people_references provides the counts; people with zero references
 * still appear (LEFT-style merge in JS).
 */
export async function getPeopleForUser(userId: string): Promise<PersonWithStats[]> {
  const [rows, counts] = await Promise.all([
    db
      .select()
      .from(people)
      .where(eq(people.userId, userId))
      .orderBy(sql`lower(${people.name})`),
    db
      .select({
        personId: peopleReferences.personId,
        count: sql<number>`count(*)::int`,
      })
      .from(peopleReferences)
      .where(eq(peopleReferences.userId, userId))
      .groupBy(peopleReferences.personId),
  ]);

  const countByPerson = new Map(counts.map((c) => [c.personId, c.count]));
  return rows.map((r) => ({ ...r, referenceCount: countByPerson.get(r.id) ?? 0 }));
}

export async function getPersonById(
  userId: string,
  personId: string,
): Promise<PersonRow | null> {
  const [row] = await db
    .select()
    .from(people)
    .where(and(eq(people.id, personId), eq(people.userId, userId)))
    .limit(1);
  return row ?? null;
}

export interface PersonReferenceItem {
  fromType: string;
  fromId: string;
  /** Display label resolved from the referencing entity (task title, capture snippet, page title). */
  label: string;
  createdAt: string;
}

export interface PersonReferenceBreakdown {
  total: number;
  byType: Record<string, number>;
  items: PersonReferenceItem[];
}

/**
 * Resolve every entity that references a person into displayable items, plus a
 * per-type breakdown for the profile stats. Pulls the referencing rows in one
 * batched read per entity type, then stitches labels back onto the references.
 */
export async function getPersonReferences(
  userId: string,
  personId: string,
): Promise<PersonReferenceBreakdown> {
  const refs = await db
    .select()
    .from(peopleReferences)
    .where(
      and(eq(peopleReferences.userId, userId), eq(peopleReferences.personId, personId)),
    )
    .orderBy(desc(peopleReferences.createdAt));

  const idsByType = new Map<string, string[]>();
  for (const r of refs) {
    const list = idsByType.get(r.fromType) ?? [];
    list.push(r.fromId);
    idsByType.set(r.fromType, list);
  }

  const labelById = new Map<string, string>();
  const taskIds = idsByType.get("task");
  const captureIds = idsByType.get("capture");
  const pageIds = idsByType.get("page");

  await Promise.all([
    taskIds?.length
      ? db
          .select({ id: tasks.id, title: tasks.title })
          .from(tasks)
          .where(and(eq(tasks.userId, userId), inArray(tasks.id, taskIds)))
          .then((rows) => rows.forEach((t) => labelById.set(t.id, t.title)))
      : Promise.resolve(),
    captureIds?.length
      ? db
          .select({ id: captures.id, content: captures.content })
          .from(captures)
          .where(and(eq(captures.userId, userId), inArray(captures.id, captureIds)))
          .then((rows) =>
            rows.forEach((c) =>
              labelById.set(c.id, c.content.slice(0, 80) || "(empty capture)"),
            ),
          )
      : Promise.resolve(),
    pageIds?.length
      ? db
          .select({ id: pages.id, title: pages.title })
          .from(pages)
          .where(and(eq(pages.userId, userId), inArray(pages.id, pageIds)))
          .then((rows) =>
            rows.forEach((p) => labelById.set(p.id, p.title || "Untitled page")),
          )
      : Promise.resolve(),
  ]);

  const byType: Record<string, number> = {};
  const items: PersonReferenceItem[] = [];
  for (const r of refs) {
    byType[r.fromType] = (byType[r.fromType] ?? 0) + 1;
    // Drop dangling references whose target row no longer resolves (e.g. a
    // jarvis_fact type we don't label yet), but still count them in byType.
    const label = labelById.get(r.fromId);
    if (label === undefined) continue;
    items.push({
      fromType: r.fromType,
      fromId: r.fromId,
      label,
      createdAt:
        r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
    });
  }

  return { total: refs.length, byType, items };
}
