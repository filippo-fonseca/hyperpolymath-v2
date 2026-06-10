"use server";

/**
 * Server Actions for /settings/context and the privacy toggle.
 *
 * Phase 999.12 Plan 05. Two responsibilities:
 *
 *   1. Rebuild — the page currently calls `POST /api/context/rebuild` directly
 *      via fetch (the route handler shipped in Plan 04). We keep a Server
 *      Action stub here for symmetry with /settings/desktop and so a future
 *      caller (e.g., a `<form action={...}>` mount) has a typed wrapper.
 *
 *   2. setNoExportAction — flips captures.no_export / tasks.no_export /
 *      jarvis_facts.no_export. Mounted on /settings/memory in v1
 *      (CONTEXT.md locked decision). Auth always re-derived from getClaims()
 *      (CLAUDE.md Critical Pattern 1) — the client-supplied userId is never
 *      trusted; the WHERE clause scopes to the caller's userId for
 *      defense-in-depth even though RLS would also enforce it.
 */

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { captures, tasks, jarvisFacts, users } from "@/lib/db/schema";
import { buildSnapshot } from "@/lib/context/build-snapshot";
import { persistSnapshot } from "@/lib/context/persist";

type ActionResult<T = void> =
  | (T extends void ? { ok: true } : { ok: true; data: T })
  | { ok: false; error: string };

async function getUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  return data.claims.sub;
}

// ---------------------------------------------------------------------------
// rebuildSnapshotAction — symmetric Server Action wrapper around the same
// buildSnapshot + persistSnapshot pair the /api/context/rebuild route uses.
// The current Client island calls the route via fetch (mirrors the desktop
// pattern's HTTP boundary). This wrapper is kept for callers that want a
// typed Server Action surface instead.
// ---------------------------------------------------------------------------

export async function rebuildSnapshotAction(): Promise<
  ActionResult<{ snapshotDate: string; totalNodes: number; excludedNoExportCount: number }>
> {
  const userId = await getUserId();
  if (!userId) return { ok: false, error: "Unauthorized" };

  const built = await buildSnapshot(userId);
  if (!built.ok) return { ok: false, error: built.error };

  const tzRow = await db
    .select({ tz: users.timezone })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const userTimezone = tzRow[0]?.tz ?? null;

  const persisted = await persistSnapshot(userId, built.data, { userTimezone });
  if (!persisted.ok) return { ok: false, error: persisted.error };

  revalidatePath("/settings/context");
  return {
    ok: true,
    data: {
      snapshotDate: String(persisted.data.snapshotDate),
      totalNodes: built.data.meta.totalNodes,
      excludedNoExportCount: built.data.meta.excludedNoExportCount,
    },
  };
}

// ---------------------------------------------------------------------------
// setNoExportAction — flips no_export on captures / tasks / jarvis_facts.
// v1 mount: /settings/memory (jarvis_facts). Per CONTEXT.md, capture +
// task surface mounts are deferred to Phase 999.15.
// ---------------------------------------------------------------------------

const SetNoExportSchema = z.object({
  resource: z.enum(["capture", "task", "jarvis_fact"]),
  id: z.string().uuid(),
  value: z.boolean(),
});

export type NoExportResource = z.infer<typeof SetNoExportSchema>["resource"];

export async function setNoExportAction(
  resource: NoExportResource,
  id: string,
  value: boolean,
): Promise<ActionResult> {
  const userId = await getUserId();
  if (!userId) return { ok: false, error: "Unauthorized" };

  const parsed = SetNoExportSchema.safeParse({ resource, id, value });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.message };
  }

  try {
    if (parsed.data.resource === "capture") {
      await db
        .update(captures)
        .set({ noExport: parsed.data.value })
        .where(and(eq(captures.id, parsed.data.id), eq(captures.userId, userId)));
    } else if (parsed.data.resource === "task") {
      await db
        .update(tasks)
        .set({ noExport: parsed.data.value })
        .where(and(eq(tasks.id, parsed.data.id), eq(tasks.userId, userId)));
    } else {
      await db
        .update(jarvisFacts)
        .set({ noExport: parsed.data.value })
        .where(and(eq(jarvisFacts.id, parsed.data.id), eq(jarvisFacts.userId, userId)));
    }
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Update failed",
    };
  }
}
