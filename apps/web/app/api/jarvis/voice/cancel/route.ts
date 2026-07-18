// POST /api/jarvis/voice/cancel — real interrupt for the persistent-SSE voice
// path (desktop / ESP32 / mobile).
//
// The browser SSE route (/api/jarvis) aborts naturally when the client fetch is
// aborted. The voice/transcript route runs the turn fire-and-forget via
// `after()`, so a client-side stop only silenced local audio while the server
// kept streaming. This endpoint emits a `jarvis-cancel` bus event that the
// turn-abort registry (on whichever lambda is running the turn) picks up and
// uses to abort the in-flight runJarvisTurnStream.
//
// Body: { turnId?: string, all?: boolean }. The desktop barge-in does not track
// the live turnId, so it sends `{ all: true }` — safe because the physical bus
// is owner-gated single-user.

import { type NextRequest } from "next/server";

import { emitJarvisCancel } from "@/lib/voice/physical-extension/bus";
import { abortAllTurns, abortTurn } from "@/lib/jarvis/turn-abort-registry";
import { validateDesktopBearerIdentity } from "@/lib/auth/desktop-bearer";
import { constantTimeEqual } from "@/lib/auth/constant-time";
import { isOwnerUser } from "@/lib/auth/owner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Trigger-Secret",
};

export async function POST(req: NextRequest): Promise<Response> {
  // Same two callers as voice/transcript: desktop bearer (per-device token) or
  // the ESP32 trigger secret. Only the owner may drive the shared physical bus.
  const desktopIdentity = await validateDesktopBearerIdentity(req);
  const desktopUserId = desktopIdentity?.userId ?? null;
  if (desktopUserId) {
    if (!(await isOwnerUser(desktopUserId))) {
      return new Response("Forbidden", { status: 403, headers: CORS });
    }
  } else {
    const expected = process.env.PHYSICAL_TRIGGER_SECRET;
    const provided = req.headers.get("x-trigger-secret");
    if (!expected || !provided || !constantTimeEqual(provided, expected)) {
      return new Response("Unauthorized", { status: 401, headers: CORS });
    }
  }

  let body: { turnId?: unknown; all?: unknown } = {};
  try {
    body = (await req.json()) as { turnId?: unknown; all?: unknown };
  } catch {
    // Empty/invalid body → treat as cancel-all (the desktop barge-in default).
  }

  const all = body.all === true;
  const turnId = typeof body.turnId === "string" && body.turnId ? body.turnId : undefined;
  if (!all && !turnId) {
    return Response.json({ error: "turnId or all required" }, { status: 400, headers: CORS });
  }

  const at = Date.now();

  // Abort locally first (same-instance fast path), then fan out cross-instance
  // so the lambda actually running the turn aborts too. The registry listener
  // is idempotent, so double-hitting a same-instance turn is harmless.
  if (all) {
    abortAllTurns();
  } else if (turnId) {
    abortTurn(turnId);
  }
  emitJarvisCancel(all ? { all: true, at } : { turnId, at });

  return Response.json({ ok: true }, { headers: CORS });
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS });
}
