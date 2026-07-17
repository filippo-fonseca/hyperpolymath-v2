"use server";

import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { areas, projects } from "@/lib/db/schema";
import { deleteReferencesForTarget } from "@/lib/references/reconcile";
import { scheduleEntityEmbedding } from "@/lib/references/embedding-enqueue";

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

const SemesterEnum = z.enum(["fall", "spring", "summer"]);

/**
 * PROJ-01 + PROJ-05: create supports basic AND class fields.
 * Class CHECK constraint enforced by Postgres (course_code required when is_class=true).
 *
 * RT-05: Server respects caller-supplied UUID so client useOptimistic + Realtime
 * echo can dedupe by id.
 */
const CreateProjectSchema = z
  .object({
    id: z.string().uuid().optional(),
    areaId: z.string().uuid(),
    name: z.string().trim().min(1).max(100),
    description: z.string().trim().max(2000).nullable().optional(),
    icon: z.string().trim().max(50).nullable().optional(),
    bannerUrl: z.string().trim().max(500).nullable().optional(),
    startDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional(),
    endDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional(),
    isClass: z.boolean().default(false),
    courseCode: z.string().trim().max(40).nullable().optional(),
    courseTitle: z.string().trim().max(200).nullable().optional(),
    instructor: z.string().trim().max(120).nullable().optional(),
    grade: z.string().trim().max(10).nullable().optional(),
    credits: z.number().int().min(0).max(20).nullable().optional(),
    distributionals: z
      .array(z.string().trim().max(20))
      .max(10)
      .nullable()
      .optional(),
    semesterTerm: SemesterEnum.nullable().optional(),
    semesterYear: z.number().int().min(2000).max(2100).nullable().optional(),
  })
  .refine(
    (v) => !v.isClass || (v.courseCode && v.courseCode.length > 0),
    {
      message: "Course code is required for Class projects.",
      path: ["courseCode"],
    },
  );

export async function createProject(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };

  const parsed = CreateProjectSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  // Verify the chosen area belongs to this user (defense-in-depth — RLS already enforces)
  const [areaRow] = await db
    .select({ id: areas.id })
    .from(areas)
    .where(and(eq(areas.id, parsed.data.areaId), eq(areas.userId, userId)))
    .limit(1);
  if (!areaRow) return { success: false, error: "Area not found" };

  // Append-to-end orderIndex within this area
  const [{ maxOrder }] = await db
    .select({
      maxOrder: sql<number>`COALESCE(MAX(${projects.orderIndex}), -1)`,
    })
    .from(projects)
    .where(
      and(
        eq(projects.userId, userId),
        eq(projects.areaId, parsed.data.areaId),
      ),
    );

  try {
    const [row] = await db
      .insert(projects)
      .values({
        ...(parsed.data.id ? { id: parsed.data.id } : {}),
        userId,
        areaId: parsed.data.areaId,
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        icon: parsed.data.icon ?? null,
        bannerUrl: parsed.data.bannerUrl ?? null,
        startDate: parsed.data.startDate ?? null,
        endDate: parsed.data.endDate ?? null,
        orderIndex: maxOrder + 1,
        isClass: parsed.data.isClass,
        courseCode: parsed.data.courseCode ?? null,
        courseTitle: parsed.data.courseTitle ?? null,
        instructor: parsed.data.instructor ?? null,
        grade: parsed.data.grade ?? null,
        credits: parsed.data.credits ?? null,
        distributionals: parsed.data.distributionals ?? null,
        semesterTerm: parsed.data.semesterTerm ?? null,
        semesterYear: parsed.data.semesterYear ?? null,
      })
      .returning({ id: projects.id });

    // U7: embed the new project (name + description). No-op unless the rung is on.
    scheduleEntityEmbedding({ userId, entityType: "project", entityId: row!.id });

    return { success: true, data: { id: row!.id } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Database error";
    return { success: false, error: msg };
  }
}

/**
 * PROJ-02: edit any field. Same shape as create minus areaId
 * (use moveProjectToArea for cross-area moves).
 */
const UpdateProjectSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(100).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  icon: z.string().trim().max(50).nullable().optional(),
  bannerUrl: z.string().trim().max(500).nullable().optional(),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  isClass: z.boolean().optional(),
  courseCode: z.string().trim().max(40).nullable().optional(),
  courseTitle: z.string().trim().max(200).nullable().optional(),
  instructor: z.string().trim().max(120).nullable().optional(),
  grade: z.string().trim().max(10).nullable().optional(),
  credits: z.number().int().min(0).max(20).nullable().optional(),
  distributionals: z
    .array(z.string().trim().max(20))
    .max(10)
    .nullable()
    .optional(),
  semesterTerm: SemesterEnum.nullable().optional(),
  semesterYear: z.number().int().min(2000).max(2100).nullable().optional(),
});

export async function updateProject(
  input: unknown,
): Promise<ActionResult<null>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };

  const parsed = UpdateProjectSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  const { id, ...rest } = parsed.data;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updates: Record<string, any> = { updatedAt: sql`now()` };
  for (const [k, v] of Object.entries(rest)) {
    if (v !== undefined) updates[k] = v;
  }

  try {
    await db
      .update(projects)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .set(updates as any)
      .where(and(eq(projects.id, id), eq(projects.userId, userId)));

    // U7: re-embed when the embed input (name or description) changed. The
    // enqueue reads the full current row, so a name-only edit still embeds both.
    // No-op unless the rung is on.
    if (rest.name !== undefined || rest.description !== undefined) {
      scheduleEntityEmbedding({ userId, entityType: "project", entityId: id });
    }

    return { success: true, data: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Database error";
    return { success: false, error: msg };
  }
}

export async function archiveProject(id: string): Promise<ActionResult<null>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };
  if (!z.string().uuid().safeParse(id).success) {
    return { success: false, error: "Invalid id" };
  }
  await db
    .update(projects)
    .set({ archivedAt: sql`now()` })
    .where(and(eq(projects.id, id), eq(projects.userId, userId)));
  return { success: true, data: null };
}

export async function unarchiveProject(
  id: string,
): Promise<ActionResult<null>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };
  if (!z.string().uuid().safeParse(id).success) {
    return { success: false, error: "Invalid id" };
  }
  await db
    .update(projects)
    .set({ archivedAt: null })
    .where(and(eq(projects.id, id), eq(projects.userId, userId)));
  return { success: true, data: null };
}

/**
 * PROJ-04: Delete project. tasks_projects + captures_projects ON DELETE CASCADE
 * means junction rows die with the project — Tasks and Captures themselves persist.
 *
 * Locked decision (Quick 260611-g2z #2): tasks/captures linked to this project lose
 * ONLY their junction-table link; the task/capture row itself persists (acts as
 * "Unassigned" in the UI). No cascade-delete of tasks or captures here.
 */
export async function deleteProject(id: string): Promise<ActionResult<null>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };
  if (!z.string().uuid().safeParse(id).success) {
    return { success: false, error: "Invalid id" };
  }
  await db.transaction(async (tx) => {
    // A project is only ever a reference TARGET (nothing on it holds tokens).
    // Its rows have no FK to cascade through, so they'd otherwise keep the
    // deleted project alive in reference counts and the graph forever. The
    // tokens naming it survive in whatever text they were typed into and
    // render as tombstones, per the sealed policy.
    await deleteReferencesForTarget(tx, { userId, targetType: "project", targetId: id });
    await tx
      .delete(projects)
      .where(and(eq(projects.id, id), eq(projects.userId, userId)));
  });
  return { success: true, data: null };
}

/**
 * D-03: drag reorder within an area. Atomic rewrite of orderIndex.
 */
const ReorderProjectsSchema = z.object({
  areaId: z.string().uuid(),
  orderedIds: z.array(z.string().uuid()).min(1),
});

export async function reorderProjects(
  input: unknown,
): Promise<ActionResult<null>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };

  const parsed = ReorderProjectsSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  await db.transaction(async (tx) => {
    for (let i = 0; i < parsed.data.orderedIds.length; i++) {
      await tx
        .update(projects)
        .set({ orderIndex: i })
        .where(
          and(
            eq(projects.id, parsed.data.orderedIds[i]!),
            eq(projects.userId, userId),
            eq(projects.areaId, parsed.data.areaId),
          ),
        );
    }
  });
  return { success: true, data: null };
}

/**
 * D-03: drag across areas — re-link to a new area, append to end of new area's order.
 */
const MoveProjectSchema = z.object({
  projectId: z.string().uuid(),
  newAreaId: z.string().uuid(),
});

export async function moveProjectToArea(
  input: unknown,
): Promise<ActionResult<null>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };

  const parsed = MoveProjectSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  const [areaRow] = await db
    .select({ id: areas.id })
    .from(areas)
    .where(and(eq(areas.id, parsed.data.newAreaId), eq(areas.userId, userId)))
    .limit(1);
  if (!areaRow) return { success: false, error: "Target area not found" };

  const [{ maxOrder }] = await db
    .select({
      maxOrder: sql<number>`COALESCE(MAX(${projects.orderIndex}), -1)`,
    })
    .from(projects)
    .where(
      and(
        eq(projects.userId, userId),
        eq(projects.areaId, parsed.data.newAreaId),
      ),
    );

  await db
    .update(projects)
    .set({ areaId: parsed.data.newAreaId, orderIndex: maxOrder + 1 })
    .where(
      and(
        eq(projects.id, parsed.data.projectId),
        eq(projects.userId, userId),
      ),
    );
  return { success: true, data: null };
}

/**
 * Auth-gated SELECT for the signed-in user's projects. queryFn target for
 * useQuery({ queryKey: tableKey("projects", userId) }) — used by Sidebar's
 * SidebarTree AND by the project detail page (B1 canonical detail-page pattern).
 *
 * CLAUDE.md Critical Pattern 1: getClaims (NOT getSession) — validates JWT.
 */
export type ProjectRow = typeof projects.$inferSelect;

export async function getProjectsForCurrentUser(): Promise<ProjectRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) throw new Error("Unauthorized");
  return db
    .select()
    .from(projects)
    .where(eq(projects.userId, data.claims.sub));
}
