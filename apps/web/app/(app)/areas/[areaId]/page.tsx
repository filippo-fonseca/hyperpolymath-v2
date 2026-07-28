import { AreaDetailHeader } from "@/components/areas/AreaDetailHeader";
import { AreaProjectList } from "@/components/areas/AreaProjectList";
import { Breadcrumbs } from "@/components/shell/Breadcrumbs";
import { requireOnboarded } from "@/lib/auth/get-user";
import { db } from "@/lib/db";
import { areas, projects } from "@/lib/db/schema";
import { and, asc, eq, isNull } from "drizzle-orm";
import { notFound } from "next/navigation";

interface Props {
  params: Promise<{ areaId: string }>;
}

/**
 * /areas/[areaId] — single-area page. Shows every project under this area
 * (active by default; archived hidden so the page reads as the live shape
 * of the area). Each project is a small card linking into its own page.
 *
 * CRUD affordances added in Quick 260611-g2z: AreaDetailHeader (Edit area +
 * New project) and per-card AreaProjectCardMenu (Rename / Edit / Move / Delete).
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
      <div className="mx-auto w-full max-w-[1080px] px-8 md:px-12 pt-6 pb-20">
        <Breadcrumbs
          className="mb-6"
          items={[
            { label: "Areas", href: "/areas" },
            { label: area.name, glyph: area.emoji ?? undefined },
          ]}
        />

        <AreaDetailHeader
          area={area}
          allAreas={allActiveAreas}
          graduationYear={user.graduationYear}
          projectCount={projectRows.length}
        />

        <div className="flex items-baseline gap-3 mb-4">
          <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">
            Projects
          </h2>
        </div>

        <AreaProjectList
          areaId={areaId}
          area={area}
          userId={user.id}
          projects={projectRows}
          allAreas={allActiveAreas}
        />
      </div>
    </main>
  );
}
