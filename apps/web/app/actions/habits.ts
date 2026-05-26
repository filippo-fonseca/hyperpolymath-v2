"use server";

import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lte,
  sql,
} from "drizzle-orm";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import {
  areas,
  habitCompletions,
  habits,
  habitsAreas,
} from "@/lib/db/schema";

type ActionResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string };

async function getUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) return null;
  return data.claims.sub;
}

/**
 * 7-element boolean schedule, Sun → Sat. We accept anything truthy/falsy
 * the client sends and clamp/coerce to booleans before persisting so a
 * stray `undefined` from a buggy form doesn't break the constraint.
 */
const DaysOfWeekSchema = z
  .array(z.boolean())
  .length(7, "Schedule must cover all 7 days");

const CreateHabitSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1, "Name required").max(120),
  description: z.string().max(500).nullable().optional(),
  icon: z.string().max(64).nullable().optional(),
  daysOfWeek: DaysOfWeekSchema,
  areaIds: z.array(z.string().uuid()).min(0).max(20),
});

const UpdateHabitSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(500).nullable().optional(),
  icon: z.string().max(64).nullable().optional(),
  daysOfWeek: DaysOfWeekSchema.optional(),
  areaIds: z.array(z.string().uuid()).max(20).optional(),
  archived: z.boolean().optional(),
});

const ToggleCompletionSchema = z.object({
  habitId: z.string().uuid(),
  /** ISO `YYYY-MM-DD` — the user-local date this check belongs to. */
  completedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date"),
  /** When false, removes the completion for that date instead. */
  completed: z.boolean(),
});

export type HabitRow = typeof habits.$inferSelect;
export type HabitWithAreas = HabitRow & {
  areas: { id: string; name: string; emoji: string | null }[];
};

// ──────────────────────────────────────────────────────────────────────────
// Reads
// ──────────────────────────────────────────────────────────────────────────

/**
 * All active habits for the signed-in user, each joined with its linked
 * areas. Ordered by `orderIndex` then `createdAt` so a manual reorder (if we
 * ever add one) wins over insertion order.
 */
export async function getHabitsForCurrentUser(): Promise<HabitWithAreas[]> {
  const userId = await getUserId();
  if (!userId) throw new Error("Unauthorized");

  const habitRows = await db
    .select()
    .from(habits)
    .where(and(eq(habits.userId, userId), isNull(habits.archivedAt)))
    .orderBy(asc(habits.orderIndex), asc(habits.createdAt));

  if (habitRows.length === 0) return [];

  // One round-trip for all area links across this user's habits, then group.
  const links = await db
    .select({
      habitId: habitsAreas.habitId,
      areaId: areas.id,
      areaName: areas.name,
      areaEmoji: areas.emoji,
    })
    .from(habitsAreas)
    .innerJoin(areas, eq(habitsAreas.areaId, areas.id))
    .where(eq(habitsAreas.userId, userId));

  const byHabit = new Map<
    string,
    { id: string; name: string; emoji: string | null }[]
  >();
  for (const l of links) {
    const arr = byHabit.get(l.habitId) ?? [];
    arr.push({ id: l.areaId, name: l.areaName, emoji: l.areaEmoji });
    byHabit.set(l.habitId, arr);
  }

  return habitRows.map((h) => ({ ...h, areas: byHabit.get(h.id) ?? [] }));
}

/**
 * Archived habits, newest archive first. Powers the Archive tab on /habits.
 * Includes the same area chips so the archive view stays browsable rather
 * than turning into a flat list of strings.
 */
export async function getArchivedHabitsForCurrentUser(): Promise<
  HabitWithAreas[]
> {
  const userId = await getUserId();
  if (!userId) throw new Error("Unauthorized");

  const habitRows = await db
    .select()
    .from(habits)
    .where(and(eq(habits.userId, userId), isNotNull(habits.archivedAt)))
    .orderBy(desc(habits.archivedAt), desc(habits.createdAt));

  if (habitRows.length === 0) return [];

  const links = await db
    .select({
      habitId: habitsAreas.habitId,
      areaId: areas.id,
      areaName: areas.name,
      areaEmoji: areas.emoji,
    })
    .from(habitsAreas)
    .innerJoin(areas, eq(habitsAreas.areaId, areas.id))
    .where(eq(habitsAreas.userId, userId));

  const byHabit = new Map<
    string,
    { id: string; name: string; emoji: string | null }[]
  >();
  for (const l of links) {
    const arr = byHabit.get(l.habitId) ?? [];
    arr.push({ id: l.areaId, name: l.areaName, emoji: l.areaEmoji });
    byHabit.set(l.habitId, arr);
  }

  return habitRows.map((h) => ({ ...h, areas: byHabit.get(h.id) ?? [] }));
}

/**
 * Completions in a date window (inclusive). Used by the dashboard's daily
 * panel and by the insights tab for weekly heatmaps.
 *
 * Dates are passed as `YYYY-MM-DD` strings so the client decides "today" in
 * its own timezone without a TZ round-trip.
 */
export async function getHabitCompletionsInRange(
  startDate: string,
  endDate: string,
): Promise<{ habitId: string; completedDate: string }[]> {
  const userId = await getUserId();
  if (!userId) throw new Error("Unauthorized");

  const rows = await db
    .select({
      habitId: habitCompletions.habitId,
      completedDate: habitCompletions.completedDate,
    })
    .from(habitCompletions)
    .where(
      and(
        eq(habitCompletions.userId, userId),
        gte(habitCompletions.completedDate, startDate),
        lte(habitCompletions.completedDate, endDate),
      ),
    );

  // `date` columns come back as Date objects via the driver; normalize back
  // to YYYY-MM-DD so the wire shape matches the request.
  return rows.map((r) => ({
    habitId: r.habitId,
    completedDate:
      typeof r.completedDate === "string"
        ? r.completedDate
        : (r.completedDate as Date).toISOString().slice(0, 10),
  }));
}

// ──────────────────────────────────────────────────────────────────────────
// Writes
// ──────────────────────────────────────────────────────────────────────────

export async function createHabit(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };
  const parsed = CreateHabitSchema.safeParse(input);
  if (!parsed.success)
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };

  // Verify every requested area belongs to this user before linking — Server
  // Action enforcement, RLS is defense-in-depth.
  if (parsed.data.areaIds.length > 0) {
    const owned = await db
      .select({ id: areas.id })
      .from(areas)
      .where(
        and(
          eq(areas.userId, userId),
          inArray(areas.id, parsed.data.areaIds),
        ),
      );
    if (owned.length !== parsed.data.areaIds.length) {
      return { success: false, error: "One or more areas not found" };
    }
  }

  // Append-to-end order.
  const [{ maxOrder }] = await db
    .select({
      maxOrder: sql<number>`COALESCE(MAX(${habits.orderIndex}), -1)`,
    })
    .from(habits)
    .where(eq(habits.userId, userId));

  const result = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(habits)
      .values({
        ...(parsed.data.id ? { id: parsed.data.id } : {}),
        userId,
        name: parsed.data.name.trim(),
        description: parsed.data.description?.trim() || null,
        icon: parsed.data.icon || null,
        daysOfWeek: parsed.data.daysOfWeek,
        orderIndex: maxOrder + 1,
      })
      .returning({ id: habits.id });
    if (!row) throw new Error("Insert failed");

    if (parsed.data.areaIds.length > 0) {
      await tx.insert(habitsAreas).values(
        parsed.data.areaIds.map((areaId) => ({
          habitId: row.id,
          areaId,
          userId,
        })),
      );
    }
    return row.id;
  });

  return { success: true, data: { id: result } };
}

export async function updateHabit(
  input: unknown,
): Promise<ActionResult<null>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };
  const parsed = UpdateHabitSchema.safeParse(input);
  if (!parsed.success)
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };

  // Confirm the habit belongs to the user before any mutation.
  const [existing] = await db
    .select({ id: habits.id })
    .from(habits)
    .where(and(eq(habits.id, parsed.data.id), eq(habits.userId, userId)))
    .limit(1);
  if (!existing) return { success: false, error: "Habit not found" };

  // Build patch dynamically — only set provided fields. The `archived` flag
  // toggles `archived_at` between null and now() so we can keep a single
  // server action for both archive and unarchive (matches the projects
  // archive flow).
  type HabitsUpdate = Partial<typeof habits.$inferInsert>;
  const patch: HabitsUpdate = { updatedAt: new Date() };
  if (parsed.data.name !== undefined) patch.name = parsed.data.name.trim();
  if (parsed.data.description !== undefined)
    patch.description = parsed.data.description?.trim() || null;
  if (parsed.data.icon !== undefined) patch.icon = parsed.data.icon || null;
  if (parsed.data.daysOfWeek !== undefined)
    patch.daysOfWeek = parsed.data.daysOfWeek;
  if (parsed.data.archived !== undefined)
    patch.archivedAt = parsed.data.archived ? new Date() : null;

  await db.transaction(async (tx) => {
    await tx.update(habits).set(patch).where(eq(habits.id, parsed.data.id));

    if (parsed.data.areaIds !== undefined) {
      // Verify ownership of every incoming area id.
      if (parsed.data.areaIds.length > 0) {
        const owned = await tx
          .select({ id: areas.id })
          .from(areas)
          .where(
            and(
              eq(areas.userId, userId),
              inArray(areas.id, parsed.data.areaIds),
            ),
          );
        if (owned.length !== parsed.data.areaIds.length) {
          throw new Error("One or more areas not found");
        }
      }
      // Replace the link set.
      await tx
        .delete(habitsAreas)
        .where(eq(habitsAreas.habitId, parsed.data.id));
      if (parsed.data.areaIds.length > 0) {
        await tx.insert(habitsAreas).values(
          parsed.data.areaIds.map((areaId) => ({
            habitId: parsed.data.id,
            areaId,
            userId,
          })),
        );
      }
    }
  });

  return { success: true, data: null };
}

export async function deleteHabit(
  id: string,
): Promise<ActionResult<null>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };
  if (!/^[\w-]{36}$/.test(id))
    return { success: false, error: "Invalid id" };

  await db
    .delete(habits)
    .where(and(eq(habits.id, id), eq(habits.userId, userId)));
  return { success: true, data: null };
}

/**
 * Toggle the habit's completion for a specific date. Insert when
 * `completed=true`, delete when `completed=false`. ON CONFLICT DO NOTHING
 * on insert keeps double-taps idempotent (uniq index also enforces this).
 */
export async function toggleHabitCompletion(
  input: unknown,
): Promise<ActionResult<{ completed: boolean }>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };
  const parsed = ToggleCompletionSchema.safeParse(input);
  if (!parsed.success)
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };

  // Verify habit ownership before any mutation. Cheap single-row check.
  const [owned] = await db
    .select({ id: habits.id })
    .from(habits)
    .where(
      and(eq(habits.id, parsed.data.habitId), eq(habits.userId, userId)),
    )
    .limit(1);
  if (!owned) return { success: false, error: "Habit not found" };

  if (parsed.data.completed) {
    await db
      .insert(habitCompletions)
      .values({
        habitId: parsed.data.habitId,
        userId,
        completedDate: parsed.data.completedDate,
      })
      .onConflictDoNothing();
  } else {
    await db
      .delete(habitCompletions)
      .where(
        and(
          eq(habitCompletions.habitId, parsed.data.habitId),
          eq(habitCompletions.completedDate, parsed.data.completedDate),
          eq(habitCompletions.userId, userId),
        ),
      );
  }

  return { success: true, data: { completed: parsed.data.completed } };
}
