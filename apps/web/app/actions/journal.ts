"use server";

import { z } from "zod";
import { and, eq, gte, lte, desc, sql } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { journalEntries } from "@/lib/db/schema";

type ActionResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string };

/**
 * CLAUDE.md Critical Pattern 1: validate the user via getClaims() — never
 * getSession() in server code. getClaims validates the JWT signature against
 * Supabase's published public keys; getSession reads cookies without
 * revalidation and is spoofable.
 */
async function getUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) return null;
  return data.claims.sub;
}

// Date schema: YYYY-MM-DD format, validated as a real calendar date.
const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD")
  .refine((s) => !isNaN(Date.parse(s)), "Invalid date");

// ─────────────────────────────────────────────────────────────────────────────
// upsertJournalEntry
// ─────────────────────────────────────────────────────────────────────────────

const UpsertJournalEntrySchema = z.object({
  date: dateSchema,
  mainResponse: z.string().max(100_000).optional(),
  notesSection: z.string().max(100_000).optional(),
  noExport: z.boolean().optional(),
});

export type JournalEntry = typeof journalEntries.$inferSelect;

/**
 * JOURNAL-SERVICE-01: upsert a journal entry for the given calendar date.
 *
 * Idempotency invariant: two calls with the same (userId, date) always produce
 * exactly one row. The second call merges — it only updates the columns that
 * were explicitly provided in the payload so a partial save (e.g. saving
 * notesSection only) never clobbers a mainResponse written by an earlier save.
 *
 * Conflict target: UNIQUE(user_id, date) (DB-level constraint from migration 0030).
 * Always includes updatedAt in the SET clause so row freshness is reliable.
 */
export async function upsertJournalEntry(
  input: unknown,
): Promise<ActionResult<JournalEntry>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };

  const parsed = UpsertJournalEntrySchema.safeParse(input);
  if (!parsed.success)
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };

  const { date, mainResponse, notesSection, noExport } = parsed.data;

  // Build the SET object from only the keys present in the payload.
  // This is the idempotency-critical block: omitting a key means ON CONFLICT
  // will not overwrite that column with NULL. updatedAt is always included so
  // row freshness stays reliable; sql`now()` is cast via `as` because Drizzle's
  // $inferInsert timestamps are typed as Date but accept SQL expressions at
  // runtime — same pattern used in updateCapture for the .set() call.
  const mergeSet: Record<string, unknown> = {
    updatedAt: sql`now()`,
  };
  if (mainResponse !== undefined) mergeSet.mainResponse = mainResponse;
  if (notesSection !== undefined) mergeSet.notesSection = notesSection;
  if (noExport !== undefined) mergeSet.noExport = noExport;

  const [row] = await db
    .insert(journalEntries)
    .values({
      userId,
      date,
      ...(mainResponse !== undefined ? { mainResponse } : {}),
      ...(notesSection !== undefined ? { notesSection } : {}),
      ...(noExport !== undefined ? { noExport } : {}),
    })
    .onConflictDoUpdate({
      target: [journalEntries.userId, journalEntries.date],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      set: mergeSet as any,
    })
    .returning();

  return { success: true, data: row };
}

// ─────────────────────────────────────────────────────────────────────────────
// getJournalEntry
// ─────────────────────────────────────────────────────────────────────────────

const GetJournalEntrySchema = z.object({
  date: dateSchema,
});

/**
 * Fetch a single journal entry for the authenticated user by calendar date.
 * Returns the row or null when no entry exists yet for that date.
 * Double predicate (userId + date) ensures row-level isolation.
 */
export async function getJournalEntry(
  input: unknown,
): Promise<ActionResult<JournalEntry | null>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };

  const parsed = GetJournalEntrySchema.safeParse(input);
  if (!parsed.success)
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };

  const [row] = await db
    .select()
    .from(journalEntries)
    .where(
      and(
        eq(journalEntries.userId, userId),
        eq(journalEntries.date, parsed.data.date),
      ),
    )
    .limit(1);

  return { success: true, data: row ?? null };
}

// ─────────────────────────────────────────────────────────────────────────────
// getJournalEntries
// ─────────────────────────────────────────────────────────────────────────────

const GetJournalEntriesSchema = z.object({
  startDate: dateSchema.optional(),
  endDate: dateSchema.optional(),
  // Default 90 days, hard-capped at 365 to prevent unbounded result sets.
  limit: z.number().int().min(1).max(365).optional().default(90),
});

/**
 * Fetch a paginated slice of journal entries for the authenticated user.
 * Results are ordered by date DESC (most recent first), mirroring the
 * captures feed ordering. startDate/endDate are both inclusive when provided.
 * Default limit: 90 rows. Hard cap: 365 rows.
 */
export async function getJournalEntries(
  input: unknown = {},
): Promise<ActionResult<JournalEntry[]>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };

  const parsed = GetJournalEntriesSchema.safeParse(input);
  if (!parsed.success)
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };

  const { startDate, endDate, limit } = parsed.data;

  const conditions = [eq(journalEntries.userId, userId)];
  if (startDate) conditions.push(gte(journalEntries.date, startDate));
  if (endDate) conditions.push(lte(journalEntries.date, endDate));

  const rows = await db
    .select()
    .from(journalEntries)
    .where(and(...conditions))
    .orderBy(desc(journalEntries.date))
    .limit(limit);

  return { success: true, data: rows };
}
