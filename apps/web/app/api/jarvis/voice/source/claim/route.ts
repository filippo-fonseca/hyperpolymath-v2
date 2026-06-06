import type { NextRequest } from "next/server";

import { claimVoiceSource, SOURCE_CLAIM_TTL_MS } from "@/lib/voice/source-claim";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Trigger-Secret",
};

export async function POST(req: NextRequest): Promise<Response> {
  const expected = process.env.PHYSICAL_TRIGGER_SECRET;
  if (!expected) {
    return Response.json(
      { error: "PHYSICAL_TRIGGER_SECRET not configured on server" },
      { status: 500, headers: CORS },
    );
  }

  const provided = req.headers.get("x-trigger-secret");
  if (!provided || provided !== expected) {
    return new Response("Unauthorized", { status: 401, headers: CORS });
  }

  claimVoiceSource();
  return Response.json({ ok: true, ttlMs: SOURCE_CLAIM_TTL_MS }, { headers: CORS });
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS });
}
