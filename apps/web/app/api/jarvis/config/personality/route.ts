import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";

import { DEFAULT_PERSONALITY_CONFIG } from "@hyperpolymath/jarvis-core";
import { validateDesktopBearer } from "@/lib/auth/desktop-bearer";
import { db } from "@/lib/db";
import { jarvisPersonalityConfig } from "@/lib/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

/**
 * GET /api/jarvis/config/personality
 *
 * Bearer-auth (paired-device) read of the user's JARVIS personality config.
 * Web is the source of truth; the desktop reads this to mirror the spoken-voice
 * tuning. Returns DEFAULT_PERSONALITY_CONFIG (today's canon voice) when the
 * user has no row. Auth mirrors /api/jarvis/voice/context (validateDesktopBearer).
 */
export async function GET(req: NextRequest): Promise<Response> {
  const userId = await validateDesktopBearer(req);
  if (!userId) {
    return new Response("Unauthorized", { status: 401, headers: CORS });
  }

  const [row] = await db
    .select()
    .from(jarvisPersonalityConfig)
    .where(eq(jarvisPersonalityConfig.userId, userId))
    .limit(1);

  const config = row
    ? {
        preset: row.preset,
        formality: row.formality,
        verbosity: row.verbosity,
        wit: row.wit,
        customInstructions: row.customInstructions ?? null,
      }
    : { ...DEFAULT_PERSONALITY_CONFIG };

  return Response.json(config, { headers: CORS });
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS });
}
