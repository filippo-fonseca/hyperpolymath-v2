import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";

import { DEFAULT_STARTUP_CONFIG } from "@hyperpolymath/jarvis-core";
import { validateDesktopBearer } from "@/lib/auth/desktop-bearer";
import { db } from "@/lib/db";
import { jarvisStartupConfig } from "@/lib/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

/**
 * GET /api/jarvis/config/startup
 *
 * Bearer-auth (paired-device) read of the user's JARVIS startup config —
 * briefing-on-launch flag, URLs/apps to open, and Shortcuts to run at startup.
 * The desktop reads this at boot to drive its startup sequence. Web is the
 * source of truth; returns DEFAULT_STARTUP_CONFIG (briefing OFF / opt-in, empty
 * lists) when the user has no row. Auth mirrors /api/jarvis/voice/context.
 */
export async function GET(req: NextRequest): Promise<Response> {
  const userId = await validateDesktopBearer(req);
  if (!userId) {
    return new Response("Unauthorized", { status: 401, headers: CORS });
  }

  const [row] = await db
    .select()
    .from(jarvisStartupConfig)
    .where(eq(jarvisStartupConfig.userId, userId))
    .limit(1);

  const config = row
    ? {
        briefingEnabled: row.briefingEnabled,
        openOnStart: row.openOnStart,
        startupShortcuts: row.startupShortcuts,
      }
    : { ...DEFAULT_STARTUP_CONFIG };

  return Response.json(config, { headers: CORS });
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS });
}
