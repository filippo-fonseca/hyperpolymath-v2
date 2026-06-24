"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { people, peopleReferences } from "@/lib/db/schema";
import {
  type PersonReferenceBreakdown,
  type PersonWithStats,
  getPeopleForUser,
  searchPeopleForUser,
  getPersonReferences,
} from "@/lib/db/queries/people";
import { createClient } from "@/lib/supabase/server";

type ActionResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string };

/**
 * CLAUDE.md Critical Pattern 1: validate via getClaims() — never getSession()
 * in server code.
 */
async function getUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) return null;
  return data.claims.sub;
}

/** Entity types that can reference a person (matches people_references.from_type). */
const FROM_TYPES = ["task", "capture", "page", "jarvis_fact", "event"] as const;
export type PersonRefFromType = (typeof FROM_TYPES)[number];

const CreatePersonSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(320).nullable().optional(),
  phone: z.string().trim().max(64).nullable().optional(),
  bio: z.string().trim().max(2000).nullable().optional(),
  avatarUrl: z.string().trim().url().max(2048).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(64)).max(40).default([]),
});

export async function createPerson(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };
  const parsed = CreatePersonSchema.safeParse(input);
  if (!parsed.success)
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const [row] = await db
    .insert(people)
    .values({
      ...(parsed.data.id ? { id: parsed.data.id } : {}),
      userId,
      name: parsed.data.name,
      email: parsed.data.email ?? null,
      phone: parsed.data.phone ?? null,
      bio: parsed.data.bio ?? null,
      avatarUrl: parsed.data.avatarUrl ?? null,
      tags: parsed.data.tags,
    })
    .returning({ id: people.id });

  return { success: true, data: { id: row.id } };
}

const UpdatePersonSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(200).optional(),
  email: z.string().trim().email().max(320).nullable().optional(),
  phone: z.string().trim().max(64).nullable().optional(),
  bio: z.string().trim().max(2000).nullable().optional(),
  avatarUrl: z.string().trim().url().max(2048).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(64)).max(40).optional(),
});

export async function updatePerson(input: unknown): Promise<ActionResult<null>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };
  const parsed = UpdatePersonSchema.safeParse(input);
  if (!parsed.success)
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const set: Record<string, unknown> = { updatedAt: sql`now()` };
  if (parsed.data.name !== undefined) set.name = parsed.data.name;
  if (parsed.data.email !== undefined) set.email = parsed.data.email;
  if (parsed.data.phone !== undefined) set.phone = parsed.data.phone;
  if (parsed.data.bio !== undefined) set.bio = parsed.data.bio;
  if (parsed.data.avatarUrl !== undefined) set.avatarUrl = parsed.data.avatarUrl;
  if (parsed.data.tags !== undefined) set.tags = parsed.data.tags;

  await db
    .update(people)
    .set(set)
    .where(and(eq(people.id, parsed.data.id), eq(people.userId, userId)));

  return { success: true, data: null };
}

export async function deletePerson(id: string): Promise<ActionResult<null>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };
  if (!z.string().uuid().safeParse(id).success)
    return { success: false, error: "Invalid id" };
  // people_references rows cascade via the person FK.
  await db.delete(people).where(and(eq(people.id, id), eq(people.userId, userId)));
  return { success: true, data: null };
}

/**
 * Resolve a person by case-insensitive name for the signed-in user, creating
 * one if none exists. The atomic primitive behind @-mention inline-create and
 * JARVIS's create_person tool. Returns whether the row was newly created so the
 * caller can surface "created new person" UX.
 */
export async function resolveOrCreatePersonForUser(
  userId: string,
  rawName: string,
): Promise<{ id: string; name: string; created: boolean } | null> {
  const name = rawName.trim();
  if (!name) return null;

  const [existing] = await db
    .select({ id: people.id, name: people.name })
    .from(people)
    .where(and(eq(people.userId, userId), sql`lower(${people.name}) = lower(${name})`))
    .limit(1);
  if (existing) return { id: existing.id, name: existing.name, created: false };

  const [row] = await db
    .insert(people)
    .values({ userId, name })
    .returning({ id: people.id, name: people.name });
  return { id: row.id, name: row.name, created: true };
}

const ResolveOrCreateSchema = z.object({ name: z.string().trim().min(1).max(200) });

/** Server-action wrapper for the editor mention picker's inline-create path. */
export async function resolveOrCreatePerson(
  input: unknown,
): Promise<ActionResult<{ id: string; name: string; created: boolean }>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };
  const parsed = ResolveOrCreateSchema.safeParse(input);
  if (!parsed.success)
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const result = await resolveOrCreatePersonForUser(userId, parsed.data.name);
  if (!result) return { success: false, error: "Empty name" };
  return { success: true, data: result };
}

/**
 * Reconcile the set of people referenced by a single entity. Diffs the desired
 * person ids against the rows currently stored for (fromType, fromId) and
 * applies the minimal insert/delete. Idempotent: calling it on every save keeps
 * people_references the single source of truth for reference counts + the graph.
 * Only person ids the user actually owns are linked.
 */
export async function reconcilePersonReferencesForUser(
  userId: string,
  fromType: PersonRefFromType,
  fromId: string,
  desiredPersonIds: string[],
): Promise<void> {
  const desired = Array.from(new Set(desiredPersonIds));

  // Keep only ids the user owns to avoid cross-user linkage.
  const ownedIds = desired.length
    ? new Set(
        (
          await db
            .select({ id: people.id })
            .from(people)
            .where(and(eq(people.userId, userId), inArray(people.id, desired)))
        ).map((p) => p.id),
      )
    : new Set<string>();
  const validDesired = desired.filter((id) => ownedIds.has(id));

  const existing = (
    await db
      .select({ personId: peopleReferences.personId })
      .from(peopleReferences)
      .where(
        and(
          eq(peopleReferences.userId, userId),
          eq(peopleReferences.fromType, fromType),
          eq(peopleReferences.fromId, fromId),
        ),
      )
  ).map((r) => r.personId);

  const existingSet = new Set(existing);
  const desiredSet = new Set(validDesired);
  const toInsert = validDesired.filter((id) => !existingSet.has(id));
  const toDelete = existing.filter((id) => !desiredSet.has(id));

  if (toInsert.length) {
    await db
      .insert(peopleReferences)
      .values(
        toInsert.map((personId) => ({ userId, fromType, fromId, personId })),
      )
      .onConflictDoNothing();
  }
  if (toDelete.length) {
    await db
      .delete(peopleReferences)
      .where(
        and(
          eq(peopleReferences.userId, userId),
          eq(peopleReferences.fromType, fromType),
          eq(peopleReferences.fromId, fromId),
          inArray(peopleReferences.personId, toDelete),
        ),
      );
  }
}

const ReconcileSchema = z.object({
  fromType: z.enum(FROM_TYPES),
  fromId: z.string().uuid(),
  personIds: z.array(z.string().uuid()).max(100),
});

/** Server-action wrapper used by editors to persist mention references on save. */
export async function reconcilePersonReferences(
  input: unknown,
): Promise<ActionResult<null>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };
  const parsed = ReconcileSchema.safeParse(input);
  if (!parsed.success)
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  await reconcilePersonReferencesForUser(
    userId,
    parsed.data.fromType,
    parsed.data.fromId,
    parsed.data.personIds,
  );
  return { success: true, data: null };
}

/** queryFn target for useQuery({ queryKey: tableKey("people", userId) }). */
export async function getPeopleForCurrentUser(): Promise<PersonWithStats[]> {
  const userId = await getUserId();
  if (!userId) throw new Error("Unauthorized");
  return getPeopleForUser(userId);
}

/**
 * On-demand person search for the wiki "@" mention autocomplete. Fetches live
 * per keystroke so the menu works without first warming the People-tab cache,
 * and matches against the full name (last names included). Returns [] when
 * unauthenticated rather than throwing — the menu should degrade quietly.
 */
export async function searchPeopleForCurrentUser(
  query: string,
): Promise<Array<{ id: string; name: string; email: string | null }>> {
  const userId = await getUserId();
  if (!userId) return [];
  const rows = await searchPeopleForUser(userId, query);
  return rows.map((r) => ({ id: r.id, name: r.name, email: r.email }));
}

/** Resolve one person's full reference breakdown for the profile page. */
export async function getPersonReferencesForCurrentUser(
  personId: string,
): Promise<PersonReferenceBreakdown> {
  const userId = await getUserId();
  if (!userId) throw new Error("Unauthorized");
  if (!z.string().uuid().safeParse(personId).success)
    return { total: 0, byType: {}, items: [] };
  return getPersonReferences(userId, personId);
}
