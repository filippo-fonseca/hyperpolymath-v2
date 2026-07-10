/**
 * refresh.ts — the Briefing refresh orchestrator.
 *
 * Ingests every source, curates them through gpt-4o-mini, and persists the
 * result as a single dated edition per user. The (user_id, edition_date) unique
 * index makes the edition an idempotent upsert: re-running for the same day
 * replaces that day's edition and its items in place (delete-then-bulk-insert)
 * rather than accumulating duplicates.
 *
 * Items are ordered globally by BRIEFING_SECTION_ORDER (top_story first), and
 * within a section by curation order, so orderIndex alone drives render order.
 *
 * Node runtime. If curation has no OPENAI_API_KEY it throws; that propagates to
 * the caller so the API/cron layer can surface a 503.
 */

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { briefingEditions, briefingItems } from "@/lib/db/schema";
import { ingestAllSources } from "@/lib/briefing/sources";
import { curateBriefing } from "@/lib/briefing/curate";
import {
  BRIEFING_SECTION_ORDER,
  type BriefingSection,
  type CuratedItem,
} from "@/lib/briefing/types";

/** Rank map for a section's position in the global order (lower = earlier). */
const SECTION_RANK: Record<BriefingSection, number> = BRIEFING_SECTION_ORDER.reduce(
  (acc, section, i) => {
    acc[section] = i;
    return acc;
  },
  {} as Record<BriefingSection, number>,
);

/**
 * Sort curated items into their final render order: by section (per
 * BRIEFING_SECTION_ORDER), preserving the curator's within-section ordering as
 * the stable tiebreaker.
 */
function orderItems(items: CuratedItem[]): CuratedItem[] {
  return items
    .map((item, i) => ({ item, i }))
    .sort((a, b) => {
      const ra = SECTION_RANK[a.item.section] ?? BRIEFING_SECTION_ORDER.length;
      const rb = SECTION_RANK[b.item.section] ?? BRIEFING_SECTION_ORDER.length;
      return ra !== rb ? ra - rb : a.i - b.i;
    })
    .map((entry) => entry.item);
}

/**
 * Run the full ingest → curate → persist pipeline for one user and return the
 * edition id and how many items were stored. Throws if curation is unconfigured.
 */
export async function runBriefingRefresh(
  userId: string,
): Promise<{ editionId: string; itemCount: number }> {
  const raw = await ingestAllSources();
  const edition = await curateBriefing(raw);

  const ordered = orderItems(edition.items);
  const editionDate = new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC

  // UPSERT the edition on (user_id, edition_date). generatedAt/updatedAt are
  // bumped on every refresh so getLatestBriefing sees the freshest run first.
  const upserted = await db
    .insert(briefingEditions)
    .values({
      userId,
      editionDate,
      headline: edition.headline,
      summary: edition.summary,
      model: "gpt-4o-mini",
      itemCount: ordered.length,
      rawSourceCount: raw.length,
      status: "ready",
    })
    .onConflictDoUpdate({
      target: [briefingEditions.userId, briefingEditions.editionDate],
      set: {
        headline: edition.headline,
        summary: edition.summary,
        model: "gpt-4o-mini",
        itemCount: ordered.length,
        rawSourceCount: raw.length,
        status: "ready",
        generatedAt: new Date(),
        updatedAt: new Date(),
      },
    })
    .returning({ id: briefingEditions.id });

  const editionId = upserted[0].id;

  // Replace this edition's items cleanly: clear any prior run, then bulk-insert.
  await db.delete(briefingItems).where(eq(briefingItems.editionId, editionId));

  if (ordered.length > 0) {
    await db.insert(briefingItems).values(
      ordered.map((item, orderIndex) => ({
        userId,
        editionId,
        section: item.section,
        title: item.title,
        summary: item.summary,
        url: item.url,
        sourceName: item.sourceName,
        score: item.score,
        orderIndex,
        meta: item.meta ?? null,
      })),
    );
  }

  return { editionId, itemCount: ordered.length };
}
