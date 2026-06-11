import type { NextRequest } from "next/server";

import { validateDesktopBearer } from "@/lib/auth/desktop-bearer";
import { undoJarvisActionForUser, type UndoTarget } from "@/lib/jarvis/undo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

/**
 * POST /api/jarvis/voice/undo
 *
 * Paired-device twin of the undoJarvisAction Server Action — the 5s receipt
 * undo from the mobile app. Body is an UndoTarget; the shared core enforces
 * (id, userId) ownership.
 */
export async function POST(req: NextRequest): Promise<Response> {
  const userId = await validateDesktopBearer(req);
  if (!userId) {
    return new Response("Unauthorized", { status: 401, headers: CORS });
  }

  let target: UndoTarget;
  try {
    target = (await req.json()) as UndoTarget;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400, headers: CORS });
  }

  const result = await undoJarvisActionForUser(userId, target);
  return Response.json(result, { status: result.ok ? 200 : 400, headers: CORS });
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS });
}
