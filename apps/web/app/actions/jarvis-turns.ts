"use server";

import { z } from "zod";
import { and, eq, asc, desc, lt, gte } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { jarvisTurns } from "@/lib/db/schema";
import { reconcileEntityReferencesFromText } from "@/lib/references/reconcile";

/**
 * Persisted JARVIS scrollback (Phase 7 polish).
 *
 * Two surfaces:
 *   - `saveJarvisTurn` — upsert a turn (user or assistant) by client-generated
 *     UUID. Called immediately on user submit and again when the assistant
 *     streaming completes / errors / gets undone. Idempotent by id.
 *   - `loadJarvisTurns` — fetch the recent scrollback for /today SSR
 *     hydration. Capped at 500 turns for first-paint sanity; can paginate
 *     later if needed.
 */

type ActionResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string };

const HISTORY_LIMIT = 500;

async function getUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) return null;
  return data.claims.sub;
}

const SaveJarvisTurnSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(["user", "assistant"]),
  text: z.string().nullable().optional(),
  textDelta: z.string().nullable().optional(),
  actions: z.array(z.unknown()).default([]),
  clarification: z.unknown().nullable().optional(),
  status: z.string().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  createdAt: z.string().datetime().optional(), // ISO string from client
});

export async function saveJarvisTurn(
  input: z.input<typeof SaveJarvisTurnSchema>,
): Promise<ActionResult<{ id: string }>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };

  const parsed = SaveJarvisTurnSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.message };
  }

  const row = {
    id: parsed.data.id,
    userId,
    kind: parsed.data.kind,
    text: parsed.data.text ?? null,
    textDelta: parsed.data.textDelta ?? null,
    actions: parsed.data.actions,
    clarification: parsed.data.clarification ?? null,
    status: parsed.data.status ?? null,
    errorMessage: parsed.data.errorMessage ?? null,
    ...(parsed.data.createdAt ? { createdAt: new Date(parsed.data.createdAt) } : {}),
  };

  // Which text on this turn holds reference tokens, if any.
  //
  // A user turn arrives complete on submit, so its `text` is reconciled every
  // save. An assistant turn is written repeatedly while it streams, and its
  // half-built `textDelta` ends mid-token — reconciling that would index
  // whatever prefix happened to have arrived, then thrash the rows on the next
  // save. So the assistant side waits for status='done', which is the sealed
  // reading of S3 for this flow.
  const referenceText =
    row.kind === "user"
      ? row.text
      : row.status === "done"
        ? row.textDelta
        : null;

  try {
    await db.transaction(async (tx) => {
      await tx
        .insert(jarvisTurns)
        .values(row)
        .onConflictDoUpdate({
          target: jarvisTurns.id,
          // Only the streaming/undo path needs to UPDATE — never the id, userId,
          // kind, or createdAt. Update text fields + actions + status so the
          // canonical row reflects the latest scrollback state.
          set: {
            text: row.text,
            textDelta: row.textDelta,
            actions: row.actions,
            clarification: row.clarification,
            status: row.status,
            errorMessage: row.errorMessage,
          },
        });

      if (referenceText !== null) {
        await reconcileEntityReferencesFromText(tx, {
          userId,
          sourceType: "jarvis_turn",
          sourceId: row.id,
          text: referenceText,
        });
      }
    });
    return { success: true, data: { id: row.id } };
  } catch (err) {
    console.error("[jarvis-turns] saveJarvisTurn failed", err);
    return { success: false, error: "Failed to save turn" };
  }
}

export async function loadJarvisTurns(): Promise<
  ActionResult<
    Array<{
      id: string;
      kind: "user" | "assistant";
      text: string | null;
      textDelta: string | null;
      actions: unknown[];
      clarification: unknown | null;
      status: string | null;
      errorMessage: string | null;
      createdAt: Date;
    }>
  >
> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };

  try {
    const rows = await db
      .select({
        id: jarvisTurns.id,
        kind: jarvisTurns.kind,
        text: jarvisTurns.text,
        textDelta: jarvisTurns.textDelta,
        actions: jarvisTurns.actions,
        clarification: jarvisTurns.clarification,
        status: jarvisTurns.status,
        errorMessage: jarvisTurns.errorMessage,
        createdAt: jarvisTurns.createdAt,
      })
      .from(jarvisTurns)
      .where(eq(jarvisTurns.userId, userId))
      .orderBy(asc(jarvisTurns.createdAt))
      .limit(HISTORY_LIMIT);

    return {
      success: true,
      data: rows.map((r) => ({
        ...r,
        kind: r.kind as "user" | "assistant",
        actions: (r.actions as unknown[]) ?? [],
      })),
    };
  } catch (err) {
    console.error("[jarvis-turns] loadJarvisTurns failed", err);
    return { success: false, error: "Failed to load turns" };
  }
}

type TurnRow = {
  id: string;
  kind: "user" | "assistant";
  text: string | null;
  textDelta: string | null;
  actions: unknown[];
  clarification: unknown | null;
  status: string | null;
  errorMessage: string | null;
  createdAt: Date;
};

/**
 * Paginated history fetch. Returns the most-recent `limit` turns that
 * are older than `before` (or just the most recent N if `before` is
 * omitted), in CHRONOLOGICAL order (oldest first within the page) so
 * the client can append them in render order.
 *
 * Pagination semantics:
 *   - First call: `{ limit: 10 }` → latest 10 turns
 *   - Click "See older": `{ limit: 10, before: oldestAtCursor }` → next
 *     10 turns older than that ISO timestamp
 *   - `hasMore` is true when the DB returned more rows than `limit` —
 *     we trim and use that as the signal so the client knows there's
 *     another page available
 *   - `oldestAt` is the ISO timestamp of the oldest turn in this page —
 *     pass it back as `before` for the next call
 */
const LoadHistoryPageSchema = z.object({
  before: z.string().datetime().optional(),
  limit: z.number().int().min(1).max(50).default(10),
});

export async function loadJarvisHistoryPage(
  input: z.input<typeof LoadHistoryPageSchema>,
): Promise<
  ActionResult<{
    turns: TurnRow[];
    hasMore: boolean;
    oldestAt: string | null;
  }>
> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };

  const parsed = LoadHistoryPageSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.message };
  }
  const { before, limit } = parsed.data;

  try {
    // Fetch limit+1 rows so we know whether there are more. Order DESC
    // (newest first) for the cursor query, then reverse for display.
    const whereClause = before
      ? and(eq(jarvisTurns.userId, userId), lt(jarvisTurns.createdAt, new Date(before)))
      : eq(jarvisTurns.userId, userId);

    const rows = await db
      .select({
        id: jarvisTurns.id,
        kind: jarvisTurns.kind,
        text: jarvisTurns.text,
        textDelta: jarvisTurns.textDelta,
        actions: jarvisTurns.actions,
        clarification: jarvisTurns.clarification,
        status: jarvisTurns.status,
        errorMessage: jarvisTurns.errorMessage,
        createdAt: jarvisTurns.createdAt,
      })
      .from(jarvisTurns)
      .where(whereClause)
      .orderBy(desc(jarvisTurns.createdAt))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const pageRows = rows.slice(0, limit);

    // Reverse to chronological ASC for render order.
    pageRows.reverse();

    const turns: TurnRow[] = pageRows.map((r) => ({
      ...r,
      kind: r.kind as "user" | "assistant",
      actions: (r.actions as unknown[]) ?? [],
    }));

    const oldestAt =
      turns.length > 0 ? turns[0].createdAt.toISOString() : null;

    return {
      success: true,
      data: { turns, hasMore, oldestAt },
    };
  } catch (err) {
    console.error("[jarvis-turns] loadJarvisHistoryPage failed", err);
    return { success: false, error: "Failed to load history page" };
  }
}

/**
 * Deep-link loader. Given a turn id (e.g. the assistant turn a wiki page
 * "processing run" was attached to), return that turn plus every turn AFTER
 * it, chronologically, so the client can jump straight to that point in the
 * conversation with the receipts in view. `hasMore` reports whether older
 * turns exist before the target so the "Older messages" button stays usable.
 */
const LoadHistorySinceSchema = z.object({
  turnId: z.string().uuid(),
  limit: z.number().int().min(1).max(500).default(200),
});

export async function loadJarvisHistorySince(
  input: z.input<typeof LoadHistorySinceSchema>,
): Promise<
  ActionResult<{
    turns: TurnRow[];
    hasMore: boolean;
    oldestAt: string | null;
  }>
> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };

  const parsed = LoadHistorySinceSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.message };
  }
  const { turnId, limit } = parsed.data;

  try {
    // Resolve the target turn's timestamp — scoped to this user so a guessed
    // id can't surface another user's conversation.
    const target = await db
      .select({ createdAt: jarvisTurns.createdAt })
      .from(jarvisTurns)
      .where(and(eq(jarvisTurns.userId, userId), eq(jarvisTurns.id, turnId)))
      .limit(1);
    if (target.length === 0) {
      return { success: false, error: "Turn not found" };
    }
    const since = target[0].createdAt;

    const rows = await db
      .select({
        id: jarvisTurns.id,
        kind: jarvisTurns.kind,
        text: jarvisTurns.text,
        textDelta: jarvisTurns.textDelta,
        actions: jarvisTurns.actions,
        clarification: jarvisTurns.clarification,
        status: jarvisTurns.status,
        errorMessage: jarvisTurns.errorMessage,
        createdAt: jarvisTurns.createdAt,
      })
      .from(jarvisTurns)
      .where(and(eq(jarvisTurns.userId, userId), gte(jarvisTurns.createdAt, since)))
      .orderBy(asc(jarvisTurns.createdAt))
      .limit(limit);

    // Is there anything older than the target? Drives the load-more button.
    const older = await db
      .select({ id: jarvisTurns.id })
      .from(jarvisTurns)
      .where(and(eq(jarvisTurns.userId, userId), lt(jarvisTurns.createdAt, since)))
      .limit(1);

    const turns: TurnRow[] = rows.map((r) => ({
      ...r,
      kind: r.kind as "user" | "assistant",
      actions: (r.actions as unknown[]) ?? [],
    }));

    const oldestAt =
      turns.length > 0 ? turns[0].createdAt.toISOString() : null;

    return {
      success: true,
      data: { turns, hasMore: older.length > 0, oldestAt },
    };
  } catch (err) {
    console.error("[jarvis-turns] loadJarvisHistorySince failed", err);
    return { success: false, error: "Failed to load history" };
  }
}
