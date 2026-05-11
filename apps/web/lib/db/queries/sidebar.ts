import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { areas, projects } from "@/lib/db/schema";

export interface SidebarArea {
  id: string;
  name: string;
  emoji: string | null;
  orderIndex: number;
  archivedAt: Date | null;
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
  const areaRows = await db
    .select({
      id: areas.id,
      name: areas.name,
      emoji: areas.emoji,
      orderIndex: areas.orderIndex,
      archivedAt: areas.archivedAt,
    })
    .from(areas)
    .where(
      includeArchived
        ? eq(areas.userId, userId)
        : and(eq(areas.userId, userId), isNull(areas.archivedAt)),
    )
    .orderBy(asc(areas.orderIndex), asc(areas.createdAt));

  const projectRows = await db
    .select({
      id: projects.id,
      areaId: projects.areaId,
      name: projects.name,
      icon: projects.icon,
      orderIndex: projects.orderIndex,
      isClass: projects.isClass,
      archivedAt: projects.archivedAt,
    })
    .from(projects)
    .where(
      includeArchived
        ? eq(projects.userId, userId)
        : and(eq(projects.userId, userId), isNull(projects.archivedAt)),
    )
    .orderBy(asc(projects.orderIndex), asc(projects.createdAt));

  const projectsByArea = new Map<string, SidebarProject[]>();
  for (const p of projectRows) {
    const list = projectsByArea.get(p.areaId) ?? [];
    list.push({
      id: p.id,
      name: p.name,
      icon: p.icon,
      orderIndex: p.orderIndex,
      isClass: p.isClass,
      archivedAt: p.archivedAt,
    });
    projectsByArea.set(p.areaId, list);
  }

  return areaRows.map((a) => ({
    ...a,
    projects: projectsByArea.get(a.id) ?? [],
  }));
}
