"use server";

/**
 * JARVIS Routines — server-side CRUD.
 *
 * Data foundation for natural-language "routines + triggers". A routine is a set
 * of triggers → an ordered sequence of agentic blocks; the freeform payload
 * lives in the JSONB `spec` column, validated here against `zRoutineSpec` (the
 * jarvis-core contract) before every write. Scheduler-relevant fields
 * (triggerTypes, nextRunAt) are DERIVED denormalizations recomputed from the
 * validated spec on every write — the spec stays the single source of truth.
 *
 * Every action:
 *   1. Authenticates via getClaims() — NEVER trusts a client-supplied userId.
 *   2. Zod-validates input before any DB write.
 *   3. Scopes every read/write `WHERE user_id = userId` for defense-in-depth,
 *      even though the DB-level RLS policies (migration 0023) already enforce it.
 *
 * Mirrors jarvis-facts.ts (auth + Zod + userId-scoped writes) and
 * desktop-devices.ts (ActionResult union + list/toggle + revalidatePath).
 */

import { and, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  type Routine,
  type RoutineSpec,
  type RoutineTriggerType,
  computeNextRunAt,
  deriveTriggerTypes,
  zRoutineSpec,
} from "@hyperpolymath/jarvis-core/routines";
import { db } from "@/lib/db";
import { routines, users } from "@/lib/db/schema";
import { createClient } from "@/lib/supabase/server";

type ActionResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string };

async function getUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  return data.claims.sub;
}

/** IANA tz fallback for time triggers that omit their own tz. UTC when unset. */
async function getUserTimezone(userId: string): Promise<string> {
  const [row] = await db
    .select({ timezone: users.timezone })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row?.timezone ?? "UTC";
}

// Routines authoring now lives in the centralized JARVIS tab.
const ROUTINES_PATH = "/jarvis";

// ---------------------------------------------------------------------------
// Row → API shape
// ---------------------------------------------------------------------------

type RoutineRow = typeof routines.$inferSelect;

function toRoutine(row: RoutineRow): Routine {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    enabled: row.enabled,
    spec: row.spec,
    triggerTypes: row.triggerTypes as RoutineTriggerType[],
    nextRunAt: row.nextRunAt ? row.nextRunAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Recompute the denormalized scheduler columns from a validated spec. */
function derive(spec: RoutineSpec, fallbackTz: string) {
  return {
    triggerTypes: deriveTriggerTypes(spec),
    nextRunAt: (() => {
      const iso = computeNextRunAt(spec, fallbackTz);
      return iso ? new Date(iso) : null;
    })(),
  };
}

// ---------------------------------------------------------------------------
// listRoutines
// ---------------------------------------------------------------------------

export async function listRoutines(): Promise<ActionResult<Routine[]>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not signed in" };

  try {
    const rows = await db
      .select()
      .from(routines)
      .where(eq(routines.userId, userId))
      .orderBy(desc(routines.updatedAt));
    return { success: true, data: rows.map(toRoutine) };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ---------------------------------------------------------------------------
// createRoutine
// ---------------------------------------------------------------------------

const CreateRoutineSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  spec: zRoutineSpec,
});

export type CreateRoutineInput = z.input<typeof CreateRoutineSchema>;

export async function createRoutine(
  input: CreateRoutineInput,
): Promise<ActionResult<{ id: string }>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not signed in" };

  const parsed = CreateRoutineSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.message };

  try {
    const tz = await getUserTimezone(userId);
    const spec = parsed.data.spec as RoutineSpec;
    const { triggerTypes, nextRunAt } = derive(spec, tz);

    const [row] = await db
      .insert(routines)
      .values({
        userId,
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        spec,
        triggerTypes,
        nextRunAt,
      })
      .returning({ id: routines.id });

    revalidatePath(ROUTINES_PATH);
    return { success: true, data: { id: row!.id } };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ---------------------------------------------------------------------------
// updateRoutine
// ---------------------------------------------------------------------------

const UpdateRoutineSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(500).nullable().optional(),
  spec: zRoutineSpec.optional(),
});

export type UpdateRoutineInput = z.input<typeof UpdateRoutineSchema>;

export async function updateRoutine(
  input: UpdateRoutineInput,
): Promise<ActionResult<null>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not signed in" };

  const parsed = UpdateRoutineSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.message };
  const { id, name, description, spec } = parsed.data;

  try {
    const set: Partial<typeof routines.$inferInsert> = { updatedAt: new Date() };
    if (name !== undefined) set.name = name;
    if (description !== undefined) set.description = description;
    if (spec !== undefined) {
      const tz = await getUserTimezone(userId);
      const { triggerTypes, nextRunAt } = derive(spec as RoutineSpec, tz);
      set.spec = spec as RoutineSpec;
      set.triggerTypes = triggerTypes;
      set.nextRunAt = nextRunAt;
    }

    const updated = await db
      .update(routines)
      .set(set)
      .where(and(eq(routines.id, id), eq(routines.userId, userId)))
      .returning({ id: routines.id });

    if (updated.length === 0) return { success: false, error: "Routine not found" };

    revalidatePath(ROUTINES_PATH);
    return { success: true, data: null };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ---------------------------------------------------------------------------
// toggleRoutine
// ---------------------------------------------------------------------------

const ToggleRoutineSchema = z.object({
  id: z.string().uuid(),
  enabled: z.boolean(),
});

export type ToggleRoutineInput = z.input<typeof ToggleRoutineSchema>;

export async function toggleRoutine(
  input: ToggleRoutineInput,
): Promise<ActionResult<null>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not signed in" };

  const parsed = ToggleRoutineSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.message };

  try {
    const updated = await db
      .update(routines)
      .set({ enabled: parsed.data.enabled, updatedAt: new Date() })
      .where(and(eq(routines.id, parsed.data.id), eq(routines.userId, userId)))
      .returning({ id: routines.id });

    if (updated.length === 0) return { success: false, error: "Routine not found" };

    revalidatePath(ROUTINES_PATH);
    return { success: true, data: null };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ---------------------------------------------------------------------------
// deleteRoutine
// ---------------------------------------------------------------------------

const DeleteRoutineSchema = z.object({ id: z.string().uuid() });

export type DeleteRoutineInput = z.input<typeof DeleteRoutineSchema>;

export async function deleteRoutine(
  input: DeleteRoutineInput,
): Promise<ActionResult<null>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not signed in" };

  const parsed = DeleteRoutineSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.message };

  try {
    const deleted = await db
      .delete(routines)
      .where(and(eq(routines.id, parsed.data.id), eq(routines.userId, userId)))
      .returning({ id: routines.id });

    if (deleted.length === 0) return { success: false, error: "Routine not found" };

    revalidatePath(ROUTINES_PATH);
    return { success: true, data: null };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
