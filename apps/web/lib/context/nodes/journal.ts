/**
 * Snapshot loader: journal entries.
 *
 * Cap: 365 most-recent journal entries where no_export=false, ordered by date
 * descending. One entry per calendar day — the cap covers a full year of daily
 * journaling before truncating.
 *
 * Privacy gate: rows with no_export=true are skipped and counted as excluded
 * (JOURNAL-NOEXPORT-01). This mirrors the captures loader gate exactly.
 */

import { db as defaultDb } from "@/lib/db";
import { journalEntries } from "@/lib/db/schema";
import type { Node } from "../types";
import { eq, desc } from "drizzle-orm";

export type DB = typeof defaultDb;

const JOURNAL_CAP = 365; // match captures' cap discipline

export async function loadJournalEntries(
  userId: string,
  db: DB = defaultDb,
): Promise<{ nodes: Node[]; excluded: number }> {
  const rows = await db
    .select()
    .from(journalEntries)
    .where(eq(journalEntries.userId, userId))
    .orderBy(desc(journalEntries.date))
    .limit(JOURNAL_CAP);

  const nodes: Node[] = [];
  let excluded = 0;

  for (const r of rows) {
    if (r.noExport) { excluded++; continue; } // privacy gate — JOURNAL-NOEXPORT-01
    nodes.push({
      type: "journal_entry",
      id: r.id,
      date: r.date,
      mainResponse: r.mainResponse ?? null,
      notesSection: r.notesSection ?? null,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
    });
  }

  return { nodes, excluded };
}
