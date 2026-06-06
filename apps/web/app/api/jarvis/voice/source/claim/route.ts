import type { NextRequest } from "next/server";

import { claimVoiceSource, SOURCE_CLAIM_TTL_MS } from "@/lib/voice/source-claim";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<Response> {
  const expected = process.env.PHYSICAL_TRIGGER_SECRET;
  if (!expected) {
    return Response.json(
      { error: "PHYSICAL_TRIGGER_SECRET not configured on server" },
      { status: 500 },
    );
  }

  const provided = req.headers.get("x-trigger-secret");
  if (!provided || provided !== expected) {
    return new Response("Unauthorized", { status: 401 });
  }

  claimVoiceSource();
  return Response.json({ ok: true, ttlMs: SOURCE_CLAIM_TTL_MS });
}
