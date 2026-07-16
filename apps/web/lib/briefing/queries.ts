/**
 * queries.ts — read side of the Briefing feature.
 *
 * Returns the caller's most recent edition (by generatedAt) plus its items in
 * render order (orderIndex asc). Shapes are trimmed to exactly what the UI needs
 * and timestamps are serialized to ISO strings so the payload is plain JSON.
 */

import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { briefingEditions, briefingItems } from "@/lib/db/schema";
import type { BriefingItemMeta, BriefingSection } from "@/lib/briefing/types";

/** The current edition's header row, or null when the user has none yet. */
export interface EditionRow {
  id: string;
  editionDate: string;
  headline: string;
  summary: string;
  model: string;
  itemCount: number;
  /** ISO 8601 timestamp of when this edition was generated. */
  generatedAt: string;
  status: string;
}

/** One curated story as served to the UI. */
export interface BriefingItemRow {
  id: string;
  section: BriefingSection;
  title: string;
  summary: string;
  url: string | null;
  sourceName: string;
  score: number;
  orderIndex: number;
  meta: BriefingItemMeta | null;
}

/** The full read payload for the Briefing page. */
export interface BriefingPayload {
  edition: EditionRow | null;
  items: BriefingItemRow[];
}

/**
 * Load the user's latest briefing edition and its ordered items. Returns an
 * empty payload (edition null, items []) when the user has no editions yet.
 */
export async function getLatestBriefing(userId: string): Promise<BriefingPayload> {
  const editionRows = await db
    .select({
      id: briefingEditions.id,
      editionDate: briefingEditions.editionDate,
      headline: briefingEditions.headline,
      summary: briefingEditions.summary,
      model: briefingEditions.model,
      itemCount: briefingEditions.itemCount,
      generatedAt: briefingEditions.generatedAt,
      status: briefingEditions.status,
    })
    .from(briefingEditions)
    .where(eq(briefingEditions.userId, userId))
    .orderBy(desc(briefingEditions.generatedAt))
    .limit(1);

  const row = editionRows[0];
  if (!row) return { edition: null, items: [] };

  const edition: EditionRow = {
    ...row,
    generatedAt: row.generatedAt.toISOString(),
  };

  const itemRows = await db
    .select({
      id: briefingItems.id,
      section: briefingItems.section,
      title: briefingItems.title,
      summary: briefingItems.summary,
      url: briefingItems.url,
      sourceName: briefingItems.sourceName,
      score: briefingItems.score,
      orderIndex: briefingItems.orderIndex,
      meta: briefingItems.meta,
    })
    .from(briefingItems)
    .where(eq(briefingItems.editionId, row.id))
    .orderBy(briefingItems.orderIndex);

  const items: BriefingItemRow[] = itemRows.map((it) => ({
    ...it,
    section: it.section as BriefingSection,
    meta: it.meta ?? null,
  }));

  return { edition, items };
}
