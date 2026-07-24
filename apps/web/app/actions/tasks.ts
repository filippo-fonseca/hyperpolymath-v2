"use server";

import { z } from "zod";
import { and, eq, inArray, isNotNull, lt, ne, sql } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { tasks, tasksHashtags, tasksProjects, projects } from "@/lib/db/schema";
import {
  RecurrenceRuleSchema,
  normalizeRule,
  nextOccurrence,
} from "@/lib/tasks/recurrence";
import {
  DueTimeSchema,
  TaskRemindersSchema,
  normalizeReminders,
} from "@/lib/tasks/reminders";
import { format, subDays } from "date-fns";
import { upsertHashtag } from "./hashtags";
import {
  reconcilePersonReferencesForUser,
  resolveOrCreatePersonForUser,
} from "./people";
import { ensureEntityPeople, scheduleEntityPeopleDerivation } from "@/lib/people/derive";
import { scheduleEntityEmbedding } from "@/lib/references/embedding-enqueue";
import {
  deleteReferencesForEntities,
  deleteReferencesForEntity,
  reconcileEntityReferencesFromText,
} from "@/lib/references/reconcile";

/** The text scanned for people references on a task: title + notes. */
function taskContent(title: string | undefined | null, notes: string | undefined | null): string {
  return [title ?? "", notes ?? ""].filter(Boolean).join("\n");
}

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
  // Optional HH:mm due time; null = default 09:00 for reminder scheduling.
  dueTime: DueTimeSchema.optional(),
  // Unlimited reminder offsets before due (capped at 50). null/[] = none.
  reminders: TaskRemindersSchema.nullable().optional(),
  // Issue #101 — Notion-style URL property. Stored verbatim (normalized
  // client-side); null/absent = unset. Capped to keep the column sane.
  url: z.string().trim().max(2048).nullable().optional(),
  projectIds: z.array(z.string().uuid()).max(20).default([]),
  // Issue #159 — inline #hashtags and @people parsed from the task title/notes
  // editor. Tags carried as raw names (resolve-or-upserted server-side against
  // the shared hashtags table); people carried as names (resolve-or-created).
  hashtagNames: z.array(z.string().trim().min(1).max(50)).max(20).default([]),
  personNames: z.array(z.string().trim().min(1).max(200)).max(40).default([]),
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
        dueTime: parsed.data.dueTime ?? null,
        reminders: normalizeReminders(parsed.data.reminders ?? null),
        url: parsed.data.url ? parsed.data.url : null,
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

    // Issue #159 — upsert each #hashtag (atomic via tx, race-safe) and link it
    // to the task. Mirrors createCapture's hashtag path.
    if (parsed.data.hashtagNames.length > 0) {
      const seen = new Set<string>();
      const uniqueRaw = parsed.data.hashtagNames.filter((t) => {
        const k = t.toLowerCase();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      const tagIds: string[] = [];
      for (const raw of uniqueRaw) {
        const tag = await upsertHashtag(userId, raw, tx);
        tagIds.push(tag.id);
      }
      if (tagIds.length > 0) {
        await tx.insert(tasksHashtags).values(
          tagIds.map((hashtagId) => ({ taskId: row!.id, hashtagId, userId })),
        );
      }
    }

    // Index reference tokens in the notes — the task's only free-text field and
    // the only one with a mention-capable editor behind it (the title is a
    // plain input). Inside the tx so the index can't survive a rolled back task.
    await reconcileEntityReferencesFromText(tx, {
      userId,
      sourceType: "task",
      sourceId: row!.id,
      text: parsed.data.notes,
    });

    return row!.id;
  });

  // Issue #159 — resolve @-mentioned people (creating new ones) and reconcile
  // people_references for this task. Runs after the task exists; reconcile diffs
  // against the (empty, on create) stored set. Same pattern as createCapture.
  if (parsed.data.personNames.length > 0) {
    const personIds: string[] = [];
    for (const name of parsed.data.personNames) {
      const person = await resolveOrCreatePersonForUser(userId, name);
      if (person) personIds.push(person.id);
    }
    await reconcilePersonReferencesForUser(userId, "task", result, personIds);
  }

  // Auto-derive linked people from title + notes: a background Haiku match links
  // any EXISTING person confidently referenced, additively on top of the
  // explicit @-mentions reconciled above. Scheduled via after(); fail-soft.
  scheduleEntityPeopleDerivation(
    "task",
    result,
    userId,
    taskContent(parsed.data.title, parsed.data.notes),
  );

  // U7: embed the new task (title + notes). No-op unless the semantic rung is on.
  scheduleEntityEmbedding({ userId, entityType: "task", entityId: result });

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
  dueTime: DueTimeSchema.optional(),
  reminders: TaskRemindersSchema.nullable().optional(),
  // Issue #101 — set, change, or clear (null) the URL property. Flows through
  // the generic `rest` apply loop below (null = clear, string = set).
  url: z.string().trim().max(2048).nullable().optional(),
  projectIds: z.array(z.string().uuid()).max(20).optional(),
  // Issue #159 — when present, replaces the task's tag/person links. Absent =
  // leave existing links untouched (a title-only edit never clears them).
  hashtagNames: z.array(z.string().trim().min(1).max(50)).max(20).optional(),
  personNames: z.array(z.string().trim().min(1).max(200)).max(40).optional(),
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

  // Pull the relation fields out of `rest` so they never leak into the scalar
  // column UPDATE below — they're reconciled against join tables separately.
  const { id, projectIds, hashtagNames, personNames, ...rest } = parsed.data;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updates: Record<string, any> = { updatedAt: sql`now()` };
  for (const [k, v] of Object.entries(rest)) if (v !== undefined) updates[k] = v;
  // Issue #101 — treat an empty/whitespace URL as a clear (null) so the column
  // never holds the empty string.
  if (rest.url !== undefined) updates.url = rest.url ? rest.url : null;
  if (rest.dueTime !== undefined) updates.dueTime = rest.dueTime;
  if (rest.reminders !== undefined) {
    updates.reminders = normalizeReminders(rest.reminders);
  }
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

    // Issue #159 — replace the task's hashtag links when the field is present.
    // Delete-then-reinsert mirrors updateCapture; absent field = no-op.
    if (hashtagNames !== undefined) {
      await tx
        .delete(tasksHashtags)
        .where(and(eq(tasksHashtags.taskId, id), eq(tasksHashtags.userId, userId)));
      const seen = new Set<string>();
      const uniqueRaw = hashtagNames.filter((t) => {
        const k = t.toLowerCase();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      for (const raw of uniqueRaw) {
        const tag = await upsertHashtag(userId, raw, tx);
        await tx
          .insert(tasksHashtags)
          .values({ taskId: id, hashtagId: tag.id, userId });
      }
    }

    // Re-index references only when notes are present, so a status- or
    // due-date-only update never clears them. An explicit null clears the
    // notes, and with them the references — which is right: the tokens are
    // gone from the text.
    if (rest.notes !== undefined) {
      await reconcileEntityReferencesFromText(tx, {
        userId,
        sourceType: "task",
        sourceId: id,
        text: rest.notes,
      });
    }
  });

  // Issue #159 — reconcile @-mentioned people only when the field is present,
  // so a title/status-only update never clears existing mentions.
  if (personNames !== undefined) {
    const personIds: string[] = [];
    for (const name of personNames) {
      const person = await resolveOrCreatePersonForUser(userId, name);
      if (person) personIds.push(person.id);
    }
    await reconcilePersonReferencesForUser(userId, "task", id, personIds);
  }

  // Re-derive linked people when the title or notes changed: the background
  // match runs additively over the new text (never removing the reconciled
  // explicit set). Fail-soft.
  if (rest.title !== undefined || rest.notes !== undefined) {
    scheduleEntityPeopleDerivation("task", id, userId, taskContent(rest.title, rest.notes));
  }

  // U7: re-embed when title or notes changed (the enqueue reads the full current
  // text, so a partial update still embeds the whole task). No-op unless on.
  if (rest.title !== undefined || rest.notes !== undefined) {
    scheduleEntityEmbedding({ userId, entityType: "task", entityId: id });
  }

  return { success: true, data: null };
}

/** Server-action wrapper for the task detail panel's lazy on-open backfill. */
export async function ensureTaskPeople(
  id: unknown,
): Promise<ActionResult<{ people: { id: string; name: string }[]; changed: boolean }>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };
  if (!z.string().uuid().safeParse(id).success) return { success: false, error: "Invalid id" };
  try {
    const result = await ensureEntityPeople(userId, "task", id as string);
    return { success: true, data: result };
  } catch (err) {
    console.error("[tasks] ensureTaskPeople failed", err);
    return { success: false, error: "Derivation failed" };
  }
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

  const result = await db.transaction(async (tx) => {
    // One statement for the whole set — a 500-task delete shouldn't cost 1000
    // round trips clearing references one id at a time.
    await deleteReferencesForEntities(tx, {
      userId,
      type: "task",
      ids: parsed.data.ids,
    });
    return await tx
      .delete(tasks)
      .where(and(inArray(tasks.id, parsed.data.ids), eq(tasks.userId, userId)))
      .returning({ id: tasks.id });
  });

  return { success: true, data: { deleted: result.length } };
}

/**
 * Clear incomplete tasks whose due date is more than `olderThanDays` ago.
 * Does not touch completed (lesno) tasks or undated Inbox items.
 */
const ClearStaleIncompleteSchema = z.object({
  olderThanDays: z.number().int().min(1).max(3650),
});

export async function clearStaleIncompleteTasks(
  input: unknown,
): Promise<ActionResult<{ deleted: number; ids: string[] }>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };
  const parsed = ClearStaleIncompleteSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  const cutoff = format(subDays(new Date(), parsed.data.olderThanDays), "yyyy-MM-dd");

  const stale = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(
      and(
        eq(tasks.userId, userId),
        ne(tasks.status, "lesno"),
        isNotNull(tasks.dueDate),
        lt(tasks.dueDate, cutoff),
      ),
    );

  if (stale.length === 0) {
    return { success: true, data: { deleted: 0, ids: [] } };
  }

  const ids = stale.map((r) => r.id);
  // Chunk to stay under the bulk-delete 500 cap.
  let deleted = 0;
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    const r = await bulkDeleteTasks({ ids: chunk });
    if (!r.success) return r;
    deleted += r.data.deleted;
  }

  return { success: true, data: { deleted, ids } };
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
  await db.transaction(async (tx) => {
    // Both directions, by hand: no FK to cascade through.
    await deleteReferencesForEntity(tx, { userId, type: "task", id });
    await tx.delete(tasks).where(and(eq(tasks.id, id), eq(tasks.userId, userId)));
  });
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
