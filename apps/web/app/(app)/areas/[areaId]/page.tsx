import { notFound } from "next/navigation";
import Link from "next/link";
import { and, eq, isNull, asc } from "drizzle-orm";
import { requireOnboarded } from "@/lib/auth/get-user";
import { db } from "@/lib/db";
import { areas, projects } from "@/lib/db/schema";
import { DynamicIcon } from "@/components/projects/DynamicIcon";
import { Breadcrumbs } from "@/components/shell/Breadcrumbs";
import { AreaDetailHeader } from "@/components/areas/AreaDetailHeader";
import { AreaProjectCardMenu } from "@/components/areas/AreaProjectCardMenu";

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

  const [area] = await db
    .select({
      id: areas.id,
      name: areas.name,
      emoji: areas.emoji,
      archivedAt: areas.archivedAt,
    })
    .from(areas)
    .where(and(eq(areas.id, areaId), eq(areas.userId, user.id)))
    .limit(1);
  if (!area) notFound();

  const projectRows = await db
    .select({
      id: projects.id,
      name: projects.name,
      icon: projects.icon,
      isClass: projects.isClass,
      courseCode: projects.courseCode,
      description: projects.description,
    })
    .from(projects)
    .where(
      and(
        eq(projects.areaId, areaId),
        eq(projects.userId, user.id),
        isNull(projects.archivedAt),
      ),
    )
    .orderBy(asc(projects.orderIndex), asc(projects.createdAt));

  // All active areas for the area picker in ProjectCreateDialog + MoveProjectDialog
  const allActiveAreas = await db
    .select({ id: areas.id, name: areas.name })
    .from(areas)
    .where(
      and(
        eq(areas.userId, user.id),
        isNull(areas.archivedAt),
      ),
    )
    .orderBy(asc(areas.orderIndex), asc(areas.createdAt));

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
          <span className="font-mono text-[11px] tabular-nums text-[var(--ink-muted)]">
            ({projectRows.length})
          </span>
        </div>

        {projectRows.length === 0 ? (
          <div className="rounded-md border border-dashed border-[var(--edge)] px-6 py-10 text-center">
            <p className="font-serif italic text-base text-[var(--ink-muted)]">
              No projects in this area yet.
            </p>
            <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--ink-muted)]/70 mt-2">
              Use the New project button above to get started.
            </p>
          </div>
        ) : (
          <ul className="grid grid-cols-1 @sm/main:grid-cols-2 @2xl/main:grid-cols-3 gap-4">
            {projectRows.map((p) => (
              <li key={p.id} className="relative group">
                <Link
                  href={`/projects/${p.id}`}
                  className="group flex flex-col gap-2 rounded-xl border border-[var(--edge)] bg-[var(--surface)] px-4 py-4 hover:border-[var(--edge-hud)] hover:bg-[var(--surface-raised)] transition-colors duration-150 ease-out cursor-pointer-always h-full"
                >
                  <div className="flex items-start gap-2.5">
                    <DynamicIcon
                      name={p.icon}
                      size={18}
                      strokeWidth={1.5}
                      className="text-[var(--ink-muted)] shrink-0 mt-0.5 group-hover:text-[var(--ink)] transition-colors"
                    />
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <span className="font-serif text-lg font-semibold text-[var(--ink)] leading-tight truncate">
                        {p.name}
                      </span>
                      {p.isClass && p.courseCode ? (
                        <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ink-muted)]">
                          {p.courseCode}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  {p.description ? (
                    <p className="font-serif text-sm text-[var(--ink-muted)] line-clamp-2">
                      {p.description}
                    </p>
                  ) : null}
                </Link>
                {/* Per-project ⋯ menu — positioned in card top-right, stops propagation */}
                <div className="absolute top-2 right-2 z-10">
                  <AreaProjectCardMenu
                    projectId={p.id}
                    projectName={p.name}
                    projectDescription={p.description}
                    projectIcon={p.icon}
                    isClass={p.isClass}
                    currentAreaId={areaId}
                    allAreas={allActiveAreas}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
