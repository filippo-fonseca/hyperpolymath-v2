"use server";

import { z } from "zod";
import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { tasks, tasksProjects, projects } from "@/lib/db/schema";

type ActionResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string };

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

const CreateTaskSchema = z.object({
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
        userId,
        title: parsed.data.title,
        notes: parsed.data.notes ?? null,
        priority: parsed.data.priority,
        status: parsed.data.status,
        dueDate: parsed.data.dueDate ?? null,
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

  revalidatePath("/tasks");
  revalidatePath("/projects/[projectId]", "page");
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

  revalidatePath("/tasks");
  revalidatePath("/projects/[projectId]", "page");
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

  revalidatePath("/tasks");
  return {
    success: true,
    data: { becameLesno: parsed.data.newStatus === "lesno" },
  };
}

export async function deleteTask(id: string): Promise<ActionResult<null>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };
  if (!z.string().uuid().safeParse(id).success)
    return { success: false, error: "Invalid id" };
  await db
    .delete(tasks)
    .where(and(eq(tasks.id, id), eq(tasks.userId, userId)));
  revalidatePath("/tasks");
  revalidatePath("/projects/[projectId]", "page");
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
  revalidatePath("/tasks");
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
  revalidatePath("/tasks");
  revalidatePath("/projects/[projectId]", "page");
  return { success: true, data: null };
}

