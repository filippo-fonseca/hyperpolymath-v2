"use server";

import { z } from "zod";
import { eq, and, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { areas, projects } from "@/lib/db/schema";

type ActionResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string };

async function getUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data: claimsData, error } = await supabase.auth.getClaims();
  if (error || !claimsData?.claims) return null;
  return claimsData.claims.sub;
}

const CreateAreaSchema = z.object({
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
      userId,
      name: parsed.data.name,
      emoji: parsed.data.emoji ?? null,
      orderIndex: (maxOrder ?? -1) + 1,
    })
    .returning({ id: areas.id });

  revalidatePath("/", "layout");
  return { success: true, data: { id: row.id } };
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
  revalidatePath("/", "layout");
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
  revalidatePath("/", "layout");
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
  revalidatePath("/", "layout");
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
  revalidatePath("/", "layout");
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
  revalidatePath("/", "layout");
  return { success: true, data: null };
}
