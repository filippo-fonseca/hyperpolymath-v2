import { and, eq } from "drizzle-orm";
import type { NextRequest } from "next/server";

import { validateDesktopBearer } from "@/lib/auth/desktop-bearer";
import { db } from "@/lib/db";
import { jarvisTurns } from "@/lib/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

/**
 * GET /api/jarvis/voice/turn?id=<turnId>
 *
 * Reconciliation fallback for paired devices: when the SSE stream drops
 * mid-turn (backgrounded app, flaky network), the device polls the
 * persisted assistant turn by id and back-fills text/actions/status.
 * Both voice/transcript and voice/text persist assistant turns under the
 * same turnId they stream over the bus.
 */
export async function GET(req: NextRequest): Promise<Response> {
  const userId = await validateDesktopBearer(req);
  if (!userId) {
    return new Response("Unauthorized", { status: 401, headers: CORS });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return Response.json({ error: "Missing or invalid id" }, { status: 400, headers: CORS });
  }

  const rows = await db
    .select({
      status: jarvisTurns.status,
      textDelta: jarvisTurns.textDelta,
      actions: jarvisTurns.actions,
      errorMessage: jarvisTurns.errorMessage,
    })
    .from(jarvisTurns)
    .where(and(eq(jarvisTurns.id, id), eq(jarvisTurns.userId, userId)))
    .limit(1);

  const row = rows[0];
  if (!row) {
    // Turn not persisted yet (still streaming, or never started).
    return Response.json({ status: "pending" }, { headers: CORS });
  }

  return Response.json(
    {
      status: row.status ?? "pending",
      text: row.textDelta ?? "",
      actions: row.actions ?? [],
      errorMessage: row.errorMessage,
    },
    { headers: CORS },
  );
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS });
}
