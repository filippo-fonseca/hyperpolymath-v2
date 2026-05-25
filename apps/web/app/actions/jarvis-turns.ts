"use server";

import { z } from "zod";
import { and, eq, asc } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { jarvisTurns } from "@/lib/db/schema";

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

  try {
    await db
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

// Silence unused-import warning for `and` — kept available for future
// filtered queries (e.g., by date range).
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _unusedAnd = and;
