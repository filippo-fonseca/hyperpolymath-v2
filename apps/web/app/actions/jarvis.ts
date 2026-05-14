"use server";

/**
 * JARVIS Server Actions (Phase 5 Plan 05-02 Task 3 scaffold).
 *
 * `convertCaptureToTask` — D-14 / JARVIS-13. Wired into the UI by Plan 05-04
 * (the "Convert to task" affordance on the ⋯ menu of JARVIS-created capture
 * cards). Lands here in Wave 2 so the contract is stable before UI work.
 *
 * Behavior:
 *   1. Authenticates via getClaims() and derives userId.
 *   2. Verifies the capture exists AND belongs to the current user (RLS
 *      gates further, but explicit ownership check surfaces "not found"
 *      cleanly without leaking other-user existence).
 *   3. Inserts a task with the supplied defaults + linked projects (in one
 *      transaction with a hard-delete of the capture — captures table has
 *      no `deleted_at` column; matches Phase 2's tasks delete pattern per
 *      D-04 reconciliation).
 *   4. Returns the new taskId on success; { ok: false, error } otherwise.
 *
 * No RLS bypass — runs as the user's authed session via Drizzle on the
 * pooler. The Phase 1 RLS policies on tasks/captures/tasks_projects gate
 * the writes; the explicit userId match in the SELECT/WHERE is defense in
 * depth.
 */

import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { captures, tasks, tasksProjects } from "@/lib/db/schema";
import { createClient } from "@/lib/supabase/server";

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
