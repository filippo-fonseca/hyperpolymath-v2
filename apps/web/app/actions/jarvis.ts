"use server";

/**
 * JARVIS Server Actions.
 *
 * Phase 5 Plan 05-02 shipped `convertCaptureToTask` (D-14 / JARVIS-13).
 * Phase 5 Plan 05-04 extends with `undoJarvisAction` — the 5s receipt undo
 * surface (D-03 / D-04).
 *
 * Both actions:
 *   1. Authenticate via getClaims() and derive userId server-side.
 *   2. NEVER trust client-supplied userIds (JARVIS-12 boundary still applies).
 *   3. Verify ownership via explicit (id, userId) WHERE before mutating.
 *
 * For undoJarvisAction:
 *   - `task` / `capture` → HARD delete (D-04 reconciliation — neither table
 *     has a `deleted_at` column; matches Phase 2's `deleteTask` pattern at
 *     apps/web/app/actions/tasks.ts:247).
 *   - `event` → gcal events.delete via the lib/gcal/* boundary.
 *     D-04 best-effort: if the user's gcal client deleted the event during
 *     the 5s window we treat 404/410 as success (already done).
 */

import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { captures, tasks, tasksProjects } from "@/lib/db/schema";
import { createClient } from "@/lib/supabase/server";
import { deleteEvent } from "@/lib/gcal/events";
import {
  getValidGcalToken,
  GcalNotConnectedError,
  GcalTokenRevokedError,
} from "@/lib/gcal/token";

// ---------------------------------------------------------------------------
// convertCaptureToTask (Plan 05-02)
// ---------------------------------------------------------------------------

const ConvertSchema = z.object({
  captureId: z.string().uuid(),
  title: z.string().min(1).max(500),
  // Priority literals match the DB enum verbatim — including the P∞ Unicode
  // glyph from HANDOFF preserved literals.
  priority: z.enum(["P∞", "P1", "P2", "P3"]).default("P3"),
  projectIds: z.array(z.string().uuid()).default([]),
});

export type ConvertCaptureToTaskInput = z.input<typeof ConvertSchema>;

export async function convertCaptureToTask(
  input: ConvertCaptureToTaskInput,
): Promise<{ ok: true; taskId: string } | { ok: false; error: string }> {
  const supabase = await createClient();
  const claimsResult = await supabase.auth.getClaims();
  if (claimsResult.error || !claimsResult.data?.claims?.sub) {
    return { ok: false, error: "Unauthorized" };
  }
  const userId = claimsResult.data.claims.sub;

  const parsed = ConvertSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.message };
  }

  const captureRows = await db
    .select({ id: captures.id })
    .from(captures)
    .where(
      and(
        eq(captures.id, parsed.data.captureId),
        eq(captures.userId, userId),
      ),
    )
    .limit(1);
  if (captureRows.length === 0) {
    return { ok: false, error: "Capture not found" };
  }

  const taskId = randomUUID();
  try {
    await db.transaction(async (tx) => {
      await tx.insert(tasks).values({
        id: taskId,
        userId,
        title: parsed.data.title,
        priority: parsed.data.priority,
        status: "not started", // DB enum literal with SPACE
      });
      if (parsed.data.projectIds.length > 0) {
        await tx.insert(tasksProjects).values(
          parsed.data.projectIds.map((pid) => ({
            taskId,
            projectId: pid,
            userId,
          })),
        );
      }
      // Hard delete the capture — captures table has no deleted_at column
      // (D-04 reconciliation). captures_projects + captures_hashtags rows
      // cascade-delete via FK ON DELETE CASCADE (schema.ts).
      await tx.delete(captures).where(eq(captures.id, parsed.data.captureId));
    });
    return { ok: true, taskId };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ---------------------------------------------------------------------------
// undoJarvisAction (Plan 05-04 Task 1 — D-03 / D-04)
// ---------------------------------------------------------------------------

const UndoTargetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("task"), id: z.string().uuid() }),
  z.object({ kind: z.literal("capture"), id: z.string().uuid() }),
  z.object({
    kind: z.literal("event"),
    id: z.string().min(1),
    calendarId: z.string().min(1),
  }),
]);

export type UndoTarget = z.infer<typeof UndoTargetSchema>;

export async function undoJarvisAction(
  target: UndoTarget,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const claimsResult = await supabase.auth.getClaims();
  if (claimsResult.error || !claimsResult.data?.claims?.sub) {
    return { ok: false, error: "Unauthorized" };
  }
  const userId = claimsResult.data.claims.sub;

  const parsed = UndoTargetSchema.safeParse(target);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.message };
  }

  try {
    if (parsed.data.kind === "task") {
      // Hard delete (B5 / D-04 reconciliation — tasks table has no
      // `deleted_at` column; matches Phase 2's `deleteTask` pattern at
      // apps/web/app/actions/tasks.ts:247).
      // Junction rows in `tasks_projects` cascade-delete via FK ON DELETE
      // CASCADE in schema.ts.
      await db
        .delete(tasks)
        .where(and(eq(tasks.id, parsed.data.id), eq(tasks.userId, userId)));
      return { ok: true };
    }

    if (parsed.data.kind === "capture") {
      // Hard delete — captures table has no `deleted_at` column either.
      // `captures_projects` + `captures_hashtags` cascade-delete via FK.
      await db
        .delete(captures)
        .where(
          and(eq(captures.id, parsed.data.id), eq(captures.userId, userId)),
        );
      return { ok: true };
    }

    // Event — gcal delete via the lib/gcal boundary. getValidGcalToken
    // returns an already-authenticated calendar_v3.Calendar (handles refresh
    // + revocation detection per Plan 04-01).
    const cal = await getValidGcalToken(userId);
    try {
      await deleteEvent(cal, parsed.data.calendarId, parsed.data.id);
    } catch (err: unknown) {
      // 404 / 410 = already deleted (D-04 best-effort: if the user's gcal
      // synced to another client in the 5s window, the canonical state on
      // gcal wins). Anything else surfaces as a failure so the client can
      // revert the optimistic flag.
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
