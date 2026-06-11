import "server-only";

/**
 * Core of the 5s receipt undo (D-03 / D-04), extracted from
 * app/actions/jarvis.ts so both auth boundaries share one implementation:
 *   - the browser Server Action (Supabase session), and
 *   - POST /api/jarvis/voice/undo (paired-device bearer token).
 *
 * Semantics unchanged:
 *   - task / capture → HARD delete with (id, userId) ownership WHERE.
 *   - event → gcal events.delete; 404/410 treated as success (the user's
 *     gcal client may have deleted it inside the 5s window).
 */

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { captures, tasks } from "@/lib/db/schema";
import { deleteEvent } from "@/lib/gcal/events";
import {
  getValidGcalToken,
  GcalNotConnectedError,
  GcalTokenRevokedError,
} from "@/lib/gcal/token";

export const UndoTargetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("task"), id: z.string().uuid() }),
  z.object({ kind: z.literal("capture"), id: z.string().uuid() }),
  z.object({
    kind: z.literal("event"),
    id: z.string().min(1),
    calendarId: z.string().min(1),
  }),
]);

export type UndoTarget = z.infer<typeof UndoTargetSchema>;

export async function undoJarvisActionForUser(
  userId: string,
  target: UndoTarget,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = UndoTargetSchema.safeParse(target);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.message };
  }

  try {
    if (parsed.data.kind === "task") {
      await db
        .delete(tasks)
        .where(and(eq(tasks.id, parsed.data.id), eq(tasks.userId, userId)));
      return { ok: true };
    }

    if (parsed.data.kind === "capture") {
      await db
        .delete(captures)
        .where(
          and(eq(captures.id, parsed.data.id), eq(captures.userId, userId)),
        );
      return { ok: true };
    }

    const cal = await getValidGcalToken(userId);
    try {
      await deleteEvent(cal, parsed.data.calendarId, parsed.data.id);
    } catch (err: unknown) {
      const code = (err as { code?: number; status?: number } | null)?.code
        ?? (err as { code?: number; status?: number } | null)?.status;
      if (code !== 404 && code !== 410) throw err;
    }
    return { ok: true };
  } catch (err) {
    if (
      err instanceof GcalTokenRevokedError ||
      err instanceof GcalNotConnectedError
    ) {
      return { ok: false, error: "Calendar disconnected" };
    }
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
