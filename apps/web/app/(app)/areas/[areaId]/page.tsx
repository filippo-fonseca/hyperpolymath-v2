import type { AreaCaptureRow } from "@/components/areas/AreaCapturesSection";
import { AreaDetailClient } from "@/components/areas/AreaDetailClient";
import type { AreaTaskRow } from "@/components/areas/AreaTasksRollup";
import { requireOnboarded } from "@/lib/auth/get-user";
import { db } from "@/lib/db";
import { areas, captures, capturesProjects, projects, tasks, tasksProjects } from "@/lib/db/schema";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { notFound } from "next/navigation";

interface Props {
  params: Promise<{ areaId: string }>;
}

/**
 * /areas/[areaId] — single-area page: a calm register of the area's work.
 * PageScaffold header (live-bound name via the ['areas', userId] cache) over
 * the area's projects. Each project row links into its own page; per-row
 * AreaProjectCardMenu keeps Rename / Edit / Move / Delete.
 */
export default async function AreaDetailPage({ params }: Props) {
  const { areaId } = await params;
  const user = await requireOnboarded();

  // The three reads are independent (the area row, its projects, and the picker's
  // area list all key off areaId / user.id), so they go out together instead of
  // serially. Same shape as the project detail page already uses.
  const [areaRows, projectRows, allActiveAreas, taskRows, captureRows] = await Promise.all([
    db
      .select({
        id: areas.id,
        name: areas.name,
        emoji: areas.emoji,
        archivedAt: areas.archivedAt,
        // orderIndex + createdAt let the area satisfy TimelineAreaInput for the
        // timeline view (u5). Additive: the header/grid ignore them.
        orderIndex: areas.orderIndex,
        createdAt: areas.createdAt,
      })
      .from(areas)
      .where(and(eq(areas.id, areaId), eq(areas.userId, user.id)))
      .limit(1),

    // Fetch active AND archived/past — the list component partitions them into
    // Active / Archived tabs (archived hidden out of the live view, not dropped).
    // startDate / createdAt / orderIndex are additive: the grid ignores them, the
    // timeline view (u5) needs them to satisfy TimelineProjectInput. Semantics of
    // the existing consumers are untouched.
    db
      .select({
        id: projects.id,
        name: projects.name,
        icon: projects.icon,
        isClass: projects.isClass,
        courseCode: projects.courseCode,
        description: projects.description,
        startDate: projects.startDate,
        endDate: projects.endDate,
        archivedAt: projects.archivedAt,
        semesterTerm: projects.semesterTerm,
        semesterYear: projects.semesterYear,
        orderIndex: projects.orderIndex,
        createdAt: projects.createdAt,
      })
      .from(projects)
      .where(and(eq(projects.areaId, areaId), eq(projects.userId, user.id)))
      .orderBy(asc(projects.orderIndex), asc(projects.createdAt)),

    // All active areas for the area picker in ProjectCreateDialog + MoveProjectDialog
    db
      .select({ id: areas.id, name: areas.name })
      .from(areas)
      .where(and(eq(areas.userId, user.id), isNull(areas.archivedAt)))
      .orderBy(asc(areas.orderIndex), asc(areas.createdAt)),

    // The area-level tasks rollup: every task linked (via tasks_projects) to a
    // project that lives in this area. Constraining the projects join on
    // areaId keeps the query independent of the projects fetch above, so it
    // rides the same Promise.all instead of serializing behind it.
    db
      .select({
        id: tasks.id,
        title: tasks.title,
        status: tasks.status,
        dueDate: tasks.dueDate,
        projectId: projects.id,
        projectName: projects.name,
      })
      .from(tasksProjects)
      .innerJoin(tasks, eq(tasks.id, tasksProjects.taskId))
      .innerJoin(
        projects,
        and(eq(projects.id, tasksProjects.projectId), eq(projects.areaId, areaId))
      )
      .where(eq(tasksProjects.userId, user.id))
      .orderBy(asc(tasks.dueDate), asc(tasks.createdAt)),

    // Captures linked to the area's projects, newest first. Same shape as the
    // tasks rollup join; capped because the section shows a handful and points
    // to /captures for the rest.
    db
      .select({
        id: captures.id,
        content: captures.content,
        createdAt: captures.createdAt,
        projectId: projects.id,
        projectName: projects.name,
      })
      .from(capturesProjects)
      .innerJoin(captures, eq(captures.id, capturesProjects.captureId))
      .innerJoin(
        projects,
        and(eq(projects.id, capturesProjects.projectId), eq(projects.areaId, areaId))
      )
      .where(eq(capturesProjects.userId, user.id))
      .orderBy(desc(captures.createdAt))
      .limit(50),
  ]);

  const [area] = areaRows;
  if (!area) notFound();

  // A task linked to two of this area's projects comes back twice; fold the
  // join rows into one rollup row per task, collecting its in-area projects.
  const taskById = new Map<string, AreaTaskRow>();
  for (const row of taskRows) {
    const existing = taskById.get(row.id);
    if (existing) {
      existing.projects.push({ id: row.projectId, name: row.projectName });
    } else {
      taskById.set(row.id, {
        id: row.id,
        title: row.title,
        status: row.status,
        dueDate: row.dueDate,
        projects: [{ id: row.projectId, name: row.projectName }],
      });
    }
  }
  const areaTasks = [...taskById.values()];

  // Same fold for captures linked to more than one of the area's projects.
  const captureById = new Map<string, AreaCaptureRow>();
  for (const row of captureRows) {
    const existing = captureById.get(row.id);
    if (existing) {
      existing.projects.push({ id: row.projectId, name: row.projectName });
    } else {
      captureById.set(row.id, {
        id: row.id,
        content: row.content,
        createdAt: row.createdAt,
        projects: [{ id: row.projectId, name: row.projectName }],
      });
    }
  }
  const areaCaptures = [...captureById.values()];

  return (
    <main className="min-h-full bg-[var(--canvas)] text-[var(--ink)]">
      <AreaDetailClient
        userId={user.id}
        area={area}
        projects={projectRows}
        tasks={areaTasks}
        captures={areaCaptures}
        allAreas={allActiveAreas}
        graduationYear={user.graduationYear}
      />
    </main>
  );
}
