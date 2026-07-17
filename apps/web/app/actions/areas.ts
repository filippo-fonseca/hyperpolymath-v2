"use server";

import { z } from "zod";
import { eq, and, sql, isNull } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { areas, projects } from "@/lib/db/schema";
import { deleteReferencesForTarget } from "@/lib/references/reconcile";

type ActionResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string };

/**
 * Resolve current user via getClaims (CLAUDE.md Critical Pattern 1).
 * NEVER getSession() — it doesn't validate the JWT.
 */
async function getUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data: claimsData, error } = await supabase.auth.getClaims();
  if (error || !claimsData?.claims) return null;
  return claimsData.claims.sub;
}

/**
 * RT-05: Server respects caller-supplied UUID so client useOptimistic +
 * Realtime echo can dedupe by id (Realtime payload arrives with same UUID =
 * no-op in the reducer).
 */
const CreateAreaSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, "Name is required").max(100),
  emoji: z.string().trim().max(8).optional().nullable(),
});

export async function createArea(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };
  const parsed = CreateAreaSchema.safeParse(input);
  if (!parsed.success)
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };

  // Append to end: orderIndex = (max existing for this user) + 1
  const [{ maxOrder }] = await db
    .select({ maxOrder: sql<number>`COALESCE(MAX(${areas.orderIndex}), -1)` })
    .from(areas)
    .where(eq(areas.userId, userId));

  const [row] = await db
    .insert(areas)
    .values({
      ...(parsed.data.id ? { id: parsed.data.id } : {}),
      userId,
      name: parsed.data.name,
      emoji: parsed.data.emoji ?? null,
      orderIndex: (maxOrder ?? -1) + 1,
    })
    .returning({ id: areas.id });

  // Cache invalidation is driven by Realtime echoes across all open clients
  // via useTableSubscription (D-09 / RT-04) — no Server Component path-revalidation.
  return { success: true, data: { id: row!.id } };
}

const UpdateAreaSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(100).optional(),
  emoji: z.string().trim().max(8).nullable().optional(),
});

export async function updateArea(input: unknown): Promise<ActionResult<null>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };
  const parsed = UpdateAreaSchema.safeParse(input);
  if (!parsed.success)
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };

  // Build update object only with provided fields
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updates: Record<string, any> = { updatedAt: sql`now()` };
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.emoji !== undefined) updates.emoji = parsed.data.emoji;

  await db
    .update(areas)
    .set(updates)
    .where(and(eq(areas.id, parsed.data.id), eq(areas.userId, userId)));
  return { success: true, data: null };
}

export async function archiveArea(id: string): Promise<ActionResult<null>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };
  if (!z.string().uuid().safeParse(id).success)
    return { success: false, error: "Invalid id" };
  await db
    .update(areas)
    .set({ archivedAt: sql`now()` })
    .where(and(eq(areas.id, id), eq(areas.userId, userId)));
  return { success: true, data: null };
}

export async function unarchiveArea(id: string): Promise<ActionResult<null>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };
  if (!z.string().uuid().safeParse(id).success)
    return { success: false, error: "Invalid id" };
  await db
    .update(areas)
    .set({ archivedAt: null })
    .where(and(eq(areas.id, id), eq(areas.userId, userId)));
  return { success: true, data: null };
}

/**
 * Finds the per-user "No Area" sentinel row or creates it.
 *
 * Sentinel signature: name === 'No Area' AND emoji IS NULL.
 * orderIndex 9999 sorts it last in the sidebar tree without disrupting
 * existing area ordering.
 *
 * Wrapped in a transaction so concurrent deletes cannot create duplicate
 * sentinel rows.
 *
 * @internal — consumed only by deleteArea below.
 */
async function ensureNoAreaBucket(userId: string): Promise<string> {
  return db.transaction(async (tx) => {
    // SELECT existing sentinel
    const [existing] = await tx
      .select({ id: areas.id })
      .from(areas)
      .where(
        and(
          eq(areas.userId, userId),
          eq(areas.name, "No Area"),
          isNull(areas.emoji),
        ),
      )
      .limit(1);

    if (existing) return existing.id;

    // INSERT new sentinel
    const [created] = await tx
      .insert(areas)
      .values({
        userId,
        name: "No Area",
        emoji: null,
        orderIndex: 9999,
        archivedAt: null,
      })
      .returning({ id: areas.id });

    return created!.id;
  });
}

/**
 * Locked decision (Quick 260611-g2z #1): child projects are reassigned to a
 * per-user "No Area" bucket on delete, NOT blocked, NOT cascade-deleted.
 * Tasks/captures linked to those projects survive untouched — junction tables
 * already CASCADE their join rows on project delete per PROJ-04, but the
 * projects themselves are not deleted here.
 */
export async function deleteArea(id: string): Promise<ActionResult<null>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };
  if (!z.string().uuid().safeParse(id).success)
    return { success: false, error: "Invalid id" };

  // Fetch the victim area to verify ownership and check sentinel status
  const [victim] = await db
    .select({ id: areas.id, name: areas.name, emoji: areas.emoji })
    .from(areas)
    .where(and(eq(areas.id, id), eq(areas.userId, userId)))
    .limit(1);

  if (!victim) return { success: false, error: "Area not found" };

  // Defense: prevent deleting the sentinel to avoid a UX loop where the user
  // deletes "No Area" only to have it re-created on the next area delete.
  if (victim.name === "No Area" && victim.emoji === null) {
    return { success: false, error: "Can't delete the No Area bucket." };
  }

  return db.transaction(async (tx) => {
    // Count child projects
    const [{ projectCount }] = await tx
      .select({ projectCount: sql<number>`COUNT(*)::int` })
      .from(projects)
      .where(and(eq(projects.areaId, id), eq(projects.userId, userId)));

    if (projectCount > 0) {
      // Ensure (or create) the sentinel bucket, then reassign
      const sentinelId = await ensureNoAreaBucket(userId);
      await tx
        .update(projects)
        .set({ areaId: sentinelId, updatedAt: sql`now()` })
        .where(and(eq(projects.areaId, id), eq(projects.userId, userId)));
    }

    // An area is only ever a reference target. Its rows carry no FK, so they
    // outlive it unless cleared here; the tokens naming it stay in whatever
    // text they were typed into and render as tombstones.
    await deleteReferencesForTarget(tx, { userId, targetType: "area", targetId: id });

    await tx
      .delete(areas)
      .where(and(eq(areas.id, id), eq(areas.userId, userId)));

    return { success: true, data: null };
  });
}

/**
 * D-03: drag-reorder. Accepts the full ordered array of area IDs as they should appear.
 * Atomically rewrites orderIndex for all of them in one transaction.
 */
const ReorderAreasSchema = z.object({
  orderedIds: z.array(z.string().uuid()).min(1),
});

export async function reorderAreas(
  input: unknown,
): Promise<ActionResult<null>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };
  const parsed = ReorderAreasSchema.safeParse(input);
  if (!parsed.success)
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };

  await db.transaction(async (tx) => {
    for (let i = 0; i < parsed.data.orderedIds.length; i++) {
      await tx
        .update(areas)
        .set({ orderIndex: i })
        .where(
          and(
            eq(areas.id, parsed.data.orderedIds[i]!),
            eq(areas.userId, userId),
          ),
        );
    }
  });
  return { success: true, data: null };
}

/**
 * Auth-gated SELECT for the signed-in user's areas (with nested projects).
 * queryFn target for useQuery({ queryKey: tableKey("areas", userId) }) in
 * Sidebar.tsx. Returns the SidebarArea[] shape used by the SSR layout so
 * React-Query refetches stay shape-compatible.
 *
 * CLAUDE.md Critical Pattern 1: getClaims (NOT getSession) — validates JWT.
 */
export async function getAreasForCurrentUser(): Promise<
  import("@/lib/db/queries/sidebar").SidebarArea[]
> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) throw new Error("Unauthorized");
  const { getSidebarTree } = await import("@/lib/db/queries/sidebar");
  return getSidebarTree(data.claims.sub, false);
}
