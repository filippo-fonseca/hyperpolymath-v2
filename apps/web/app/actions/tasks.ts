"use server";

import { z } from "zod";
import { and, eq, inArray, sql } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { tasks, tasksProjects, projects } from "@/lib/db/schema";
import {
  RecurrenceRuleSchema,
  normalizeRule,
  nextOccurrence,
} from "@/lib/tasks/recurrence";
import { format } from "date-fns";

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

const PriorityEnum = z.enum(["P∞", "P1", "P2", "P3"]);
const StatusEnum = z.enum([
  "not started",
  "up next",
  "in progress",
  "almost done",
  "lesno",
]);

/**
 * RT-05: Server respects caller-supplied UUID so client useOptimistic + Realtime
 * echo can dedupe by id.
 */
const CreateTaskSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(500),
  notes: z.string().trim().max(10000).nullable().optional(),
  priority: PriorityEnum.default("P3"),
  status: StatusEnum.default("not started"),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  projectIds: z.array(z.string().uuid()).max(20).default([]),
  // Issue #144 — optional recurrence rule. null/absent = one-off task.
  recurrence: RecurrenceRuleSchema.nullable().optional(),
});

export async function createTask(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };
  const parsed = CreateTaskSchema.safeParse(input);
  if (!parsed.success)
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };

  // Append at end of target column
  const [{ maxPos }] = await db
    .select({ maxPos: sql<number>`COALESCE(MAX(${tasks.kanbanPosition}), -1)` })
    .from(tasks)
    .where(
      and(eq(tasks.userId, userId), eq(tasks.status, parsed.data.status)),
    );

  const result = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(tasks)
      .values({
        ...(parsed.data.id ? { id: parsed.data.id } : {}),
        userId,
        title: parsed.data.title,
        notes: parsed.data.notes ?? null,
        priority: parsed.data.priority,
        status: parsed.data.status,
        dueDate: parsed.data.dueDate ?? null,
        recurrence: parsed.data.recurrence
          ? normalizeRule(parsed.data.recurrence)
          : null,
        kanbanPosition: maxPos + 1,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        completedAt: (parsed.data.status === "lesno" ? sql`now()` : null) as any,
      })
      .returning({ id: tasks.id });

    if (parsed.data.projectIds.length > 0) {
      // Verify all project IDs belong to user
      const ownedProjects = await tx
        .select({ id: projects.id })
        .from(projects)
        .where(
          and(
            eq(projects.userId, userId),
            inArray(projects.id, parsed.data.projectIds),
          ),
        );
      const ownedIds = new Set(ownedProjects.map((p) => p.id));
      const validProjectIds = parsed.data.projectIds.filter((id) =>
        ownedIds.has(id),
      );
      if (validProjectIds.length > 0) {
        await tx.insert(tasksProjects).values(
          validProjectIds.map((projectId) => ({
            taskId: row!.id,
            projectId,
            userId, // denormalized
          })),
        );
      }
    }
    return row!.id;
  });

  return { success: true, data: { id: result } };
}

const UpdateTaskSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1).max(500).optional(),
  notes: z.string().trim().max(10000).nullable().optional(),
  priority: PriorityEnum.optional(),
  status: StatusEnum.optional(),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  projectIds: z.array(z.string().uuid()).max(20).optional(),
  // Issue #144 — set a rule, change it, or clear it (null ends the recurrence,
  // turning the task back into a one-off).
  recurrence: RecurrenceRuleSchema.nullable().optional(),
});

export async function updateTask(
  input: unknown,
): Promise<ActionResult<null>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };
  const parsed = UpdateTaskSchema.safeParse(input);
  if (!parsed.success)
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };

  const { id, projectIds, ...rest } = parsed.data;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updates: Record<string, any> = { updatedAt: sql`now()` };
  for (const [k, v] of Object.entries(rest)) if (v !== undefined) updates[k] = v;
  // Issue #144 — normalize a non-null recurrence rule before persisting.
  // `null` (clear / end recurrence) passes through verbatim.
  if (rest.recurrence !== undefined && rest.recurrence !== null) {
    updates.recurrence = normalizeRule(rest.recurrence);
  }
  // If status transitions to lesno, set completedAt; if away from lesno, clear it
  const newStatus = rest.status as string | undefined;
  if (newStatus === "lesno") updates.completedAt = sql`now()`;
  else if (newStatus !== undefined) updates.completedAt = null;

  await db.transaction(async (tx) => {
    await tx
      .update(tasks)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .set(updates as any)
      .where(and(eq(tasks.id, id), eq(tasks.userId, userId)));
    if (projectIds !== undefined) {
      await tx
        .delete(tasksProjects)
        .where(
          and(eq(tasksProjects.taskId, id), eq(tasksProjects.userId, userId)),
        );
      if (projectIds.length > 0) {
        const ownedProjects = await tx
          .select({ id: projects.id })
          .from(projects)
          .where(
            and(
              eq(projects.userId, userId),
              inArray(projects.id, projectIds),
            ),
          );
        const ownedIds = new Set(ownedProjects.map((p) => p.id));
        const validIds = projectIds.filter((pid) => ownedIds.has(pid));
        if (validIds.length > 0) {
          await tx
            .insert(tasksProjects)
            .values(
              validIds.map((projectId) => ({ taskId: id, projectId, userId })),
            );
        }
      }
    }
  });

  return { success: true, data: null };
}

/**
 * Status-only update — fast path for kanban cross-column drop.
 * Returns whether the new status is "lesno" so the client can fire the "Lesno." toast.
 */
const UpdateStatusSchema = z.object({
  id: z.string().uuid(),
  newStatus: StatusEnum,
});

export async function updateTaskStatus(
  input: unknown,
): Promise<ActionResult<{ becameLesno: boolean }>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };
  const parsed = UpdateStatusSchema.safeParse(input);
  if (!parsed.success)
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };

  // Append at end of target column
  const [{ maxPos }] = await db
    .select({ maxPos: sql<number>`COALESCE(MAX(${tasks.kanbanPosition}), -1)` })
    .from(tasks)
    .where(
      and(
        eq(tasks.userId, userId),
        eq(tasks.status, parsed.data.newStatus),
      ),
    );

  await db
    .update(tasks)
    .set({
      status: parsed.data.newStatus,
      kanbanPosition: maxPos + 1,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      completedAt: (parsed.data.newStatus === "lesno" ? sql`now()` : null) as any,
      updatedAt: sql`now()`,
    })
    .where(and(eq(tasks.id, parsed.data.id), eq(tasks.userId, userId)));

  return {
    success: true,
    data: { becameLesno: parsed.data.newStatus === "lesno" },
  };
}

/**
 * Bulk update due-date — used by the kanban day view's "Move to tomorrow",
 * "This Sunday", "Next week", and "Custom date" affordances. Single
 * transaction so partial failures revert. `dueDate: null` clears the date
 * (moves the tasks back to the Inbox tray).
 */
const BulkUpdateDueDateSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
});

export async function bulkUpdateTaskDueDate(
  input: unknown,
): Promise<ActionResult<{ updated: number }>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };
  const parsed = BulkUpdateDueDateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  const result = await db
    .update(tasks)
    .set({ dueDate: parsed.data.dueDate, updatedAt: sql`now()` })
    .where(and(inArray(tasks.id, parsed.data.ids), eq(tasks.userId, userId)))
    .returning({ id: tasks.id });

  return { success: true, data: { updated: result.length } };
}

const BulkDeleteSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500),
});

export async function bulkDeleteTasks(
  input: unknown,
): Promise<ActionResult<{ deleted: number }>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };
  const parsed = BulkDeleteSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  const result = await db
    .delete(tasks)
    .where(and(inArray(tasks.id, parsed.data.ids), eq(tasks.userId, userId)))
    .returning({ id: tasks.id });

  return { success: true, data: { deleted: result.length } };
}

// ---------------------------------------------------------------------------
// Recurring tasks (issue #144)
// ---------------------------------------------------------------------------

/**
 * Advance a recurring task to its NEXT occurrence.
 *
 * The whole series is one live row. "Completing" or "skipping" an occurrence does
 * NOT permanently finish the task: it advances `due_date` to the next date the
 * rule fires and resets the row to "not started" so it surfaces fresh at the
 * appropriate time. This is the deliberate departure from Habits — no streak, no
 * per-day log, just a self-rescheduling to-do.
 *
 * `mode: "complete"` is the "I did this occurrence" path; `mode: "skip"` is the
 * "skip / reschedule this occurrence" path. Both compute the same next date; they
 * differ only in the toast the client shows. Missed occurrences are handled
 * implicitly: the next date is always computed from the CURRENT due date (or
 * today if none), and `nextOccurrence` guarantees a date strictly in the future
 * of that anchor — overdue recurring tasks simply roll forward when actioned.
 *
 * If the task has no recurrence rule, this is a no-op error (caller should use
 * updateTaskStatus instead).
 */
const AdvanceRecurringSchema = z.object({
  id: z.string().uuid(),
  mode: z.enum(["complete", "skip"]).default("complete"),
});

export async function advanceRecurringTask(
  input: unknown,
): Promise<ActionResult<{ nextDueDate: string }>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };
  const parsed = AdvanceRecurringSchema.safeParse(input);
  if (!parsed.success)
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };

  const [row] = await db
    .select({ recurrence: tasks.recurrence, dueDate: tasks.dueDate })
    .from(tasks)
    .where(and(eq(tasks.id, parsed.data.id), eq(tasks.userId, userId)))
    .limit(1);

  if (!row) return { success: false, error: "Task not found" };
  if (!row.recurrence)
    return { success: false, error: "Task is not recurring" };

  // Anchor the next date on the current due date, or today if the row has none.
  const anchor = row.dueDate ?? format(new Date(), "yyyy-MM-dd");
  const next = nextOccurrence(row.recurrence, anchor);

  await db
    .update(tasks)
    .set({
      dueDate: next,
      // Reset to the start of the column lifecycle for the new occurrence.
      status: "not started",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      completedAt: null as any,
      updatedAt: sql`now()`,
    })
    .where(and(eq(tasks.id, parsed.data.id), eq(tasks.userId, userId)));

  return { success: true, data: { nextDueDate: next } };
}

/**
 * End the recurrence on a task: clears the rule so the row becomes an ordinary
 * one-off task (its current due date / status are untouched). This is the
 * "stop repeating, keep this instance" path. To delete the whole series, use
 * deleteTask (one row == the series).
 */
export async function endTaskRecurrence(
  id: string,
): Promise<ActionResult<null>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };
  if (!z.string().uuid().safeParse(id).success)
    return { success: false, error: "Invalid id" };
  await db
    .update(tasks)
    .set({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      recurrence: null as any,
      updatedAt: sql`now()`,
    })
    .where(and(eq(tasks.id, id), eq(tasks.userId, userId)));
  return { success: true, data: null };
}

export async function deleteTask(id: string): Promise<ActionResult<null>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };
  if (!z.string().uuid().safeParse(id).success)
    return { success: false, error: "Invalid id" };
  await db
    .delete(tasks)
    .where(and(eq(tasks.id, id), eq(tasks.userId, userId)));
  return { success: true, data: null };
}

/**
 * D-06: drag reorder within a column. Atomic rewrite of kanbanPosition for all tasks in this column.
 */
const ReorderTasksSchema = z.object({
  status: StatusEnum,
  orderedIds: z.array(z.string().uuid()).min(1),
});

export async function reorderTasks(
  input: unknown,
): Promise<ActionResult<null>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };
  const parsed = ReorderTasksSchema.safeParse(input);
  if (!parsed.success)
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };

  await db.transaction(async (tx) => {
    for (let i = 0; i < parsed.data.orderedIds.length; i++) {
      await tx
        .update(tasks)
        .set({ kanbanPosition: i })
        .where(
          and(
            eq(tasks.id, parsed.data.orderedIds[i]!),
            eq(tasks.userId, userId),
            eq(tasks.status, parsed.data.status),
          ),
        );
    }
  });
  return { success: true, data: null };
}

// Convenience action used by detail panel: replace the project links for a task
const LinkProjectsSchema = z.object({
  taskId: z.string().uuid(),
  projectIds: z.array(z.string().uuid()).max(20),
});

export async function linkTaskToProjects(
  input: unknown,
): Promise<ActionResult<null>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };
  const parsed = LinkProjectsSchema.safeParse(input);
  if (!parsed.success)
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };

  await db.transaction(async (tx) => {
    await tx
      .delete(tasksProjects)
      .where(
        and(
          eq(tasksProjects.taskId, parsed.data.taskId),
          eq(tasksProjects.userId, userId),
        ),
      );
    if (parsed.data.projectIds.length > 0) {
      const ownedProjects = await tx
        .select({ id: projects.id })
        .from(projects)
        .where(
          and(
            eq(projects.userId, userId),
            inArray(projects.id, parsed.data.projectIds),
          ),
        );
      const ownedIds = new Set(ownedProjects.map((p) => p.id));
      const validIds = parsed.data.projectIds.filter((pid) =>
        ownedIds.has(pid),
      );
      if (validIds.length > 0) {
        await tx.insert(tasksProjects).values(
          validIds.map((projectId) => ({
            taskId: parsed.data.taskId,
            projectId,
            userId,
          })),
        );
      }
    }
  });
  return { success: true, data: null };
}

/**
 * Auth-gated SELECT for the signed-in user's tasks (with linked projects).
 * queryFn target for useQuery({ queryKey: tableKey("tasks", userId) }) in
 * TasksClient.tsx. Returns the same TaskWithProjects shape as the SSR initial
 * fetch (getAllTasksForUser) so React-Query refetches stay shape-compatible.
 *
 * CLAUDE.md Critical Pattern 1: getClaims (NOT getSession) — validates JWT.
 */
export async function getTasksForCurrentUser(): Promise<
  import("@/lib/db/queries/tasks").TaskWithProjects[]
> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) throw new Error("Unauthorized");
  const { getAllTasksForUser } = await import("@/lib/db/queries/tasks");
  return getAllTasksForUser(data.claims.sub);
}
