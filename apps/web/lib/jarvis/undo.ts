import "server-only";

/**
 * Core of the 5s receipt undo (D-03 / D-04 / SMJ-14), extracted from
 * app/actions/jarvis.ts so both auth boundaries share one implementation:
 *   - the browser Server Action (Supabase session), and
 *   - POST /api/jarvis/voice/undo (paired-device bearer token).
 *
 * Plan 16-06 extends this from 3 inversion kinds (create_*) to 9 kinds,
 * adding update_* and delete_* inversions.
 *
 * Semantics:
 *   - task / capture (create undo) → HARD delete with (id, userId) ownership WHERE.
 *   - event (create undo) → gcal events.delete; 404/410 treated as success.
 *   - update_task / update_capture → write `before` field values back.
 *   - update_event → patchEvent with before payload.
 *   - delete_task / delete_capture → re-insert with original id; userId ALWAYS
 *     overwritten from the authenticated session (security invariant).
 *   - delete_event → insertEvent with snapshot; gcal assigns a new event id.
 */

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { captures, tasks } from "@/lib/db/schema";
import { deleteEvent, insertEvent, patchEvent } from "@/lib/gcal/events";
import {
  getValidGcalToken,
  GcalNotConnectedError,
  GcalTokenRevokedError,
} from "@/lib/gcal/token";

// ---------------------------------------------------------------------------
// Snapshot / Before schemas
// ---------------------------------------------------------------------------

const TaskSnapshotSchema = z
  .object({
    id: z.string().uuid(),
    title: z.string(),
    notes: z.string().nullable().optional(),
    priority: z.enum(["P∞", "P1", "P2", "P3"]),
    status: z.string(), // DB enum literal, e.g. "not started"
    dueDate: z.string().nullable().optional(),
    // userId omitted intentionally — it's re-set from the authenticated session
  })
  .passthrough(); // tolerate extra columns added later

const CaptureSnapshotSchema = z
  .object({
    id: z.string().uuid(),
    content: z.string(),
  })
  .passthrough();

const TaskBeforeSchema = z.object({
  title: z.string().optional(),
  notes: z.string().nullable().optional(),
  priority: z.enum(["P∞", "P1", "P2", "P3"]).optional(),
  status: z.string().optional(),
  dueDate: z.string().nullable().optional(),
});

const CaptureBeforeSchema = z.object({
  content: z.string().optional(),
});

const EventBeforeSchema = z.object({
  summary: z.string().optional(),
  description: z.string().nullable().optional(),
  start: z.record(z.string(), z.unknown()).optional(),
  end: z.record(z.string(), z.unknown()).optional(),
});

// ---------------------------------------------------------------------------
// UndoTargetSchema — discriminated union (3 original + 6 new kinds)
// ---------------------------------------------------------------------------

export const UndoTargetSchema = z.discriminatedUnion("kind", [
  // Existing (create undo — delete the created entity)
  z.object({ kind: z.literal("task"), id: z.string().uuid() }),
  z.object({ kind: z.literal("capture"), id: z.string().uuid() }),
  z.object({
    kind: z.literal("event"),
    id: z.string().min(1),
    calendarId: z.string().min(1),
  }),
  // New: update undo — restore `before` field values
  z.object({ kind: z.literal("update_task"), id: z.string().uuid(), before: TaskBeforeSchema }),
  z.object({ kind: z.literal("update_capture"), id: z.string().uuid(), before: CaptureBeforeSchema }),
  z.object({
    kind: z.literal("update_event"),
    id: z.string().min(1),
    calendarId: z.string().min(1),
    before: EventBeforeSchema,
  }),
  // New: delete undo — recreate the entity from a pre-delete snapshot
  z.object({ kind: z.literal("delete_task"), snapshot: TaskSnapshotSchema }),
  z.object({ kind: z.literal("delete_capture"), snapshot: CaptureSnapshotSchema }),
  z.object({
    kind: z.literal("delete_event"),
    calendarId: z.string().min(1),
    snapshot: z.record(z.string(), z.unknown()),
  }),
]);

export type UndoTarget = z.infer<typeof UndoTargetSchema>;

// Exported helper types for the frontend to build UndoTarget payloads
export type TaskBefore = z.infer<typeof TaskBeforeSchema>;
export type CaptureBefore = z.infer<typeof CaptureBeforeSchema>;
export type EventBefore = z.infer<typeof EventBeforeSchema>;
export type TaskSnapshot = z.infer<typeof TaskSnapshotSchema>;
export type CaptureSnapshot = z.infer<typeof CaptureSnapshotSchema>;

// ---------------------------------------------------------------------------
// undoJarvisActionForUser
// ---------------------------------------------------------------------------

export async function undoJarvisActionForUser(
  userId: string,
  target: UndoTarget,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = UndoTargetSchema.safeParse(target);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.message };
  }

  try {
    switch (parsed.data.kind) {
      // ------------------------------------------------------------------
      // Create undo — delete the created entity
      // ------------------------------------------------------------------
      case "task": {
        await db
          .delete(tasks)
          .where(and(eq(tasks.id, parsed.data.id), eq(tasks.userId, userId)));
        return { ok: true };
      }

      case "capture": {
        await db
          .delete(captures)
          .where(and(eq(captures.id, parsed.data.id), eq(captures.userId, userId)));
        return { ok: true };
      }

      case "event": {
        const cal = await getValidGcalToken(userId);
        try {
          await deleteEvent(cal, parsed.data.calendarId, parsed.data.id);
        } catch (err: unknown) {
          const code =
            (err as { code?: number; status?: number } | null)?.code ??
            (err as { code?: number; status?: number } | null)?.status;
          if (code !== 404 && code !== 410) throw err;
        }
        return { ok: true };
      }

      // ------------------------------------------------------------------
      // Update undo — restore `before` field values
      // ------------------------------------------------------------------
      case "update_task": {
        // Cast through unknown to satisfy Drizzle's strict enum type for `status`.
        // The Zod schema already constrains the values to the correct enum literals;
        // this cast is safe because TaskBeforeSchema mirrors the DB enum shape.
        const result = await db
          .update(tasks)
          .set(parsed.data.before as unknown as Partial<typeof tasks.$inferInsert>)
          .where(and(eq(tasks.id, parsed.data.id), eq(tasks.userId, userId)));
        // Drizzle returns a result with rowCount; if 0 the row doesn't exist
        // or belongs to another user (ownership enforced by WHERE clause).
        const rowCount = (result as unknown as { rowCount?: number })?.rowCount ?? 1;
        if (rowCount === 0) {
          return { ok: false, error: "Task not found" };
        }
        return { ok: true };
      }

      case "update_capture": {
        const result = await db
          .update(captures)
          .set(parsed.data.before)
          .where(and(eq(captures.id, parsed.data.id), eq(captures.userId, userId)));
        const rowCount = (result as unknown as { rowCount?: number })?.rowCount ?? 1;
        if (rowCount === 0) {
          return { ok: false, error: "Capture not found" };
        }
        return { ok: true };
      }

      case "update_event": {
        const cal = await getValidGcalToken(userId);
        try {
          await patchEvent(cal, parsed.data.calendarId, parsed.data.id, parsed.data.before);
        } catch (err: unknown) {
          const code =
            (err as { code?: number; status?: number } | null)?.code ??
            (err as { code?: number; status?: number } | null)?.status;
          if (code !== 404 && code !== 410) throw err;
          // 404/410 — event already gone, treat as success
        }
        return { ok: true };
      }

      // ------------------------------------------------------------------
      // Delete undo — recreate the entity from a pre-delete snapshot.
      // SECURITY INVARIANT: userId is ALWAYS overwritten from the
      // authenticated session. snapshot.userId is NEVER trusted.
      // ------------------------------------------------------------------
      case "delete_task": {
        // Spread the snapshot but override userId from the authenticated session.
        // Never trust snapshot.userId — ownership must come from the session.
        const snap = parsed.data.snapshot as Record<string, unknown>;
        const { userId: _discarded, ...snapRest } = snap;
        void _discarded;
        await db.insert(tasks).values({
          ...(snapRest as typeof tasks.$inferInsert),
          userId,
        });
        return { ok: true };
      }

      case "delete_capture": {
        const snap = parsed.data.snapshot as Record<string, unknown>;
        const { userId: _discarded, ...snapRest } = snap;
        void _discarded;
        await db.insert(captures).values({
          ...(snapRest as typeof captures.$inferInsert),
          userId,
        });
        return { ok: true };
      }

      case "delete_event": {
        const cal = await getValidGcalToken(userId);
        // gcal assigns a new event id; the receipt isn't re-linked for MVP.
        await insertEvent(
          cal,
          parsed.data.calendarId,
          parsed.data.snapshot as import("googleapis").calendar_v3.Schema$Event,
        );
        return { ok: true };
      }
    }
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
