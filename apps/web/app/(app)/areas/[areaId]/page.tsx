import { AreaDetailClient } from "@/components/areas/AreaDetailClient";
import { requireOnboarded } from "@/lib/auth/get-user";
import { db } from "@/lib/db";
import { areas, projects } from "@/lib/db/schema";
import { and, asc, eq, isNull } from "drizzle-orm";
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
  const [areaRows, projectRows, allActiveAreas] = await Promise.all([
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
  ]);

  const [area] = areaRows;
  if (!area) notFound();

  return (
    <main className="min-h-full bg-[var(--canvas)] text-[var(--ink)]">
      <AreaDetailClient
        userId={user.id}
        area={area}
        projects={projectRows}
        allAreas={allActiveAreas}
        graduationYear={user.graduationYear}
      />
    </main>
  );
}
