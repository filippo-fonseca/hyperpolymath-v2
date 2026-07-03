import type { NextRequest } from "next/server";

import { and, desc, eq } from "drizzle-orm";
import type {
  Routine,
  RoutineSpec,
  RoutineTriggerType,
} from "@hyperpolymath/jarvis-core/routines";
import { validateDesktopBearerIdentity } from "@/lib/auth/desktop-bearer";
import { isOwnerUser } from "@/lib/auth/owner";
import { db } from "@/lib/db";
import { routines } from "@/lib/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Jarvis-Mode",
};

type RoutineRow = typeof routines.$inferSelect;

// Row → API shape. Mirrors `toRoutine` in app/actions/routines.ts, inlined
// here because that mapper lives in a "use server" module (which may only
// export async functions), so it can't be imported into a route handler.
function toRoutine(row: RoutineRow): Routine {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    enabled: row.enabled,
    spec: row.spec as RoutineSpec,
    triggerTypes: row.triggerTypes as RoutineTriggerType[],
    nextRunAt: row.nextRunAt ? row.nextRunAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * GET /api/jarvis/routines
 *
 * Read-only, bearer-authed sync endpoint for the JARVIS desktop. Returns the
 * owner's ENABLED routines so the desktop can build its trigger registry
 * (wake/utterance phrase table, per-routine hotkeys, time scheduler).
 *
 * Auth mirrors /api/jarvis/voice/text exactly: device bearer identity +
 * owner gate (the physical bus is a single global emitter, owner-only by
 * design). `listRoutines()` in app/actions/routines.ts is getClaims()-only
 * (cookie auth) and CANNOT serve the desktop, hence this parallel route.
 *
 * Only enabled rows are returned — a disabled routine must never fire.
 */
export async function GET(req: NextRequest): Promise<Response> {
  const identity = await validateDesktopBearerIdentity(req);
  if (!identity) {
    return new Response("Unauthorized", { status: 401, headers: CORS });
  }
  const userId = identity.userId;

  // Owner-only while the physical bus is a single global emitter.
  if (!(await isOwnerUser(userId))) {
    return new Response("Forbidden", { status: 403, headers: CORS });
  }

  try {
    const rows = await db
      .select()
      .from(routines)
      .where(and(eq(routines.userId, userId), eq(routines.enabled, true)))
      .orderBy(desc(routines.updatedAt));
    return Response.json({ routines: rows.map(toRoutine) }, { headers: CORS });
  } catch (err) {
    console.error("[routines GET] failed to load routines", err);
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500, headers: CORS },
    );
  }
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS });
}
