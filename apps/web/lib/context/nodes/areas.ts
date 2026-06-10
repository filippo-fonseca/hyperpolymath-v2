/**
 * Snapshot loader: areas.
 *
 * Includes ALL non-archived areas (no cap — small set per user). Areas have
 * no no_export flag (no privacy gate at the area level; sensitivity lives on
 * the row content, not the categorization).
 */

import { and, asc, eq, isNull } from "drizzle-orm";
import { db as defaultDb } from "@/lib/db";
import { areas as areasTable } from "@/lib/db/schema";
import type { Node } from "../types";

export type DB = typeof defaultDb;

export async function loadAreas(
  userId: string,
  db: DB = defaultDb,
): Promise<{ nodes: Node[]; excluded: number }> {
  const rows = await db
    .select({
      id: areasTable.id,
      name: areasTable.name,
      emoji: areasTable.emoji,
      orderIndex: areasTable.orderIndex,
    })
    .from(areasTable)
    .where(and(eq(areasTable.userId, userId), isNull(areasTable.archivedAt)))
    .orderBy(asc(areasTable.orderIndex));

  const nodes: Node[] = rows.map((r) => ({
    type: "area" as const,
    id: r.id,
    name: r.name,
    emoji: r.emoji,
    orderIndex: r.orderIndex,
  }));

  return { nodes, excluded: 0 };
}
