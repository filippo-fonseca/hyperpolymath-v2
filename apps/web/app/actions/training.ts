"use server";

import { z } from "zod";
import { and, count, eq, inArray, isNull, sql } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import {
  trainingActivities,
  trainingActivityTypes,
  trainingBatches,
} from "@/lib/db/schema";

type ActionResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string };

/**
 * Resolve current user via getClaims (CLAUDE.md Critical Pattern 1).
 * NEVER getSession() — it doesn't validate the JWT.
 */
async function getUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) return null;
  return data.claims.sub;
}

// ──────────────────────────────────────────────────────────────────────────
// Shared schemas
// ──────────────────────────────────────────────────────────────────────────

const UuidSchema = z.string().uuid();
const IsoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date");
const OklchSchema = z
  .string()
  .regex(/^oklch\(/i, "Color must be an OKLCH string");
const StatusSchema = z.enum(["planned", "done", "cancelled", "skipped"]);

// ──────────────────────────────────────────────────────────────────────────
// Batches
// ──────────────────────────────────────────────────────────────────────────

const CreateBatchSchema = z.object({
  id: UuidSchema.optional(),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).nullable().optional(),
});

export async function createBatch(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };
  const parsed = CreateBatchSchema.safeParse(input);
  if (!parsed.success)
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };

  const [{ maxPos }] = await db
    .select({
      maxPos: sql<number>`COALESCE(MAX(${trainingBatches.orderIndex}), -1)`,
    })
    .from(trainingBatches)
    .where(eq(trainingBatches.userId, userId));

  const [row] = await db
    .insert(trainingBatches)
    .values({
      ...(parsed.data.id ? { id: parsed.data.id } : {}),
      userId,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      orderIndex: maxPos + 1,
    })
    .returning({ id: trainingBatches.id });

  return { success: true, data: { id: row!.id } };
}

const UpdateBatchSchema = z.object({
  id: UuidSchema,
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
});

export async function updateBatch(
  input: unknown,
): Promise<ActionResult<null>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };
  const parsed = UpdateBatchSchema.safeParse(input);
  if (!parsed.success)
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };

  const { id, ...rest } = parsed.data;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updates: Record<string, any> = { updatedAt: sql`now()` };
  for (const [k, v] of Object.entries(rest)) if (v !== undefined) updates[k] = v;

  await db
    .update(trainingBatches)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .set(updates as any)
    .where(
      and(
        eq(trainingBatches.id, id),
        eq(trainingBatches.userId, userId),
      ),
    );
  return { success: true, data: null };
}

const DeleteByIdSchema = z.object({ id: UuidSchema });

export async function deleteBatch(
  input: unknown,
): Promise<ActionResult<null>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };
  const parsed = DeleteByIdSchema.safeParse(input);
  if (!parsed.success)
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };

  // Soft delete — types referencing this batch fall back to ungrouped via
  // ON DELETE SET NULL when the batch is later hard-deleted; archive keeps
  // them attached for now.
  await db
    .update(trainingBatches)
    .set({ archivedAt: sql`now()`, updatedAt: sql`now()` })
    .where(
      and(
        eq(trainingBatches.id, parsed.data.id),
        eq(trainingBatches.userId, userId),
      ),
    );
  return { success: true, data: null };
}

const ReorderBatchesSchema = z.object({
  orderedIds: z.array(UuidSchema).min(1).max(200),
});

export async function reorderBatches(
  input: unknown,
): Promise<ActionResult<null>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };
  const parsed = ReorderBatchesSchema.safeParse(input);
  if (!parsed.success)
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };

  // Verify all ids belong to user
  const owned = await db
    .select({ id: trainingBatches.id })
    .from(trainingBatches)
    .where(
      and(
        eq(trainingBatches.userId, userId),
        inArray(trainingBatches.id, parsed.data.orderedIds),
      ),
    );
  if (owned.length !== parsed.data.orderedIds.length)
    return { success: false, error: "Some batches not found" };

  await db.transaction(async (tx) => {
    for (let i = 0; i < parsed.data.orderedIds.length; i++) {
      await tx
        .update(trainingBatches)
        .set({ orderIndex: i, updatedAt: sql`now()` })
        .where(
          and(
            eq(trainingBatches.id, parsed.data.orderedIds[i]!),
            eq(trainingBatches.userId, userId),
          ),
        );
    }
  });
  return { success: true, data: null };
}

// ──────────────────────────────────────────────────────────────────────────
// Activity types
// ──────────────────────────────────────────────────────────────────────────

const CreateTypeSchema = z.object({
  id: UuidSchema.optional(),
  batchId: UuidSchema.nullable().optional(),
  name: z.string().trim().min(1).max(120),
  color: OklchSchema,
  hasDistance: z.boolean(),
});

export async function createType(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };
  const parsed = CreateTypeSchema.safeParse(input);
  if (!parsed.success)
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };

  // If batchId given, verify it belongs to user.
  if (parsed.data.batchId) {
    const [batch] = await db
      .select({ id: trainingBatches.id })
      .from(trainingBatches)
      .where(
        and(
          eq(trainingBatches.id, parsed.data.batchId),
          eq(trainingBatches.userId, userId),
        ),
      );
    if (!batch) return { success: false, error: "Batch not found" };
  }

  // Append at end of (batchId, userId) ordering scope.
  const [{ maxPos }] = await db
    .select({
      maxPos: sql<number>`COALESCE(MAX(${trainingActivityTypes.orderIndex}), -1)`,
    })
    .from(trainingActivityTypes)
    .where(
      and(
        eq(trainingActivityTypes.userId, userId),
        parsed.data.batchId
          ? eq(trainingActivityTypes.batchId, parsed.data.batchId)
          : isNull(trainingActivityTypes.batchId),
      ),
    );

  const [row] = await db
    .insert(trainingActivityTypes)
    .values({
      ...(parsed.data.id ? { id: parsed.data.id } : {}),
      userId,
      batchId: parsed.data.batchId ?? null,
      name: parsed.data.name,
      color: parsed.data.color,
      hasDistance: parsed.data.hasDistance,
      orderIndex: maxPos + 1,
    })
    .returning({ id: trainingActivityTypes.id });

  return { success: true, data: { id: row!.id } };
}

const UpdateTypeSchema = z.object({
  id: UuidSchema,
  batchId: UuidSchema.nullable().optional(),
  name: z.string().trim().min(1).max(120).optional(),
  color: OklchSchema.optional(),
  hasDistance: z.boolean().optional(),
});

export async function updateType(
  input: unknown,
): Promise<ActionResult<null>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };
  const parsed = UpdateTypeSchema.safeParse(input);
  if (!parsed.success)
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };

  // If batchId changes to a non-null value, verify ownership of that batch.
  if (parsed.data.batchId) {
    const [batch] = await db
      .select({ id: trainingBatches.id })
      .from(trainingBatches)
      .where(
        and(
          eq(trainingBatches.id, parsed.data.batchId),
          eq(trainingBatches.userId, userId),
        ),
      );
    if (!batch) return { success: false, error: "Batch not found" };
  }

  const { id, ...rest } = parsed.data;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updates: Record<string, any> = { updatedAt: sql`now()` };
  for (const [k, v] of Object.entries(rest)) if (v !== undefined) updates[k] = v;

  await db
    .update(trainingActivityTypes)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .set(updates as any)
    .where(
      and(
        eq(trainingActivityTypes.id, id),
        eq(trainingActivityTypes.userId, userId),
      ),
    );
  return { success: true, data: null };
}

export async function deleteType(
  input: unknown,
): Promise<ActionResult<null>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };
  const parsed = DeleteByIdSchema.safeParse(input);
  if (!parsed.success)
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };

  // RESEARCH Open Q4 / D-04: deleting a type with activities should fail
  // loudly so the UI can surface "archive instead?". Count NON-archived
  // activities — a fully-archived/historical type can be archived freely.
  const [{ activityCount }] = await db
    .select({ activityCount: count() })
    .from(trainingActivities)
    .where(
      and(
        eq(trainingActivities.userId, userId),
        eq(trainingActivities.activityTypeId, parsed.data.id),
      ),
    );

  if (Number(activityCount) > 0) {
    return {
      success: false,
      error: `This type has ${activityCount} activities. Archive instead.`,
    };
  }

  // Soft delete via archivedAt — mirrors batches.
  await db
    .update(trainingActivityTypes)
    .set({ archivedAt: sql`now()`, updatedAt: sql`now()` })
    .where(
      and(
        eq(trainingActivityTypes.id, parsed.data.id),
        eq(trainingActivityTypes.userId, userId),
      ),
    );
  return { success: true, data: null };
}

const ReorderTypesSchema = z.object({
  orderedIds: z.array(UuidSchema).min(1).max(500),
  batchId: UuidSchema.nullable().optional(),
});

export async function reorderTypes(
  input: unknown,
): Promise<ActionResult<null>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };
  const parsed = ReorderTypesSchema.safeParse(input);
  if (!parsed.success)
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };

  // Verify ownership of all ids
  const owned = await db
    .select({ id: trainingActivityTypes.id })
    .from(trainingActivityTypes)
    .where(
      and(
        eq(trainingActivityTypes.userId, userId),
        inArray(trainingActivityTypes.id, parsed.data.orderedIds),
      ),
    );
  if (owned.length !== parsed.data.orderedIds.length)
    return { success: false, error: "Some types not found" };

  await db.transaction(async (tx) => {
    for (let i = 0; i < parsed.data.orderedIds.length; i++) {
      await tx
        .update(trainingActivityTypes)
        .set({ orderIndex: i, updatedAt: sql`now()` })
        .where(
          and(
            eq(trainingActivityTypes.id, parsed.data.orderedIds[i]!),
            eq(trainingActivityTypes.userId, userId),
          ),
        );
    }
  });
  return { success: true, data: null };
}

// ──────────────────────────────────────────────────────────────────────────
// Activities
// ──────────────────────────────────────────────────────────────────────────

const CreateActivitySchema = z.object({
  id: UuidSchema.optional(),
  activityTypeId: UuidSchema,
  scheduledDate: IsoDateSchema,
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).nullable().optional(),
  plannedDurationMin: z
    .number()
    .int()
    .positive()
    .max(1440)
    .nullable()
    .optional(),
  plannedDistanceKm: z
    .number()
    .nonnegative()
    .max(1000)
    .nullable()
    .optional(),
});

export async function createActivity(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };
  const parsed = CreateActivitySchema.safeParse(input);
  if (!parsed.success)
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };

  // Verify type belongs to user
  const [type] = await db
    .select({ id: trainingActivityTypes.id })
    .from(trainingActivityTypes)
    .where(
      and(
        eq(trainingActivityTypes.id, parsed.data.activityTypeId),
        eq(trainingActivityTypes.userId, userId),
      ),
    );
  if (!type) return { success: false, error: "Activity type not found" };

  // Append at end of day (within-column order)
  const [{ maxPos }] = await db
    .select({
      maxPos: sql<number>`COALESCE(MAX(${trainingActivities.dayOrderIndex}), -1)`,
    })
    .from(trainingActivities)
    .where(
      and(
        eq(trainingActivities.userId, userId),
        eq(trainingActivities.scheduledDate, parsed.data.scheduledDate),
      ),
    );

  const [row] = await db.insert(trainingActivities)
    .values({
      ...(parsed.data.id ? { id: parsed.data.id } : {}),
      userId,
      activityTypeId: parsed.data.activityTypeId,
      scheduledDate: parsed.data.scheduledDate,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      plannedDurationMin: parsed.data.plannedDurationMin ?? null,
      // Drizzle `numeric` expects string at the IO boundary.
      plannedDistanceKm:
        parsed.data.plannedDistanceKm != null
          ? parsed.data.plannedDistanceKm.toString()
          : null,
      dayOrderIndex: maxPos + 1,
    })
    .returning({ id: trainingActivities.id });

  return { success: true, data: { id: row!.id } };
}

const UpdateActivitySchema = z.object({
  id: UuidSchema,
  activityTypeId: UuidSchema.optional(),
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  plannedDurationMin: z
    .number()
    .int()
    .positive()
    .max(1440)
    .nullable()
    .optional(),
  plannedDistanceKm: z
    .number()
    .nonnegative()
    .max(1000)
    .nullable()
    .optional(),
});

export async function updateActivity(
  input: unknown,
): Promise<ActionResult<null>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };
  const parsed = UpdateActivitySchema.safeParse(input);
  if (!parsed.success)
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };

  // If activityTypeId is being changed, verify ownership of the new type.
  if (parsed.data.activityTypeId) {
    const [type] = await db
      .select({ id: trainingActivityTypes.id })
      .from(trainingActivityTypes)
      .where(
        and(
          eq(trainingActivityTypes.id, parsed.data.activityTypeId),
          eq(trainingActivityTypes.userId, userId),
        ),
      );
    if (!type) return { success: false, error: "Activity type not found" };
  }

  const { id, ...rest } = parsed.data;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updates: Record<string, any> = { updatedAt: sql`now()` };
  for (const [k, v] of Object.entries(rest)) {
    if (v === undefined) continue;
    if (k === "plannedDistanceKm") {
      updates[k] = v != null ? (v as number).toString() : null;
    } else {
      updates[k] = v;
    }
  }

  await db
    .update(trainingActivities)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .set(updates as any)
    .where(
      and(
        eq(trainingActivities.id, id),
        eq(trainingActivities.userId, userId),
      ),
    );
  return { success: true, data: null };
}

const MoveActivitySchema = z.object({
  id: UuidSchema,
  scheduledDate: IsoDateSchema,
  dayOrderIndex: z.number().int().nonnegative().optional(),
});

/**
 * Drag-drop reschedule (D-03). No audit trail. If `dayOrderIndex` omitted,
 * appends at the end of the target day.
 */
export async function moveActivity(
  input: unknown,
): Promise<ActionResult<null>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };
  const parsed = MoveActivitySchema.safeParse(input);
  if (!parsed.success)
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };

  let targetOrder = parsed.data.dayOrderIndex;
  if (targetOrder === undefined) {
    const [{ maxPos }] = await db
      .select({
        maxPos: sql<number>`COALESCE(MAX(${trainingActivities.dayOrderIndex}), -1)`,
      })
      .from(trainingActivities)
      .where(
        and(
          eq(trainingActivities.userId, userId),
          eq(trainingActivities.scheduledDate, parsed.data.scheduledDate),
        ),
      );
    targetOrder = maxPos + 1;
  }

  await db
    .update(trainingActivities)
    .set({
      scheduledDate: parsed.data.scheduledDate,
      dayOrderIndex: targetOrder,
      updatedAt: sql`now()`,
    })
    .where(
      and(
        eq(trainingActivities.id, parsed.data.id),
        eq(trainingActivities.userId, userId),
      ),
    );
  return { success: true, data: null };
}

const CompleteActivitySchema = z.object({
  id: UuidSchema,
  actualDurationMin: z
    .number()
    .int()
    .positive()
    .max(1440)
    .nullable()
    .optional(),
  actualDistanceKm: z
    .number()
    .nonnegative()
    .max(1000)
    .nullable()
    .optional(),
});

/**
 * Status → 'done'. Stores actuals (null allowed per D-09 — skip logging
 * is one-click in the completion modal).
 */
export async function completeActivity(
  input: unknown,
): Promise<ActionResult<null>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };
  const parsed = CompleteActivitySchema.safeParse(input);
  if (!parsed.success)
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };

  await db
    .update(trainingActivities)
    .set({
      status: "done",
      completedAt: sql`now()`,
      actualDurationMin: parsed.data.actualDurationMin ?? null,
      actualDistanceKm:
        parsed.data.actualDistanceKm != null
          ? parsed.data.actualDistanceKm.toString()
          : null,
      updatedAt: sql`now()`,
    })
    .where(
      and(
        eq(trainingActivities.id, parsed.data.id),
        eq(trainingActivities.userId, userId),
      ),
    );
  return { success: true, data: null };
}

const StatusOnlySchema = z.object({ id: UuidSchema });

/** Status → 'cancelled' (intentional skip per D-11). */
export async function cancelActivity(
  input: unknown,
): Promise<ActionResult<null>> {
  return setActivityStatus(input, "cancelled");
}

/** Status → 'skipped' (no strong intent per D-11). */
export async function skipActivity(
  input: unknown,
): Promise<ActionResult<null>> {
  return setActivityStatus(input, "skipped");
}

async function setActivityStatus(
  input: unknown,
  status: z.infer<typeof StatusSchema>,
): Promise<ActionResult<null>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };
  const parsed = StatusOnlySchema.safeParse(input);
  if (!parsed.success)
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };

  await db
    .update(trainingActivities)
    .set({
      status,
      // Clear completedAt when leaving 'done' state
      completedAt: status === "done" ? sql`now()` : null,
      updatedAt: sql`now()`,
    })
    .where(
      and(
        eq(trainingActivities.id, parsed.data.id),
        eq(trainingActivities.userId, userId),
      ),
    );
  return { success: true, data: null };
}

export async function deleteActivity(
  input: unknown,
): Promise<ActionResult<null>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };
  const parsed = DeleteByIdSchema.safeParse(input);
  if (!parsed.success)
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };

  // Per-day data — hard delete (archive doesn't make sense here).
  await db
    .delete(trainingActivities)
    .where(
      and(
        eq(trainingActivities.id, parsed.data.id),
        eq(trainingActivities.userId, userId),
      ),
    );
  return { success: true, data: null };
}
