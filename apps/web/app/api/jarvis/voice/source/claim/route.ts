import type { NextRequest } from "next/server";

import { claimVoiceSource, SOURCE_CLAIM_TTL_MS } from "@/lib/voice/source-claim";
import { validateDesktopBearer } from "@/lib/auth/desktop-bearer";
import { constantTimeEqual } from "@/lib/auth/constant-time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Trigger-Secret",
};

export async function POST(req: NextRequest): Promise<Response> {
  const desktopUserId = await validateDesktopBearer(req);
  if (!desktopUserId) {
    const expected = process.env.PHYSICAL_TRIGGER_SECRET;
    const provided = req.headers.get("x-trigger-secret");
    if (!expected || !provided || !constantTimeEqual(provided, expected)) {
      return new Response("Unauthorized", { status: 401, headers: CORS });
    }
  }

  claimVoiceSource();
  return Response.json({ ok: true, ttlMs: SOURCE_CLAIM_TTL_MS }, { headers: CORS });
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS });
}
