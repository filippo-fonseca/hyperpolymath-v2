import type { NextRequest } from "next/server";

import { eq } from "drizzle-orm";

import { validateDesktopBearerIdentity } from "@/lib/auth/desktop-bearer";
import { isOwnerUser } from "@/lib/auth/owner";
import { db } from "@/lib/db";
import { jarvisTurns } from "@/lib/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Jarvis-Mode",
};

/**
 * POST /api/jarvis/voice/history/clear
 *
 * Wipes the caller's persisted JARVIS conversation memory. `jarvis_turns` is
 * the source both the web console's scrollback AND the voice agent's
 * cross-turn memory (`buildRecentHistory`, a 15-minute recency window) read
 * from. Test turns fired via curl land in that same table, so a fresh desktop
 * session inherits them: the very next turn's model context is seeded with the
 * stale exchange even though nothing is painted into the HUD transcript.
 *
 * Deleting the rows here is what makes "clear conversation from scratch"
 * actually clear the conversation, not just blank the visible bubbles. The
 * desktop's Clear control calls this after emptying the transcript DOM.
 *
 * Owner-gated via the existing desktop bearer token (hpd_...), matching every
 * other paired-device voice route.
 */
export async function POST(req: NextRequest): Promise<Response> {
  const identity = await validateDesktopBearerIdentity(req);
  if (!identity) {
    return new Response("Unauthorized", { status: 401, headers: CORS });
  }
  const userId = identity.userId;

  if (!(await isOwnerUser(userId))) {
    return new Response("Forbidden", { status: 403, headers: CORS });
  }

  try {
    await db.delete(jarvisTurns).where(eq(jarvisTurns.userId, userId));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[voice/history/clear] delete failed", err);
    return Response.json({ ok: false, error: "clear-failed" }, { status: 500, headers: CORS });
  }

  return Response.json({ ok: true }, { status: 200, headers: CORS });
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS });
}
