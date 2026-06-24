import { db } from "@/lib/db";
import { journalEntries } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";

export interface JournalEntryRow {
  id: string;
  date: string;
  mainResponse: string | null;
  notesSection: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Index a year of daily entries (one row per calendar day at most). */
const JOURNAL_LIMIT = 365;

/**
 * All journal entries for a user, most-recent day first. Server-only query
 * shared by the global-search snapshot so search never drifts from the
 * /journaling page. Mirrors the journal server action's getMany ordering;
 * lives here (not in the `"use server"` actions module) so the server-only
 * snapshot can import it without pulling in an action surface.
 */
export async function getJournalEntriesForUser(
  userId: string,
): Promise<JournalEntryRow[]> {
  return db
    .select({
      id: journalEntries.id,
      date: journalEntries.date,
      mainResponse: journalEntries.mainResponse,
      notesSection: journalEntries.notesSection,
      createdAt: journalEntries.createdAt,
      updatedAt: journalEntries.updatedAt,
    })
    .from(journalEntries)
    .where(eq(journalEntries.userId, userId))
    .orderBy(desc(journalEntries.date))
    .limit(JOURNAL_LIMIT);
}
