"use server";

import { z } from "zod";
import { eq, and, sql } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { areas, projects } from "@/lib/db/schema";

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

  // No revalidatePath: Realtime echoes drive cache invalidation across all
  // open clients via useTableSubscription (D-09 / RT-04).
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
 * AREA-04: blocks delete if any projects exist under this area.
 * Error copy from UI-SPEC §"Error States":
 *   "Can't delete an area that has projects under it."
 */
export async function deleteArea(id: string): Promise<ActionResult<null>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };
  if (!z.string().uuid().safeParse(id).success)
    return { success: false, error: "Invalid id" };

  const [{ projectCount }] = await db
    .select({ projectCount: sql<number>`COUNT(*)::int` })
    .from(projects)
    .where(and(eq(projects.areaId, id), eq(projects.userId, userId)));

  if (projectCount > 0) {
    return {
      success: false,
      error: "Can't delete an area that has projects under it.",
    };
  }

  await db
    .delete(areas)
    .where(and(eq(areas.id, id), eq(areas.userId, userId)));
  return { success: true, data: null };
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
