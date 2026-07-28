import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { areas, projects } from "@/lib/db/schema";
import {
  isProjectExpired,
  projectEffectiveEndISO,
  todayISODate,
} from "@/lib/projects/archive-status";

export interface SidebarArea {
  id: string;
  name: string;
  emoji: string | null;
  orderIndex: number;
  archivedAt: Date | null;
  /**
   * The tie-breaker in this query's own ORDER BY, exposed because the projects
   * timeline groups areas by the same (orderIndex, createdAt) rule and cannot
   * re-derive it from a pre-sorted array.
   */
  createdAt: Date;
  projects: SidebarProject[];
}

export interface SidebarProject {
  id: string;
  name: string;
  icon: string | null;
  orderIndex: number;
  isClass: boolean;
  archivedAt: Date | null;
}

/**
 * Returns Areas + Projects for the sidebar tree.
 * @param userId - The authenticated user's ID
 * @param includeArchived - if true, returns archived items (for "Show archived" toggle)
 */
export async function getSidebarTree(
  userId: string,
  includeArchived = false,
): Promise<SidebarArea[]> {
  // ONE round trip, not two. This helper sits on the blocking path of every
  // (app) render, so the difference is paid on every navigation.
  //
  // The areas and the projects used to be two selects issued as one wave and
  // stitched together in memory. The stitching is the same below; the join
  // just does the matching at the database. It has to be a LEFT JOIN with the
  // project predicates in the ON clause rather than the WHERE: an area whose
  // every project is archived must still come back (with no projects), and a
  // WHERE on a right-hand column would silently drop it.
  //
  // Ordering is preserved exactly. Areas keep (order_index, created_at), and
  // sorting projects by the same pair *after* the area keys reproduces the old
  // per-area order, because the old code grouped a globally sorted project list
  // by area and grouping is order-stable.
  const projectJoin = includeArchived
    ? and(eq(projects.areaId, areas.id), eq(projects.userId, userId))
    : and(
        eq(projects.areaId, areas.id),
        eq(projects.userId, userId),
        isNull(projects.archivedAt),
      );

  const rows = await db
    .select({
      areaId: areas.id,
      areaName: areas.name,
      areaEmoji: areas.emoji,
      areaOrderIndex: areas.orderIndex,
      areaArchivedAt: areas.archivedAt,
      areaCreatedAt: areas.createdAt,
      projectId: projects.id,
      projectName: projects.name,
      projectIcon: projects.icon,
      projectOrderIndex: projects.orderIndex,
      projectIsClass: projects.isClass,
      projectArchivedAt: projects.archivedAt,
      projectEndDate: projects.endDate,
      projectSemesterTerm: projects.semesterTerm,
      projectSemesterYear: projects.semesterYear,
    })
    .from(areas)
    .leftJoin(projects, projectJoin)
    .where(
      includeArchived
        ? eq(areas.userId, userId)
        : and(eq(areas.userId, userId), isNull(areas.archivedAt)),
    )
    .orderBy(
      asc(areas.orderIndex),
      asc(areas.createdAt),
      asc(projects.orderIndex),
      asc(projects.createdAt),
    );

  const today = todayISODate();
  const byArea = new Map<string, SidebarArea>();

  for (const r of rows) {
    let area = byArea.get(r.areaId);
    if (!area) {
      area = {
        id: r.areaId,
        name: r.areaName,
        emoji: r.areaEmoji,
        orderIndex: r.areaOrderIndex,
        archivedAt: r.areaArchivedAt,
        createdAt: r.areaCreatedAt,
        projects: [],
      };
      byArea.set(r.areaId, area);
    }

    // A LEFT JOIN makes every right-hand column nullable in the inferred row
    // type, so narrowing the ones this needs also handles the join miss (an
    // area with no matching project) in the same check.
    const { projectId, projectName, projectOrderIndex, projectIsClass } = r;
    if (
      projectId === null ||
      projectName === null ||
      projectOrderIndex === null ||
      projectIsClass === null
    ) {
      continue;
    }

    // Issue #55: a class past its semester, or a project past its end date,
    // counts as archived even without an explicit archivedAt. Synthesize the
    // timestamp so every tree surface (sidebar, /areas, /lifeos) — all of which
    // split active vs archived on `archivedAt` — treats it consistently.
    const expiry = {
      isClass: projectIsClass,
      endDate: r.projectEndDate,
      semesterTerm: r.projectSemesterTerm,
      semesterYear: r.projectSemesterYear,
    };
    const effectiveArchivedAt =
      r.projectArchivedAt ??
      (isProjectExpired(expiry, today)
        ? new Date(`${projectEffectiveEndISO(expiry)}T00:00:00Z`)
        : null);
    if (!includeArchived && effectiveArchivedAt !== null) continue;

    area.projects.push({
      id: projectId,
      name: projectName,
      icon: r.projectIcon,
      orderIndex: projectOrderIndex,
      isClass: projectIsClass,
      archivedAt: effectiveArchivedAt,
    });
  }

  return [...byArea.values()];
}

/**
 * The `includeArchived: false` view of a tree that was fetched with
 * `includeArchived: true`.
 *
 * The archived-inclusive tree is a strict superset of the active one, in the
 * same order, and `SidebarProject.archivedAt` already carries the *effective*
 * timestamp that the archived-excluding query filters on. So a caller that
 * needs both views can pay for one round trip and derive the other here,
 * instead of asking the database the same question twice with a different
 * WHERE. `(app)/layout.tsx` needs exactly both.
 */
export function activeSidebarTree(all: SidebarArea[]): SidebarArea[] {
  const active: SidebarArea[] = [];
  for (const area of all) {
    if (area.archivedAt !== null) continue;
    active.push({
      ...area,
      projects: area.projects.filter((p) => p.archivedAt === null),
    });
  }
  return active;
}
