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
  // Areas and projects are both keyed on userId alone; the tree is assembled
  // in memory below. One wave, not two serial trips. This helper sits on the
  // blocking path of every (app) render, more than once.
  const [areaRows, projectRows] = await Promise.all([
    db
      .select({
        id: areas.id,
        name: areas.name,
        emoji: areas.emoji,
        orderIndex: areas.orderIndex,
        archivedAt: areas.archivedAt,
        createdAt: areas.createdAt,
      })
      .from(areas)
      .where(
        includeArchived
          ? eq(areas.userId, userId)
          : and(eq(areas.userId, userId), isNull(areas.archivedAt)),
      )
      .orderBy(asc(areas.orderIndex), asc(areas.createdAt)),

    db
      .select({
        id: projects.id,
        areaId: projects.areaId,
        name: projects.name,
        icon: projects.icon,
        orderIndex: projects.orderIndex,
        isClass: projects.isClass,
        archivedAt: projects.archivedAt,
        endDate: projects.endDate,
        semesterTerm: projects.semesterTerm,
        semesterYear: projects.semesterYear,
      })
      .from(projects)
      .where(
        includeArchived
          ? eq(projects.userId, userId)
          : and(eq(projects.userId, userId), isNull(projects.archivedAt)),
      )
      .orderBy(asc(projects.orderIndex), asc(projects.createdAt)),
  ]);

  const today = todayISODate();
  const projectsByArea = new Map<string, SidebarProject[]>();
  for (const p of projectRows) {
    // Issue #55: a class past its semester, or a project past its end date,
    // counts as archived even without an explicit archivedAt. Synthesize the
    // timestamp so every tree surface (sidebar, /areas, /lifeos) — all of which
    // split active vs archived on `archivedAt` — treats it consistently.
    const effectiveArchivedAt =
      p.archivedAt ??
      (isProjectExpired(p, today)
        ? new Date(`${projectEffectiveEndISO(p)}T00:00:00Z`)
        : null);
    if (!includeArchived && effectiveArchivedAt !== null) continue;
    const list = projectsByArea.get(p.areaId) ?? [];
    list.push({
      id: p.id,
      name: p.name,
      icon: p.icon,
      orderIndex: p.orderIndex,
      isClass: p.isClass,
      archivedAt: effectiveArchivedAt,
    });
    projectsByArea.set(p.areaId, list);
  }

  return areaRows.map((a) => ({
    ...a,
    projects: projectsByArea.get(a.id) ?? [],
  }));
}
