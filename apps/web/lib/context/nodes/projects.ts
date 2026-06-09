/**
 * Snapshot loader: projects.
 *
 * Includes ALL non-archived projects (no cap — typically < 50/user even with
 * classes counted). Projects carry no no_export flag (privacy lives on row
 * content; project metadata is a non-sensitive categorization layer).
 *
 * Date fields are serialized as ISO strings (Drizzle returns `Date | string`
 * for the `date` column depending on driver mode — we normalize to ISO date
 * strings, dropping the time component since projects use day-granular dates).
 */

import { and, asc, eq, isNull } from "drizzle-orm";
import { db as defaultDb } from "@/lib/db";
import { projects as projectsTable } from "@/lib/db/schema";
import type { Node } from "../types";

export type DB = typeof defaultDb;

function dateToISO(d: Date | string | null): string | null {
  if (d === null) return null;
  if (typeof d === "string") return d; // already YYYY-MM-DD
  return d.toISOString().slice(0, 10);
}

export async function loadProjects(
  userId: string,
  db: DB = defaultDb,
): Promise<{ nodes: Node[]; excluded: number }> {
  const rows = await db
    .select({
      id: projectsTable.id,
      areaId: projectsTable.areaId,
      name: projectsTable.name,
      isClass: projectsTable.isClass,
      archivedAt: projectsTable.archivedAt,
      startDate: projectsTable.startDate,
      endDate: projectsTable.endDate,
    })
    .from(projectsTable)
    .where(and(eq(projectsTable.userId, userId), isNull(projectsTable.archivedAt)))
    .orderBy(asc(projectsTable.orderIndex));

  const nodes: Node[] = rows.map((r) => ({
    type: "project" as const,
    id: r.id,
    areaId: r.areaId,
    name: r.name,
    isClass: r.isClass,
    archived: false, // we filtered isNull(archivedAt) above
    startDate: dateToISO(r.startDate),
    endDate: dateToISO(r.endDate),
  }));

  return { nodes, excluded: 0 };
}
